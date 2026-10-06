/** Signing sellers in to Chronika Pro.
 *
 * No passwords and no auth library: a seller asks for a link, the link carries a random token
 * that works once for fifteen minutes, and spending it yields a session token signed with a key
 * of its own. Only the hash of a login token is stored. Sessions carry the account's epoch, so
 * raising the epoch signs the account out of every device at once.
 */

import { sha256Hex, signToken, verifyToken } from '../crypto';
import { now } from '../db';
import type { Env } from '../env';
import { errorCode } from '../errors';
import { redeemInvite } from './invites';

export const LOGIN_TTL_SECONDS = 15 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Links one address may be sent per hour at the request of one requester, and in all. Past
 * either, a request is accepted and quietly dropped. The first keeps somebody else from using up
 * an address's hour; the second bounds what reaches a mailbox from many requesters. */
export const LINKS_PER_REQUESTER_HOUR = 5;
export const LINKS_PER_ADDRESS_HOUR = 20;

export interface ProAccount {
  id: string;
  email: string;
  name: string | null;
  tone: 'ty' | 'vy';
  session_epoch: number;
  created_at: string;
}

const ACCOUNT_COLUMNS = 'id, email, name, tone, session_epoch, created_at';

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

const hashToken = (raw: string): Promise<string> =>
  sha256Hex(new TextEncoder().encode(raw).buffer as ArrayBuffer);

/** 256 random bits, URL-safe. */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function accountExists(db: D1Database, email: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS yes FROM pro_accounts WHERE email = ?').bind(email).first();
  return Boolean(row);
}

interface TokenInput {
  purpose: 'login' | 'signup';
  name: string | null;
  invite: string | null;
}

/** Stores a single-use token for an address, or returns null when the address has had its links
 * for this hour: LINKS_PER_REQUESTER_HOUR at this requester's request (see requester.ts), or
 * LINKS_PER_ADDRESS_HOUR in all, whoever asked ('unknown' and rows without a requester included).
 * Login and sign-up tokens count together. Both counts and the insert are one statement, so
 * requests racing each other cannot pass either limit. */
async function createToken(
  db: D1Database,
  email: string,
  requester: string,
  input: TokenInput,
): Promise<string | null> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const raw = randomToken();
  const stored = await db
    .prepare(
      `INSERT INTO pro_login_tokens (token_hash, email, expires_at, created_at, purpose, signup_name, signup_invite, requester)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM pro_login_tokens WHERE email = ? AND created_at > ?) < ?
         AND (SELECT COUNT(*) FROM pro_login_tokens WHERE email = ? AND requester = ? AND created_at > ?) < ?`,
    )
    .bind(
      await hashToken(raw),
      email,
      new Date(Date.now() + LOGIN_TTL_SECONDS * 1000).toISOString(),
      now(),
      input.purpose,
      input.name,
      input.invite,
      requester,
      email,
      hourAgo,
      LINKS_PER_ADDRESS_HOUR,
      email,
      requester,
      hourAgo,
      LINKS_PER_REQUESTER_HOUR,
    )
    .run();
  return (stored.meta.changes ?? 0) > 0 ? raw : null;
}

/** A single-use sign-in token for an address, or null when it is over its limits this hour. */
export const createLoginToken = (db: D1Database, email: string, requester: string): Promise<string | null> =>
  createToken(db, email, requester, { purpose: 'login', name: null, invite: null });

/** A single-use token that, once spent, creates the account for an address. */
export const createSignupToken = (
  db: D1Database,
  email: string,
  requester: string,
  { name, invite }: { name: string | null; invite?: string | null },
): Promise<string | null> =>
  createToken(db, email, requester, {
    purpose: 'signup',
    name,
    invite: invite?.trim().toUpperCase() || null,
  });

/** An address as the sign-in confirm page shows it: the first two characters of the local part, or
 * one when it has two or fewer, then `***@` and the whole domain (`ab@x.com` → `a***@x.com`,
 * `abc@x.com` → `ab***@x.com`). The site masks the signed-in seller's address the same way and
 * compares the two. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const keep = at <= 2 ? 1 : 2;
  return `${email.slice(0, keep)}***@${email.slice(at + 1)}`;
}

/** The address a sign-in or sign-up link would open, without spending it: only while the link is
 * unused and unexpired, and for a sign-in link only while its account exists. */
export async function peekLoginToken(db: D1Database, raw: string): Promise<string | null> {
  if (!raw) return null;
  const row = await db
    .prepare(
      `SELECT t.email FROM pro_login_tokens t
       WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ?
         AND (t.purpose = 'signup' OR EXISTS (SELECT 1 FROM pro_accounts a WHERE a.email = t.email))`,
    )
    .bind(await hashToken(raw), now())
    .first<{ email: string }>();
  return row?.email ?? null;
}

/** Spends a token and returns the account behind it. A sign-up token creates the account (an
 * existing one is left as it is); a login token needs the account to exist already.
 * The UPDATE is the whole check: of two requests racing with one token, only one gets a row. */
export async function consumeLoginToken(db: D1Database, raw: string): Promise<ProAccount | null> {
  if (!raw) return null;
  const ts = now();
  const used = await db
    .prepare(
      `UPDATE pro_login_tokens SET used_at = ?
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       RETURNING email, purpose, signup_name, signup_invite`,
    )
    .bind(ts, await hashToken(raw), ts)
    .first<{ email: string; purpose: 'login' | 'signup'; signup_name: string | null; signup_invite: string | null }>();
  if (!used) return null;

  if (used.purpose === 'signup') {
    const created = await db
      .prepare(
        `INSERT INTO pro_accounts (id, email, name, terms_accepted_at, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
      )
      .bind(crypto.randomUUID(), used.email, used.signup_name, ts, ts)
      .first<{ id: string }>();
    if (created && used.signup_invite) {
      // A code that does not work must not stop the sign-up: the seller can enter one later.
      try {
        await redeemInvite(db, created.id, used.signup_invite);
      } catch (error) {
        console.error('sign-up invite failed', created.id, errorCode(error));
      }
    }
  }
  return db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM pro_accounts WHERE email = ?`)
    .bind(used.email)
    .first<ProAccount>();
}

export const issueSession = (env: Env, account: ProAccount): Promise<string> =>
  signToken(
    { typ: 'pro', sub: account.id, epoch: account.session_epoch },
    env.SESSION_KEY,
    SESSION_TTL_SECONDS,
  );

/** The account behind a request's bearer session, or null. Never throws on a malformed token:
 * whatever arrives in the header is somebody else's input. */
export async function authenticate(request: Request, env: Env): Promise<ProAccount | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return null;
  let claims: { typ?: unknown; sub?: unknown; epoch?: unknown } | null;
  try {
    claims = await verifyToken(token, env.SESSION_KEY);
  } catch {
    return null;
  }
  if (!claims || claims.typ !== 'pro' || typeof claims.sub !== 'string') return null;
  if (typeof claims.epoch !== 'number') return null;
  return env.DB.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM pro_accounts WHERE id = ? AND session_epoch = ?`)
    .bind(claims.sub, claims.epoch)
    .first<ProAccount>();
}

/** Signs the account out everywhere: every session issued so far stops matching. */
export async function endSessions(db: D1Database, accountId: string): Promise<void> {
  await db
    .prepare('UPDATE pro_accounts SET session_epoch = session_epoch + 1 WHERE id = ?')
    .bind(accountId)
    .run();
}
