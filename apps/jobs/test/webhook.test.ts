import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { signLink } from '../src/crypto';
import { balance } from '../src/pro/credits';
import { attachSession, createPurchase } from '../src/pro/purchases';
import { stripeWebhook } from '../src/webhook';
import { envWith, letters, recordingQueue, signIn, testEnv } from './env';
import { seedOrder } from './seed';

const SECRET = 'whsec_test_fake';

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** A webhook request as Stripe sends it; `signatures` replaces the v1 list (rotation tests). */
async function signed(event: unknown, opts: { signatures?: string[]; age?: number } = {}): Promise<Request> {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000) - (opts.age ?? 0);
  const v1 = opts.signatures ?? [await hmac(SECRET, `${t}.${payload}`)];
  const header = [`t=${t}`, ...v1.map((s) => `v1=${s}`), 'v0=deadbeef'].join(',');
  return new Request('https://jobs.test/v1/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': header }, body: payload });
}

const send = async (event: unknown) => SELF.fetch(await signed(event));

const event = (type: string, object: Record<string, unknown>) => ({ id: `evt_${crypto.randomUUID()}`, type, data: { object } });

const paidSession = (orderId: string, jobId: string, o: Record<string, unknown> = {}) =>
  event('checkout.session.completed', {
    id: `cs_${orderId}`,
    object: 'checkout.session',
    payment_status: 'paid',
    payment_intent: `pi_${orderId}`,
    amount_subtotal: 1900,
    currency: 'eur',
    metadata: { order_id: orderId, job_id: jobId },
    ...o,
  });

const refund = (pi: string) =>
  event('charge.refunded', { id: `ch_${pi}`, object: 'charge', payment_intent: pi, refunded: true, amount_refunded: 1900 });
const dispute = (type: 'charge.dispute.created' | 'charge.dispute.closed', pi: string, id: string, status = 'needs_response') =>
  event(type, { id, object: 'dispute', payment_intent: pi, charge: `ch_${pi}`, status });

/** A shopper's order waiting for its payment of 19.00 EUR. */
async function pendingOrder(name: string) {
  const seeded = await seedOrder({ pro: false, name });
  await testEnv.DB.prepare("UPDATE orders SET status = 'pending', amount_minor = 1900, currency = 'EUR' WHERE id = ?")
    .bind(seeded.orderId)
    .run();
  return seeded;
}

const order = (id: string) =>
  testEnv.DB.prepare('SELECT status, hold, stripe_payment_intent FROM orders WHERE id = ?').bind(id).first<{
    status: string;
    hold: string | null;
    stripe_payment_intent: string | null;
  }>();

const alerts = async (id: string) => (await letters('owner@alerts.test')).filter((l) => l.text.includes(id));

describe("a shopper's payment", () => {
  it('queues the document, and nothing more once the job has run, however often the event comes', async () => {
    const { orderId, jobId } = await pendingOrder('Платит');
    const { env, sent } = recordingQueue();
    const first = await stripeWebhook(await signed(paidSession(orderId, jobId)), env);
    expect(await first.json()).toMatchObject({ queued: true });
    expect(sent).toEqual([{ jobId }]);
    expect(await order(orderId)).toMatchObject({ status: 'paid', hold: null, stripe_payment_intent: `pi_${orderId}` });

    await testEnv.DB.prepare("UPDATE jobs SET status = 'running', attempts = 1 WHERE id = ?").bind(jobId).run();
    const again = await stripeWebhook(await signed(paidSession(orderId, jobId)), env);
    expect(await again.json()).toMatchObject({ queued: false, order: 'already' });
    expect(sent).toHaveLength(1);
  });

  it('queues the job when Stripe repeats the event after the first queuing failed', async () => {
    const { orderId, jobId } = await pendingOrder('Очередь упала');
    const broken = envWith('JOBS', { send: async () => Promise.reject(new Error('queue down')) });
    await expect(stripeWebhook(await signed(paidSession(orderId, jobId)), broken)).rejects.toThrow('queue down');
    expect(await order(orderId)).toMatchObject({ status: 'paid' });

    const { env, sent } = recordingQueue();
    const retried = await stripeWebhook(await signed(paidSession(orderId, jobId)), env);
    expect(await retried.json()).toMatchObject({ queued: true });
    expect(sent).toEqual([{ jobId }]);
  });

  it('holds an order paid with another amount or currency, queues nothing and tells the owner', async () => {
    for (const wrong of [{ amount_subtotal: 100 }, { currency: 'usd' }, { amount_subtotal: undefined }]) {
      const { orderId, jobId } = await pendingOrder('Не та сумма');
      const { env, sent } = recordingQueue();
      const response = await stripeWebhook(await signed(paidSession(orderId, jobId, wrong)), env);
      expect(await response.json()).toMatchObject({ queued: false, order: 'mismatch' });
      expect(sent).toEqual([]);
      expect(await order(orderId)).toMatchObject({ status: 'pending', hold: 'amount_mismatch' });
      const [alert] = await alerts(orderId);
      expect(alert?.subject).toContain('wrong amount');
      expect(alert?.text).not.toContain('Не та сумма');

      const status = await SELF.fetch(
        `https://jobs.test/v1/jobs/${await signLink('order', { order: orderId, job: jobId }, testEnv.LINK_KEY, 60)}`,
        { headers: { 'x-site-key': 'test-site-key' } },
      );
      expect(await status.json()).toMatchObject({ order_status: 'failed', paid: false });
    }
  });

  it('takes the currency in either case', async () => {
    const { orderId, jobId } = await pendingOrder('Валюта');
    const { env, sent } = recordingQueue();
    await stripeWebhook(await signed(paidSession(orderId, jobId, { currency: 'EUR' })), env);
    expect(sent).toHaveLength(1);
  });

  it('tells the owner about a second payment for a settled order', async () => {
    const { orderId, jobId } = await pendingOrder('Дважды');
    const { env, sent } = recordingQueue();
    await stripeWebhook(await signed(paidSession(orderId, jobId)), env);
    const second = await stripeWebhook(await signed(paidSession(orderId, jobId, { payment_intent: 'pi_second' })), env);
    expect(await second.json()).toMatchObject({ order: 'second_payment' });
    expect(sent).toHaveLength(1);
    expect((await alerts(orderId)).some((a) => a.subject.includes('second payment'))).toBe(true);
  });

  it('leaves an order pending when an asynchronous payment fails', async () => {
    const { orderId, jobId } = await pendingOrder('Отказ банка');
    const failed = event('checkout.session.async_payment_failed', {
      id: 'cs_x',
      object: 'checkout.session',
      metadata: { order_id: orderId, job_id: jobId },
    });
    expect((await send(failed)).status).toBe(200);
    expect(await order(orderId)).toMatchObject({ status: 'pending', hold: null });
    const job = await testEnv.DB.prepare('SELECT status FROM jobs WHERE id = ?').bind(jobId).first<{ status: string }>();
    expect(job?.status).toBe('queued');
  });
});

describe("a shopper's refund and dispute", () => {
  async function paidOrder(name: string) {
    const seeded = await pendingOrder(name);
    await stripeWebhook(await signed(paidSession(seeded.orderId, seeded.jobId)), recordingQueue().env);
    return { ...seeded, pi: `pi_${seeded.orderId}` };
  }

  it('closes the order on a full refund, and its PDF link with it', async () => {
    const { orderId, jobId, pi } = await paidOrder('Возврат');
    const response = await send(refund(pi));
    expect(await response.json()).toMatchObject({ refund: 'refunded' });
    expect(await order(orderId)).toMatchObject({ status: 'refunded' });
    const token = await signLink('order', { order: orderId, job: jobId }, testEnv.LINK_KEY, 60);
    const pdf = await SELF.fetch(`https://jobs.test/d/${token}`, { headers: { 'x-site-key': 'test-site-key' } });
    expect(pdf.status).toBe(410);
    expect(await (await send(refund(pi))).json()).toMatchObject({ refund: 'already' });
  });

  it('closes an order held for the wrong amount once it is refunded', async () => {
    const { orderId, jobId } = await pendingOrder('Вернули лишнее');
    await stripeWebhook(await signed(paidSession(orderId, jobId, { amount_subtotal: 5 })), recordingQueue().env);
    await send(refund(`pi_${orderId}`));
    expect(await order(orderId)).toMatchObject({ status: 'refunded', hold: null });
  });

  it('withholds the document while a dispute is open and gives it back when it is won', async () => {
    const { orderId, pi } = await paidOrder('Спор');
    const opened = await send(dispute('charge.dispute.created', pi, `dp_${orderId}`));
    expect(await opened.json()).toMatchObject({ dispute: 'order' });
    expect(await order(orderId)).toMatchObject({ status: 'paid', hold: 'disputed' });
    expect((await alerts(orderId)).some((a) => a.subject === '[Chronika] Payment disputed')).toBe(true);

    await send(dispute('charge.dispute.closed', pi, `dp_${orderId}`, 'won'));
    expect(await order(orderId)).toMatchObject({ status: 'paid', hold: null });
  });

  it('gives the document back when an inquiry is closed, as when a dispute is won', async () => {
    const { orderId, pi } = await paidOrder('Запрос банка');
    await send(dispute('charge.dispute.created', pi, `dp_${orderId}`, 'warning_needs_response'));
    expect(await order(orderId)).toMatchObject({ status: 'paid', hold: 'disputed' });
    await send(dispute('charge.dispute.closed', pi, `dp_${orderId}`, 'warning_closed'));
    expect(await order(orderId)).toMatchObject({ status: 'paid', hold: null });
  });

  it('writes the document of a payment disputed before it settled, once the dispute is won', async () => {
    const { orderId, jobId } = await pendingOrder('Спор до оплаты');
    const pi = `pi_${orderId}`;
    await send(dispute('charge.dispute.created', pi, `dp_${orderId}`));
    const paid = recordingQueue();
    expect(await (await stripeWebhook(await signed(paidSession(orderId, jobId)), paid.env)).json()).toMatchObject({
      order: 'disputed',
    });
    expect(paid.sent).toEqual([]);
    expect(await order(orderId)).toMatchObject({ status: 'paid', hold: 'disputed' });

    const won = recordingQueue();
    const response = await stripeWebhook(await signed(dispute('charge.dispute.closed', pi, `dp_${orderId}`, 'won')), won.env);
    expect(await response.json()).toMatchObject({ dispute: 'won', queued: true });
    expect(won.sent).toEqual([{ jobId }]);
    expect(await order(orderId)).toMatchObject({ status: 'paid', hold: null });
  });

  it('queues nothing when a dispute is won after the document was written', async () => {
    const { orderId, jobId, pi } = await paidOrder('Спор после');
    await testEnv.DB.prepare("UPDATE jobs SET status = 'done', step = 'done', attempts = 1 WHERE id = ?").bind(jobId).run();
    await send(dispute('charge.dispute.created', pi, `dp_${orderId}`));
    const won = recordingQueue();
    await stripeWebhook(await signed(dispute('charge.dispute.closed', pi, `dp_${orderId}`, 'won')), won.env);
    expect(won.sent).toEqual([]);
  });

  it('keeps the document withheld when the dispute is lost', async () => {
    const { orderId, pi } = await paidOrder('Проигрыш');
    await send(dispute('charge.dispute.created', pi, `dp_${orderId}`));
    await send(dispute('charge.dispute.closed', pi, `dp_${orderId}`, 'lost'));
    expect(await order(orderId)).toMatchObject({ hold: 'disputed' });
  });

  it('keeps the document withheld until each of two disputes is won, and tells the owner of the second', async () => {
    const { orderId, pi } = await paidOrder('Два спора');
    const [first, second] = [`dp_a_${orderId}`, `dp_b_${orderId}`];
    await send(dispute('charge.dispute.created', pi, first));
    await send(dispute('charge.dispute.created', pi, second));
    expect(await order(orderId)).toMatchObject({ status: 'paid', hold: 'disputed' });
    const told = (await alerts(orderId)).filter((a) => a.subject === '[Chronika] A second dispute on one payment');
    expect(told).toHaveLength(1);
    expect(told[0]?.text).toContain(`dispute ${second}`);
    expect(told[0]?.text).toContain(first);
    expect(told[0]?.text).not.toContain('Два спора');

    // Won twice over (Stripe repeats events): the second dispute still holds the document.
    for (let i = 0; i < 2; i++) {
      const won = await send(dispute('charge.dispute.closed', pi, first, 'won'));
      expect(await won.json()).toMatchObject({ dispute: 'held' });
      expect(await order(orderId)).toMatchObject({ status: 'paid', hold: 'disputed' });
    }
    await send(dispute('charge.dispute.closed', pi, second, 'warning_closed'));
    expect(await order(orderId)).toMatchObject({ status: 'paid', hold: null });
  });

  it('keeps the document withheld when one of two disputes is lost and the other is won', async () => {
    const { orderId, pi } = await paidOrder('Один из двух');
    await send(dispute('charge.dispute.created', pi, `dp_a_${orderId}`));
    await send(dispute('charge.dispute.created', pi, `dp_b_${orderId}`));
    await send(dispute('charge.dispute.closed', pi, `dp_a_${orderId}`, 'lost'));
    await send(dispute('charge.dispute.closed', pi, `dp_b_${orderId}`, 'won'));
    expect(await order(orderId)).toMatchObject({ hold: 'disputed' });
  });

  it('closes an order whose refund arrived before its payment, and writes nothing', async () => {
    const { orderId, jobId } = await pendingOrder('Наоборот');
    await send(refund(`pi_${orderId}`));
    const { env, sent } = recordingQueue();
    const late = await stripeWebhook(await signed(paidSession(orderId, jobId)), env);
    expect(await late.json()).toMatchObject({ order: 'refunded' });
    expect(sent).toEqual([]);
    expect(await order(orderId)).toMatchObject({ status: 'refunded' });
  });
});

describe("a seller's pack: disputes and out-of-order events", () => {
  const packSession = (p: { id: string; account_id: string }, type = 'checkout.session.completed') =>
    event(type, {
      id: `cs_${p.id}`,
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: `pi_${p.id}`,
      amount_subtotal: 24900,
      currency: 'eur',
      metadata: { kind: 'pro_pack', purchase_id: p.id, account_id: p.account_id },
    });
  const seller = async (name: string) => (await signIn(`${name}@webhook.test`)).account.id;
  const purchase = (id: string) =>
    testEnv.DB.prepare('SELECT status FROM pro_purchases WHERE id = ?').bind(id).first<{ status: string }>();
  const taken = async (id: string) =>
    (
      await testEnv.DB.prepare('SELECT credits_taken FROM pro_purchases WHERE id = ?')
        .bind(id)
        .first<{ credits_taken: string | null }>()
    )?.credits_taken;

  it('takes the credits back once per dispute and gives them back once when it is won', async () => {
    const account = await seller('disputed');
    const p = (await createPurchase(testEnv.DB, account, 'p30'))!;
    await attachSession(testEnv.DB, p.id, `cs_${p.id}`);
    await send(packSession(p));
    expect(await balance(testEnv.DB, account)).toBe(30);

    for (let i = 0; i < 2; i++) await send(dispute('charge.dispute.created', `pi_${p.id}`, `dp_${p.id}`));
    expect(await balance(testEnv.DB, account)).toBe(0);
    expect(await purchase(p.id)).toEqual({ status: 'paid' });

    await send(dispute('charge.dispute.closed', `pi_${p.id}`, `dp_${p.id}`, 'lost'));
    expect(await balance(testEnv.DB, account)).toBe(0);
    for (let i = 0; i < 2; i++) await send(dispute('charge.dispute.closed', `pi_${p.id}`, `dp_${p.id}`, 'won'));
    expect(await balance(testEnv.DB, account)).toBe(30);
  });

  it('gives nothing back for a won dispute that never took anything', async () => {
    const account = await seller('nodebit');
    const p = (await createPurchase(testEnv.DB, account, 'p10'))!;
    const response = await send(dispute('charge.dispute.closed', `pi_${p.id}`, `dp_${p.id}`, 'won'));
    expect(await response.json()).toMatchObject({ dispute: 'unknown' });
    expect(await balance(testEnv.DB, account)).toBe(0);
  });

  it('closes a pack whose payment was overtaken by a refund, and credits nothing', async () => {
    const account = await seller('early-refund');
    const p = (await createPurchase(testEnv.DB, account, 'p30'))!;
    const first = await send(refund(`pi_${p.id}`));
    expect(first.status).toBe(200);
    const late = await send(packSession(p));
    expect(await late.json()).toMatchObject({ pack: 'refunded' });
    expect(await purchase(p.id)).toEqual({ status: 'refunded' });
    expect(await balance(testEnv.DB, account)).toBe(0);
    expect(await (await send(packSession(p))).json()).toMatchObject({ pack: 'already' });
    expect(await balance(testEnv.DB, account)).toBe(0);
  });

  /** A pack whose payment Stripe reported disputed (by each of `disputes`) before its completion,
   * then completed. */
  async function overtakenPack(name: string, disputes: string[]) {
    const account = await seller(name);
    const p = (await createPurchase(testEnv.DB, account, 'p30'))!;
    const pi = `pi_${p.id}`;
    for (const id of disputes) await send(dispute('charge.dispute.created', pi, id));
    const late = await send(packSession(p));
    expect(await late.json()).toMatchObject({ pack: 'disputed' });
    expect(await purchase(p.id)).toEqual({ status: 'paid' });
    expect(await balance(testEnv.DB, account)).toBe(0);
    return { account, p, pi };
  }

  it('books a pack whose payment a dispute overtook as paid, its credits taken until the dispute is won', async () => {
    const dp = 'dp_overtook_won';
    const { account, p, pi } = await overtakenPack('early-dispute-won', [dp]);
    expect(await taken(p.id)).toBe(`dispute:${dp}`);
    expect(await (await send(packSession(p))).json()).toMatchObject({ pack: 'already' });
    expect(await balance(testEnv.DB, account)).toBe(0);
    for (let i = 0; i < 2; i++) await send(dispute('charge.dispute.closed', pi, dp, 'won'));
    expect(await balance(testEnv.DB, account)).toBe(30);
    expect(await taken(p.id)).toBeNull();
  });

  it('keeps the credits of a pack whose payment a dispute overtook taken when the dispute is lost', async () => {
    const dp = 'dp_overtook_lost';
    const { account, p, pi } = await overtakenPack('early-dispute-lost', [dp]);
    await send(dispute('charge.dispute.closed', pi, dp, 'lost'));
    expect(await balance(testEnv.DB, account)).toBe(0);
    // A refund after it takes nothing more.
    await send(refund(pi));
    expect(await balance(testEnv.DB, account)).toBe(0);
    expect(await purchase(p.id)).toEqual({ status: 'refunded' });
  });

  it('leaves the credits of a pack whose payment two disputes overtook to the owner', async () => {
    const { account, p, pi } = await overtakenPack('early-two-disputes', ['dp_overtook_a', 'dp_overtook_b']);
    expect(await taken(p.id)).toBe('dispute:multiple');
    await send(dispute('charge.dispute.closed', pi, 'dp_overtook_a', 'won'));
    await send(dispute('charge.dispute.closed', pi, 'dp_overtook_b', 'won'));
    expect(await balance(testEnv.DB, account)).toBe(0);
  });

  /** A pack bought and paid for: 30 credits. */
  async function paidPack(name: string) {
    const account = await seller(name);
    const p = (await createPurchase(testEnv.DB, account, 'p30'))!;
    await attachSession(testEnv.DB, p.id, `cs_${p.id}`);
    await send(packSession(p));
    expect(await balance(testEnv.DB, account)).toBe(30);
    return { account, p, pi: `pi_${p.id}`, dp: `dp_${p.id}` };
  }

  it('gives the credits back once when an inquiry is closed, as when a dispute is won', async () => {
    const { account, pi, dp } = await paidPack('inquiry');
    await send(dispute('charge.dispute.created', pi, dp, 'warning_needs_response'));
    expect(await balance(testEnv.DB, account)).toBe(0);
    for (let i = 0; i < 2; i++) await send(dispute('charge.dispute.closed', pi, dp, 'warning_closed'));
    expect(await balance(testEnv.DB, account)).toBe(30);
  });

  it('takes the credits back once when a refund follows a dispute, and gives nothing back after', async () => {
    const { account, p, pi, dp } = await paidPack('dispute-then-refund');
    await send(dispute('charge.dispute.created', pi, dp, 'warning_needs_response'));
    expect(await balance(testEnv.DB, account)).toBe(0);
    expect(await (await send(refund(pi))).json()).toMatchObject({ refund: 'refunded' });
    expect(await balance(testEnv.DB, account)).toBe(0);
    expect(await purchase(p.id)).toEqual({ status: 'refunded' });
    await send(dispute('charge.dispute.closed', pi, dp, 'warning_closed'));
    expect(await balance(testEnv.DB, account)).toBe(0);
  });

  it('takes nothing more when a dispute follows a refund', async () => {
    const { account, pi, dp } = await paidPack('refund-then-dispute');
    await send(refund(pi));
    expect(await balance(testEnv.DB, account)).toBe(0);
    await send(dispute('charge.dispute.created', pi, dp));
    await send(dispute('charge.dispute.closed', pi, dp, 'won'));
    expect(await balance(testEnv.DB, account)).toBe(0);
  });

  it('keeps the credits taken when a second dispute meets the first, whichever is won, and tells the owner', async () => {
    const { account, p, pi } = await paidPack('two-disputes');
    const [first, second] = [`dp_a_${p.id}`, `dp_b_${p.id}`];
    await send(dispute('charge.dispute.created', pi, first));
    expect(await balance(testEnv.DB, account)).toBe(0);
    const again = await send(dispute('charge.dispute.created', pi, second));
    expect(await again.json()).toMatchObject({ dispute: 'multiple' });
    expect(await balance(testEnv.DB, account)).toBe(0);
    expect(await taken(p.id)).toBe('dispute:multiple');
    const told = (await letters('owner@alerts.test')).filter((l) => l.text.includes(`dispute ${second}`));
    expect(told.map((l) => l.subject)).toContain('[Chronika] A second dispute on one payment: settle the credits by hand');

    const won = await send(dispute('charge.dispute.closed', pi, first, 'won'));
    expect(await won.json()).toMatchObject({ dispute: 'manual' });
    await send(dispute('charge.dispute.closed', pi, second, 'warning_closed'));
    expect(await balance(testEnv.DB, account)).toBe(0);
    expect(await taken(p.id)).toBe('dispute:multiple');
    const closed = (await letters('owner@alerts.test')).filter((l) => l.text.includes(`dispute ${first}`));
    expect(closed.map((l) => l.subject)).toContain(
      '[Chronika] A dispute closed on a payment disputed twice: settle the credits by hand',
    );
  });

  it('takes the credits again for a dispute that follows one already won', async () => {
    const { account, p, pi } = await paidPack('one-after-another');
    await send(dispute('charge.dispute.created', pi, `dp_a_${p.id}`));
    await send(dispute('charge.dispute.closed', pi, `dp_a_${p.id}`, 'won'));
    expect(await balance(testEnv.DB, account)).toBe(30);
    expect(await (await send(dispute('charge.dispute.created', pi, `dp_b_${p.id}`))).json()).toMatchObject({ dispute: 'debited' });
    expect(await balance(testEnv.DB, account)).toBe(0);
    await send(dispute('charge.dispute.closed', pi, `dp_b_${p.id}`, 'won'));
    expect(await balance(testEnv.DB, account)).toBe(30);
  });

  it('takes nothing when Stripe repeats a dispute already won, and a later refund takes the credits once', async () => {
    const { account, pi, dp } = await paidPack('repeated');
    await send(dispute('charge.dispute.created', pi, dp));
    await send(dispute('charge.dispute.closed', pi, dp, 'won'));
    expect(await balance(testEnv.DB, account)).toBe(30);
    expect(await (await send(dispute('charge.dispute.created', pi, dp))).json()).toMatchObject({ dispute: 'already' });
    expect(await balance(testEnv.DB, account)).toBe(30);
    await send(refund(pi));
    expect(await balance(testEnv.DB, account)).toBe(0);
  });
});

describe('the Stripe signature', () => {
  const ping = event('customer.created', { id: 'cus_1', object: 'customer' });

  it('is accepted when any of several v1 values matches, as during a secret roll', async () => {
    const payload = JSON.stringify(ping);
    const t = Math.floor(Date.now() / 1000);
    const good = await hmac(SECRET, `${t}.${payload}`);
    const header = `t=${t},v1=${'0'.repeat(64)},v1=${good}`;
    const response = await SELF.fetch('https://jobs.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': header },
      body: payload,
    });
    expect(response.status).toBe(200);
  });

  it('is refused when none matches, when it is stale, or when the body is too large', async () => {
    expect((await SELF.fetch(await signed(ping, { signatures: ['0'.repeat(64), 'f'.repeat(64)] }))).status).toBe(400);
    expect((await SELF.fetch(await signed(ping, { age: 600 }))).status).toBe(400);
    const huge = { ...ping, padding: 'x'.repeat(1024 * 1024) };
    expect((await SELF.fetch(await signed(huge))).status).toBe(400);
  });
});
