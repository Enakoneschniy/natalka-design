import { describe, expect, it } from 'vitest';
import { balance } from '../src/pro/credits';
import { FAILED_INVITES_PER_HOUR, hasRedeemed, redeemInvite } from '../src/pro/invites';
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

describe('codes that do not work', () => {
  const failures = async (accountId: string) =>
    (
      await db()
        .prepare("SELECT COUNT(*) AS n FROM pro_attempts WHERE kind = 'invite' AND subject = ?")
        .bind(accountId)
        .first<{ n: number }>()
    )?.n ?? 0;

  it(`are looked up no more after ${FAILED_INVITES_PER_HOUR} in an hour, until the hour has passed`, async () => {
    await code('LATECOMER');
    const id = await seller('guesser');
    for (let i = 0; i < FAILED_INVITES_PER_HOUR; i++) {
      expect(await redeemInvite(db(), id, `GUESS${i}`)).toEqual({ status: 'invalid' });
    }
    expect(await redeemInvite(db(), id, 'LATECOMER')).toEqual({ status: 'too_many' });
    expect(await balance(db(), id)).toBe(0);
    expect(await uses('LATECOMER')).toBe(0);

    await db()
      .prepare('UPDATE pro_attempts SET created_at = ? WHERE subject = ?')
      .bind(new Date(Date.now() - 61 * 60 * 1000).toISOString(), id)
      .run();
    expect(await redeemInvite(db(), id, 'LATECOMER')).toEqual({ status: 'granted', credits: 3 });
  });

  it('count alone: a code that works, or a try after it, is no failure', async () => {
    await code('GOODONE');
    const id = await seller('counted');
    for (let i = 0; i < FAILED_INVITES_PER_HOUR - 1; i++) await redeemInvite(db(), id, `NOPE${i}`);
    expect((await redeemInvite(db(), id, 'GOODONE')).status).toBe('granted');
    expect(await redeemInvite(db(), id, 'GOODONE')).toEqual({ status: 'already' });
    expect(await failures(id)).toBe(FAILED_INVITES_PER_HOUR - 1);
  });

  it('are held to the limit when they are sent at once', async () => {
    const id = await seller('burst');
    const results = await Promise.all(
      Array.from({ length: FAILED_INVITES_PER_HOUR + 4 }, (_, i) => redeemInvite(db(), id, `BURST${i}`)),
    );
    expect(results.filter((r) => r.status === 'invalid')).toHaveLength(FAILED_INVITES_PER_HOUR);
    expect(results.filter((r) => r.status === 'too_many')).toHaveLength(4);
    expect(await failures(id)).toBe(FAILED_INVITES_PER_HOUR);
  });

  it('count against one seller and not another', async () => {
    await code('OTHERS');
    const one = await seller('one-guesser');
    const other = await seller('other-guesser');
    for (let i = 0; i < FAILED_INVITES_PER_HOUR; i++) await redeemInvite(db(), one, `WRONG${i}`);
    expect((await redeemInvite(db(), one, 'OTHERS')).status).toBe('too_many');
    expect((await redeemInvite(db(), other, 'OTHERS')).status).toBe('granted');
  });
});
