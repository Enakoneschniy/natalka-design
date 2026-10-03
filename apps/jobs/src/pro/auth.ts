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

export const LOGIN_TTL_SECONDS = 15 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Links one address may be sent per hour; past this a request is accepted and quietly dropped. */
export const LOGIN_REQUESTS_PER_HOUR = 5;

export interface ProAccount {
  id: string;
  email: string;
  tone: 'ty' | 'vy';
  session_epoch: number;
  created_at: string;
}

const ACCOUNT_COLUMNS = 'id, email, tone, session_epoch, created_at';

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

/** A single-use sign-in token for an address, or null when it has asked too often this hour. */
export async function createLoginToken(db: D1Database, email: string): Promise<string | null> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await db
    .prepare('SELECT COUNT(*) AS n FROM pro_login_tokens WHERE email = ? AND created_at > ?')
    .bind(email, hourAgo)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= LOGIN_REQUESTS_PER_HOUR) return null;

  const raw = randomToken();
  await db
    .prepare(
      'INSERT INTO pro_login_tokens (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)',
    )
    .bind(
      await hashToken(raw),
      email,
      new Date(Date.now() + LOGIN_TTL_SECONDS * 1000).toISOString(),
      now(),
    )
    .run();
  return raw;
}

/** Spends a sign-in token and returns the account behind it, creating it on first sign-in.
 * The UPDATE is the whole check: of two requests racing with one token, only one gets a row. */
export async function consumeLoginToken(db: D1Database, raw: string): Promise<ProAccount | null> {
  if (!raw) return null;
  const ts = now();
  const used = await db
    .prepare(
      `UPDATE pro_login_tokens SET used_at = ?
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       RETURNING email`,
    )
    .bind(ts, await hashToken(raw), ts)
    .first<{ email: string }>();
  if (!used) return null;

  await db
    .prepare('INSERT INTO pro_accounts (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING')
    .bind(crypto.randomUUID(), used.email, ts)
    .run();
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
