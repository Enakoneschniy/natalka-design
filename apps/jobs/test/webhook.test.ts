import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { signLink } from '../src/crypto';
import type { Env, QueueMessage } from '../src/env';
import { balance } from '../src/pro/credits';
import { attachSession, createPurchase } from '../src/pro/purchases';
import { stripeWebhook } from '../src/webhook';
import { envWith, letters, signIn, testEnv } from './env';
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

/** The worker with its queue replaced by a list, to see what a webhook queues. */
function recordingQueue(): { env: Env; sent: QueueMessage[] } {
  const sent: QueueMessage[] = [];
  return { env: envWith('JOBS', { send: async (message: QueueMessage) => void sent.push(message) }), sent };
}

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
  it('queues the document once, however often the event comes', async () => {
    const { orderId, jobId } = await pendingOrder('Платит');
    const { env, sent } = recordingQueue();
    for (let i = 0; i < 2; i++) {
      const response = await stripeWebhook(await signed(paidSession(orderId, jobId)), env);
      expect(response.status).toBe(200);
    }
    expect(sent).toEqual([{ jobId }]);
    expect(await order(orderId)).toMatchObject({ status: 'paid', hold: null, stripe_payment_intent: `pi_${orderId}` });
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

  it('keeps the document withheld when the dispute is lost', async () => {
    const { orderId, pi } = await paidOrder('Проигрыш');
    await send(dispute('charge.dispute.created', pi, `dp_${orderId}`));
    await send(dispute('charge.dispute.closed', pi, `dp_${orderId}`, 'lost'));
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

  it('takes the credits back once per dispute and gives them back once when it is won', async () => {
    const account = await seller('disputed');
    const p = await createPurchase(testEnv.DB, account, 'p30');
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
    const p = await createPurchase(testEnv.DB, account, 'p10');
    const response = await send(dispute('charge.dispute.closed', `pi_${p.id}`, `dp_${p.id}`, 'won'));
    expect(await response.json()).toMatchObject({ dispute: 'unknown' });
    expect(await balance(testEnv.DB, account)).toBe(0);
  });

  for (const [what, early] of [
    ['a refund', (pi: string) => refund(pi)],
    ['a dispute', (pi: string) => dispute('charge.dispute.created', pi, `dp_${pi}`)],
  ] as const) {
    it(`closes a pack whose payment was overtaken by ${what}, and credits nothing`, async () => {
      const account = await seller(`early-${what.replace(' ', '-')}`);
      const p = await createPurchase(testEnv.DB, account, 'p30');
      const first = await send(early(`pi_${p.id}`));
      expect(first.status).toBe(200);
      const late = await send(packSession(p));
      expect(await late.json()).toMatchObject({ pack: 'refunded' });
      expect(await purchase(p.id)).toEqual({ status: 'refunded' });
      expect(await balance(testEnv.DB, account)).toBe(0);
      expect(await (await send(packSession(p))).json()).toMatchObject({ pack: 'already' });
      expect(await balance(testEnv.DB, account)).toBe(0);
    });
  }
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
