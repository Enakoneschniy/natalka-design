import { describe, expect, it } from 'vitest';
import { balance, CREDIT_COST, grant, refund, spend } from '../src/pro/credits';
import { signIn, testEnv } from './env';

const db = () => testEnv.DB;
const seller = async (name: string) => (await signIn(`${name}@credits.test`)).account.id;

describe('credits', () => {
  it('weighs a bundle as two and everything else as one', () => {
    expect(CREDIT_COST).toEqual({ natal: 1, forecast: 1, synastry: 1, child: 1, bundle: 2 });
  });

  it('starts at zero and is the sum of the ledger', async () => {
    const id = await seller('sum');
    expect(await balance(db(), id)).toBe(0);
    await grant(db(), { accountId: id, delta: 10, reason: 'purchase', ref: 'cs_sum' });
    await spend(db(), { accountId: id, amount: 2, ref: 'job-sum' });
    expect(await balance(db(), id)).toBe(8);
  });

  it('books a purchase once however often the webhook repeats it', async () => {
    const id = await seller('repeat');
    expect(await grant(db(), { accountId: id, delta: 10, reason: 'purchase', ref: 'cs_rep' })).toBe(true);
    expect(await grant(db(), { accountId: id, delta: 10, reason: 'purchase', ref: 'cs_rep' })).toBe(false);
    expect(await balance(db(), id)).toBe(10);
  });

  it('refuses to spend more than the balance', async () => {
    const id = await seller('short');
    await grant(db(), { accountId: id, delta: 1, reason: 'adjust', ref: null });
    expect(await spend(db(), { accountId: id, amount: 2, ref: 'job-short' })).toBe(false);
    expect(await balance(db(), id)).toBe(1);
  });

  it('lets only one of two simultaneous spends through on the last credit', async () => {
    const id = await seller('race');
    await grant(db(), { accountId: id, delta: 1, reason: 'adjust', ref: null });
    const results = await Promise.all([
      spend(db(), { accountId: id, amount: 1, ref: 'job-race-a' }),
      spend(db(), { accountId: id, amount: 1, ref: 'job-race-b' }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balance(db(), id)).toBe(0);
  });

  it('spends a job once', async () => {
    const id = await seller('twice');
    await grant(db(), { accountId: id, delta: 5, reason: 'adjust', ref: null });
    expect(await spend(db(), { accountId: id, amount: 1, ref: 'job-twice' })).toBe(true);
    expect(await spend(db(), { accountId: id, amount: 1, ref: 'job-twice' })).toBe(false);
    expect(await balance(db(), id)).toBe(4);
  });

  it('refunds exactly what a failed job took, once', async () => {
    const id = await seller('refund');
    await grant(db(), { accountId: id, delta: 5, reason: 'adjust', ref: null });
    await spend(db(), { accountId: id, amount: 2, ref: 'job-refund' });
    expect(await refund(db(), 'job-refund')).toBe(true);
    expect(await refund(db(), 'job-refund')).toBe(false);
    expect(await balance(db(), id)).toBe(5);
  });

  it('refunds nothing for a job that never spent', async () => {
    expect(await refund(db(), 'job-never')).toBe(false);
  });

  it('refuses a non-positive spend', async () => {
    const id = await seller('zero');
    await grant(db(), { accountId: id, delta: 5, reason: 'adjust', ref: null });
    expect(await spend(db(), { accountId: id, amount: 0, ref: 'job-zero' })).toBe(false);
    expect(await spend(db(), { accountId: id, amount: -3, ref: 'job-neg' })).toBe(false);
    expect(await balance(db(), id)).toBe(5);
  });
});
