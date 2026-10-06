import { describe, expect, it } from 'vitest';
import { balance, spend } from '../src/pro/credits';
import {
  attachSession,
  createPurchase,
  isPack,
  listPurchases,
  markFailed,
  markPaid,
  markRefunded,
  PACKS,
} from '../src/pro/purchases';
import { signIn, testEnv } from './env';

const db = () => testEnv.DB;
const seller = async (name: string) => (await signIn(`${name}@purchases.test`)).account.id;
const pay = (p: { id: string; account_id: string }, pi: string | null = null, amount = 9900, cur = 'eur') =>
  markPaid(db(), { purchaseId: p.id, accountId: p.account_id, paymentIntent: pi, amountSubtotal: amount, currency: cur });

describe('purchases', () => {
  it('knows the packs', () => {
    expect(isPack('p30')).toBe(true);
    expect(isPack('toString')).toBe(false);
    expect(isPack(5)).toBe(false);
  });

  it('writes a pending purchase with the catalogue values', async () => {
    const id = await seller('create');
    const p = (await createPurchase(db(), id, 'p30'))!;
    expect(p).toMatchObject({ status: 'pending', ...PACKS.p30, account_id: id });
    await attachSession(db(), p.id, 'cs_create');
    const row = await db().prepare('SELECT * FROM pro_purchases WHERE id = ?').bind(p.id).first<any>();
    expect(row).toMatchObject({ status: 'pending', credits: 30, amount_minor: 24900, stripe_session_id: 'cs_create' });
  });

  it('credits a paid purchase once', async () => {
    const id = await seller('paid');
    const p = (await createPurchase(db(), id, 'p10'))!;
    expect(await pay(p, 'pi_paid')).toBe('paid');
    expect(await balance(db(), id)).toBe(10);
    expect(await pay(p, 'pi_paid')).toBe('already');
    expect(await balance(db(), id)).toBe(10);
  });

  it('credits once when delivered concurrently', async () => {
    const id = await seller('conc');
    const p = (await createPurchase(db(), id, 'p10'))!;
    const r = await Promise.all([pay(p, 'pi_c'), pay(p, 'pi_c'), pay(p, 'pi_c')]);
    expect(r.filter((x) => x === 'paid')).toHaveLength(1);
    expect(await balance(db(), id)).toBe(10);
  });

  it('fails a purchase whose amount or currency differs and grants nothing', async () => {
    const id = await seller('mismatch');
    const p = (await createPurchase(db(), id, 'p10'))!;
    expect(await pay(p, 'pi_m', 100)).toBe('mismatch');
    expect(await balance(db(), id)).toBe(0);
    const row = await db().prepare('SELECT status FROM pro_purchases WHERE id = ?').bind(p.id).first<any>();
    expect(row.status).toBe('failed');
    expect(await pay(p, 'pi_m')).toBe('already');
    const q = (await createPurchase(db(), id, 'p10'))!;
    expect(await pay(q, 'pi_m2', 9900, 'usd')).toBe('mismatch');
    expect(await balance(db(), id)).toBe(0);
  });

  it("does not settle another account's purchase", async () => {
    const a = await seller('owner');
    const b = await seller('thief');
    const p = (await createPurchase(db(), a, 'p10'))!;
    expect(await pay({ id: p.id, account_id: b })).toBe('unknown');
    expect(await balance(db(), a)).toBe(0);
    expect(await balance(db(), b)).toBe(0);
  });

  it('marks failed only from pending', async () => {
    const id = await seller('failed');
    const p = (await createPurchase(db(), id, 'p10'))!;
    const q = (await createPurchase(db(), id, 'p10'))!;
    await pay(q, 'pi_f');
    await markFailed(db(), p.id, id);
    await markFailed(db(), q.id, id);
    const rows = await listPurchases(db(), id);
    expect(rows.find((r) => r.id === p.id)?.status).toBe('failed');
    expect(rows.find((r) => r.id === q.id)?.status).toBe('paid');
  });

  it('takes the credits back once on a refund', async () => {
    const id = await seller('refund');
    const p = (await createPurchase(db(), id, 'p10'))!;
    await pay(p, 'pi_r');
    expect(await markRefunded(db(), 'pi_r')).toBe('refunded');
    expect(await balance(db(), id)).toBe(0);
    expect(await markRefunded(db(), 'pi_r')).toBe('already');
    expect(await balance(db(), id)).toBe(0);
    expect(await markRefunded(db(), 'pi_nobody')).toBe('unknown');
  });

  it('lets a refund push the balance below zero', async () => {
    const id = await seller('negative');
    const p = (await createPurchase(db(), id, 'p10'))!;
    await pay(p, 'pi_n');
    await spend(db(), { accountId: id, amount: 4, ref: 'job-n' });
    await markRefunded(db(), 'pi_n');
    expect(await balance(db(), id)).toBe(-4);
  });

  it('lists newest first and says what looks refundable', async () => {
    const id = await seller('list');
    const p = (await createPurchase(db(), id, 'p10'))!;
    await pay(p, 'pi_l');
    expect((await listPurchases(db(), id))[0]).toMatchObject({ id: p.id, status: 'paid', refundable: true });

    await spend(db(), { accountId: id, amount: 1, ref: 'job-l' });
    expect((await listPurchases(db(), id))[0].refundable).toBe(false);

    const id2 = await seller('list-old');
    const old = (await createPurchase(db(), id2, 'p10'))!;
    await pay(old, 'pi_old');
    await db()
      .prepare('UPDATE pro_purchases SET paid_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 15 * 86_400_000).toISOString(), old.id)
      .run();
    expect((await listPurchases(db(), id2))[0].refundable).toBe(false);

    const second = (await createPurchase(db(), id2, 'p30'))!;
    const rows = await listPurchases(db(), id2);
    expect(rows[0].id).toBe(second.id);
    expect(rows[0].refundable).toBe(false);
  });
});
