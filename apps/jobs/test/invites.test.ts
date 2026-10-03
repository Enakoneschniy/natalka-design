import { describe, expect, it } from 'vitest';
import { balance } from '../src/pro/credits';
import { hasRedeemed, redeemInvite } from '../src/pro/invites';
import { signIn, testEnv } from './env';

const db = () => testEnv.DB;
const seller = async (name: string) => (await signIn(`${name}@invites.test`)).account.id;

async function code(
  value: string,
  opts: { credits?: number; maxUses?: number; expiresAt?: string | null } = {},
) {
  await db()
    .prepare(
      'INSERT INTO pro_invite_codes (code, credits, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(value, opts.credits ?? 3, opts.maxUses ?? 100, opts.expiresAt ?? null, new Date().toISOString())
    .run();
}

const uses = async (value: string) =>
  (
    await db()
      .prepare('SELECT uses FROM pro_invite_codes WHERE code = ?')
      .bind(value)
      .first<{ uses: number }>()
  )?.uses;

describe('invite codes', () => {
  it('grants the trial credits', async () => {
    await code('WELCOME');
    const id = await seller('welcome');
    expect(await redeemInvite(db(), id, 'WELCOME')).toEqual({ status: 'granted', credits: 3 });
    expect(await balance(db(), id)).toBe(3);
    expect(await hasRedeemed(db(), id)).toBe(true);
    expect(await uses('WELCOME')).toBe(1);
  });

  it('accepts the code however it was typed', async () => {
    await code('ANNA2026');
    const id = await seller('typed');
    expect((await redeemInvite(db(), id, '  anna2026 ')).status).toBe('granted');
  });

  it('gives one invite per account, whichever code', async () => {
    await code('FIRSTCODE');
    await code('SECONDCODE');
    const id = await seller('greedy');
    await redeemInvite(db(), id, 'FIRSTCODE');
    expect(await redeemInvite(db(), id, 'FIRSTCODE')).toEqual({ status: 'already' });
    expect(await redeemInvite(db(), id, 'SECONDCODE')).toEqual({ status: 'already' });
    expect(await balance(db(), id)).toBe(3);
  });

  it('refuses unknown, empty, used-up and expired codes', async () => {
    await code('ONEUSE', { maxUses: 1 });
    await code('OLD', { expiresAt: '2000-01-01T00:00:00.000Z' });
    await redeemInvite(db(), await seller('early'), 'ONEUSE');
    const id = await seller('late');
    for (const bad of ['NOPE', '', '   ', 42, 'ONEUSE', 'OLD']) {
      expect(await redeemInvite(db(), id, bad)).toEqual({ status: 'invalid' });
    }
    expect(await balance(db(), id)).toBe(0);
    expect(await hasRedeemed(db(), id)).toBe(false);
  });

  it('never hands out the last use twice', async () => {
    await code('LASTONE', { maxUses: 1 });
    const [a, b] = [await seller('race-a'), await seller('race-b')];
    const results = await Promise.all([redeemInvite(db(), a, 'LASTONE'), redeemInvite(db(), b, 'LASTONE')]);
    expect(results.filter((r) => r.status === 'granted')).toHaveLength(1);
    expect(await uses('LASTONE')).toBe(1);
  });

  it('does not double-grant when one seller taps twice', async () => {
    await code('DOUBLETAP');
    const id = await seller('double');
    const results = await Promise.all([redeemInvite(db(), id, 'DOUBLETAP'), redeemInvite(db(), id, 'DOUBLETAP')]);
    expect(results.filter((r) => r.status === 'granted')).toHaveLength(1);
    expect(await balance(db(), id)).toBe(3);
    expect(await uses('DOUBLETAP')).toBe(1);
  });
});
