import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { balance } from '../src/pro/credits';
import { attachSession, createPurchase } from '../src/pro/purchases';
import { signIn, testEnv } from './env';
import { seedOrder } from './seed';

async function signed(event: unknown, secret = 'whsec_test_fake'): Promise<Request> {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://jobs.test/v1/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: payload });
}

const send = async (event: unknown, secret?: string) => SELF.fetch(await signed(event, secret));
const db = () => testEnv.DB;
const seller = async (name: string) => (await signIn(`${name}@purchase-webhook.test`)).account.id;
const status = async (id: string) =>
  (await db().prepare('SELECT status FROM pro_purchases WHERE id = ?').bind(id).first<{ status: string }>())!.status;

const sessionEvent = (type: string, p: { id: string; account_id: string }, o: Record<string, unknown> = {}) => ({
  id: `evt_${crypto.randomUUID()}`,
  type,
  data: {
    object: {
      id: `cs_${p.id}`,
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: `pi_${p.id}`,
      amount_subtotal: 24900,
      currency: 'eur',
      metadata: { kind: 'pro_pack', purchase_id: p.id, account_id: p.account_id },
      ...o,
    },
  },
});

const refundEvent = (pi: string | null, refunded: boolean) => ({
  id: `evt_${crypto.randomUUID()}`,
  type: 'charge.refunded',
  data: { object: { id: 'ch_1', object: 'charge', payment_intent: pi, refunded, amount_refunded: refunded ? 24900 : 1000 } },
});

describe('credit pack webhook', () => {
  it('credits a pack once however often it is delivered', async () => {
    const id = await seller('once');
    const p = await createPurchase(db(), id, 'p30');
    await attachSession(db(), p.id, `cs_${p.id}`);
    for (const type of ['checkout.session.completed', 'checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
      expect((await send(sessionEvent(type, p))).status).toBe(200);
    }
    expect(await balance(db(), id)).toBe(30);
    expect(await status(p.id)).toBe('paid');
  });

  it('does nothing for a session that is not paid yet', async () => {
    const id = await seller('unpaid');
    const p = await createPurchase(db(), id, 'p30');
    await send(sessionEvent('checkout.session.completed', p, { payment_status: 'unpaid' }));
    expect(await balance(db(), id)).toBe(0);
    expect(await status(p.id)).toBe('pending');

    const later = await send(sessionEvent('checkout.session.async_payment_succeeded', p));
    expect(await later.json()).toMatchObject({ pack: 'paid' });
    expect(await balance(db(), id)).toBe(30);
    expect(await status(p.id)).toBe('paid');
  });

  it('rejects a bad signature and changes nothing', async () => {
    const id = await seller('badsig');
    const p = await createPurchase(db(), id, 'p30');
    const res = await send(sessionEvent('checkout.session.completed', p), 'whsec_wrong');
    expect(res.status).toBe(400);
    expect(await balance(db(), id)).toBe(0);
    expect(await status(p.id)).toBe('pending');
  });

  it('fails a pack whose amount differs', async () => {
    const id = await seller('amount');
    const p = await createPurchase(db(), id, 'p30');
    await send(sessionEvent('checkout.session.completed', p, { amount_subtotal: 100 }));
    expect(await balance(db(), id)).toBe(0);
    expect(await status(p.id)).toBe('failed');
  });

  it('does not credit when the metadata names another seller', async () => {
    const id = await seller('owner');
    const other = await seller('other');
    const p = await createPurchase(db(), id, 'p30');
    const res = await send(sessionEvent('checkout.session.completed', { id: p.id, account_id: other }));
    expect(await res.json()).toMatchObject({ pack: 'unknown' });
    expect(await balance(db(), id)).toBe(0);
    expect(await balance(db(), other)).toBe(0);
    expect(await status(p.id)).toBe('pending');
  });

  it('marks a pack failed when the async payment fails', async () => {
    const id = await seller('asyncfail');
    const p = await createPurchase(db(), id, 'p30');
    await send(sessionEvent('checkout.session.async_payment_failed', p));
    expect(await status(p.id)).toBe('failed');
    expect(await balance(db(), id)).toBe(0);
  });

  it('takes the credits back on a full refund, once', async () => {
    const id = await seller('refund');
    const p = await createPurchase(db(), id, 'p30');
    await send(sessionEvent('checkout.session.completed', p));
    expect(await balance(db(), id)).toBe(30);
    const first = await send(refundEvent(`pi_${p.id}`, true));
    expect(await first.json()).toMatchObject({ refund: 'refunded' });
    await send(refundEvent(`pi_${p.id}`, true));
    expect(await balance(db(), id)).toBe(0);
    expect(await status(p.id)).toBe('refunded');
  });

  it('ignores a partial refund', async () => {
    const id = await seller('partial');
    const p = await createPurchase(db(), id, 'p30');
    await send(sessionEvent('checkout.session.completed', p));
    const res = await send(refundEvent(`pi_${p.id}`, false));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 'partial refund' });
    expect(await balance(db(), id)).toBe(30);
    expect(await status(p.id)).toBe('paid');
  });

  it('answers 200 for a refund of an unrelated intent', async () => {
    const id = await seller('unrelated');
    const p = await createPurchase(db(), id, 'p30');
    await send(sessionEvent('checkout.session.completed', p));
    const res = await send(refundEvent('pi_b2c_something', true));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, refund: 'unknown' });
    expect(await balance(db(), id)).toBe(30);
  });

  it('marks an abandoned checkout failed', async () => {
    const id = await seller('expired');
    const p = await createPurchase(db(), id, 'p30');
    const res = await send(sessionEvent('checkout.session.expired', p, { payment_status: 'unpaid', payment_intent: null }));
    expect(await res.json()).toEqual({ received: true, pack: 'expired' });
    expect(await status(p.id)).toBe('failed');
    expect(await balance(db(), id)).toBe(0);
  });

  it('leaves a paid pack paid when an expired event arrives', async () => {
    const id = await seller('expiredpaid');
    const p = await createPurchase(db(), id, 'p30');
    await send(sessionEvent('checkout.session.completed', p));
    await send(sessionEvent('checkout.session.expired', p));
    expect(await status(p.id)).toBe('paid');
    expect(await balance(db(), id)).toBe(30);
  });

  it('still pays a B2C order as before', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Anna' });
    await db().prepare("UPDATE orders SET status = 'pending', stripe_session_id = 'cs_b2c' WHERE id = ?").bind(orderId).run();
    const res = await send({
      id: 'evt_b2c',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_b2c',
          object: 'checkout.session',
          payment_status: 'paid',
          payment_intent: 'pi_b2c',
          // The seeded order asks for 0 EUR; Stripe's amount must be the order's own.
          amount_subtotal: 0,
          currency: 'eur',
          metadata: { order_id: orderId, job_id: jobId },
        },
      },
    });
    expect(await res.json()).toMatchObject({ received: true, queued: true });
    const row = await db().prepare('SELECT status, stripe_payment_intent FROM orders WHERE id = ?').bind(orderId).first<any>();
    expect(row).toMatchObject({ status: 'paid', stripe_payment_intent: 'pi_b2c' });
  });
});
