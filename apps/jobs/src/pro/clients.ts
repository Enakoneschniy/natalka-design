/** A seller's clients: the people their readings are about.
 *
 * Everything that identifies a client is encrypted the way a shopper's chart is; the table holds
 * ciphertext, the owner and two dates. A list decrypts each row; a seller has tens of clients, not
 * thousands, and nothing is searchable in the clear by design.
 */

import { type Blobish, decryptJson, encryptJson } from '../crypto';
import { now } from '../db';
import type { Env } from '../env';

export interface ClientBirth {
  name: string;
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  place: string;
  gender: 'f' | 'm' | 'n';
}

export interface ClientView extends ClientBirth {
  id: string;
  created_at: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
};

const EARLIEST_BIRTH = '1900-01-01';

const realDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  // Dates compare as strings: both are zero-padded ISO. Sane means 1900 up to today, UTC.
  return value >= EARLIEST_BIRTH && value <= new Date().toISOString().slice(0, 10) ? value : null;
};

const within = (value: unknown, limit: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;

/** A client's birth from untrusted input, or null when any part is missing or malformed. The time
 * is null when unknown — said explicitly, never by leaving it out. */
export function parseClientBirth(raw: unknown): ClientBirth | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const name = text(b.name, 80);
  const place = text(b.place, 200);
  const zone = text(b.zone, 64);
  const date = realDate(b.date);
  const time = b.time === null ? null : typeof b.time === 'string' && TIME.test(b.time) ? b.time : undefined;
  const latitude = within(b.latitude, 90);
  const longitude = within(b.longitude, 180);
  const gender = b.gender === 'f' || b.gender === 'm' || b.gender === 'n' ? b.gender : null;
  if (!name || !place || !zone || !date || time === undefined) return null;
  if (latitude === null || longitude === null || !gender) return null;
  return { name, date, time, latitude, longitude, zone, place, gender };
}

export async function createClient(env: Env, accountId: string, birth: ClientBirth): Promise<string> {
  const id = crypto.randomUUID();
  const ts = now();
  const { ciphertext, nonce } = await encryptJson(birth, env.DATA_KEY);
  await env.DB.prepare(
    `INSERT INTO pro_clients (id, account_id, birth_ciphertext, birth_nonce, consent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, accountId, ciphertext, nonce, ts, ts)
    .run();
  return id;
}

interface ClientRow {
  id: string;
  birth_ciphertext: Blobish;
  birth_nonce: Blobish;
  created_at: string;
}

const view = async (env: Env, row: ClientRow): Promise<ClientView> => ({
  ...(await decryptJson<ClientBirth>(row.birth_ciphertext, row.birth_nonce, env.DATA_KEY)),
  id: row.id,
  created_at: row.created_at,
});

export async function listClients(env: Env, accountId: string): Promise<ClientView[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, birth_ciphertext, birth_nonce, created_at FROM pro_clients
     WHERE account_id = ? ORDER BY created_at DESC, rowid DESC`,
  )
    .bind(accountId)
    .all<ClientRow>();
  return Promise.all(results.map((row) => view(env, row)));
}

export async function getClient(env: Env, accountId: string, clientId: string): Promise<ClientView | null> {
  const row = await env.DB.prepare(
    'SELECT id, birth_ciphertext, birth_nonce, created_at FROM pro_clients WHERE id = ? AND account_id = ?',
  )
    .bind(clientId, accountId)
    .first<ClientRow>();
  return row ? view(env, row) : null;
}
