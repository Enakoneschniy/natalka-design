import { encryptJson } from '../src/crypto';
import { insertChart, insertJob, type Product } from '../src/db';
import { createClient } from '../src/pro/clients';
import { grant } from '../src/pro/credits';
import { createReading, readingRow } from '../src/pro/readings';
import { signIn, testEnv } from './env';
import { ANNA } from './people';

/** An order with one chart and a queued job, inserted directly, B2C or a seller's. */
export async function seedOrder(opts: {
  pro: boolean;
  name: string;
  product?: Product;
  date?: string;
  createdAt?: string;
}): Promise<{ orderId: string; jobId: string; accountId: string | null }> {
  const orderId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const product = opts.product ?? 'natal';
  const accountId = opts.pro ? (await signIn(`seed-${orderId}@seed.test`)).account.id : null;
  await testEnv.DB.prepare(
    `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status, pro_account_id, created_at)
     VALUES (?, 'buyer@seed.test', ?, 'ru', 0, 'EUR', 'test', ?, ?)`,
  )
    .bind(orderId, product, accountId, opts.createdAt ?? new Date().toISOString())
    .run();
  const { ciphertext, nonce } = await encryptJson(
    {
      date: opts.date ?? '1994-05-15',
      time: '15:25',
      latitude: 45.2,
      longitude: 33.36,
      zone: 'Europe/Simferopol',
      place: 'Евпатория',
      name: opts.name,
      gender: 'f',
      lang: 'ru',
    },
    testEnv.DATA_KEY,
  );
  await insertChart(testEnv.DB, {
    id: crypto.randomUUID(),
    order_id: orderId,
    ciphertext,
    nonce,
    unknown_time: false,
    gender: 'f',
    display_name: opts.name,
    place_label: 'Евпатория',
    expires_at: '9999-12-31T23:59:59.999Z',
  });
  await insertJob(testEnv.DB, { id: jobId, order_id: orderId, kind: product });
  return { orderId, jobId, accountId };
}

/** A signed-in seller with 3 credits, one client and one freshly ordered reading. */
export async function readingFor(name: string, overrides: Partial<typeof ANNA> = {}, product = 'natal') {
  const { account } = await signIn(`r-${crypto.randomUUID()}@life.test`);
  await grant(testEnv.DB, { accountId: account.id, delta: 3, reason: 'adjust', ref: null });
  const clientId = await createClient(testEnv, account.id, { ...ANNA, name, ...overrides });
  const created = (await createReading(testEnv, account, { product, client_id: clientId })) as { id: string };
  const row = await readingRow(testEnv.DB, created.id, account.id);
  return { account, clientId, id: created.id, jobId: row?.job_id as string };
}
