import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { stripeWebhook } from '../src/webhook';
import type { Env } from '../src/env';
import { letters, recordingQueue, testEnv } from './env';
import { seedOrder } from './seed';

const SECRET = 'whsec_test_fake';

async function signed(event: unknown): Promise<Request> {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://jobs.test/v1/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${t},v1=${v1}`, 'content-type': 'application/json' },
    body: payload,
  });
}

const paid = (orderId: string, jobId: string) => ({
  id: `evt_${crypto.randomUUID()}`,
  type: 'checkout.session.completed',
  data: {
    object: {
      id: `cs_${orderId}`,
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: `pi_${orderId}`,
      amount_subtotal: 1700,
      currency: 'eur',
      metadata: { order_id: orderId, job_id: jobId },
    },
  },
});

/** A bundle waiting for its payment of 17 EUR, from `email`, in `locale`. */
async function pendingOrder(email: string, locale: string) {
  const seeded = await seedOrder({ pro: false, name: 'Anna', product: 'bundle' });
  await testEnv.DB.prepare(
    "UPDATE orders SET status = 'pending', amount_minor = 1700, currency = 'EUR', email = ?, locale = ? WHERE id = ?",
  )
    .bind(email, locale, seeded.orderId)
    .run();
  return seeded;
}

describe('the confirmation of the contract', () => {
  it('reaches a German buyer before the reading is queued, with the consent and the Widerrufsbelehrung', async () => {
    const email = 'kaeuferin@confirm.test';
    const { orderId, jobId } = await pendingOrder(email, 'de');
    const sent: { jobId: string }[] = [];
    const env: Env = Object.create(testEnv);
    let lettersWhenQueued = -1;
    Object.defineProperty(env, 'JOBS', {
      value: {
        send: async (message: { jobId: string }) => {
          lettersWhenQueued = (await letters(email)).length;
          sent.push(message);
        },
      },
    });
    await stripeWebhook(await signed(paid(orderId, jobId)), env);
    expect(sent).toEqual([{ jobId }]);
    // The letter was out before the work began.
    expect(lettersWhenQueued).toBe(1);

    const [letter] = await letters(email);
    expect(letter?.subject).toBe(`Bestellbestätigung · ${orderId}`);
    for (const part of [
      orderId,
      'Geburtshoroskop und Prognose',
      '17\u00a0€',
      'coremind s. r. o.',
      'Ich stimme ausdrücklich zu, dass Sie vor Ablauf der Widerrufsfrist mit der Erstellung des Dokuments beginnen',
      'Widerrufsbelehrung',
      'binnen vierzehn Tagen ohne Angabe von Gründen',
      '§ 356 Abs. 6 BGB',
      'Muster-Widerrufsformular',
      'https://chronika.test/de/withdraw',
    ]) {
      expect(letter?.text, part).toContain(part);
    }
    const event = await testEnv.DB.prepare("SELECT status FROM email_events WHERE order_id = ? AND kind = 'confirmation'")
      .bind(orderId)
      .first<{ status: string }>();
    expect(event?.status).toBe('sent');
  });

  it('quotes a Russian buyer the consent they gave, in Russian', async () => {
    const email = 'pokupatel@confirm.test';
    const { orderId, jobId } = await pendingOrder(email, 'ru');
    await stripeWebhook(await signed(paid(orderId, jobId)), recordingQueue().env);
    const [letter] = await letters(email);
    expect(letter?.subject).toBe(`Подтверждение заказа · ${orderId}`);
    expect(letter?.text).toContain('Документ создаётся сразу после оплаты; с его доставкой право на отказ прекращается.');
    expect(letter?.text).toContain('14 дней на отказ');
  });
});

const SITE = { 'x-site-key': testEnv.SITE_KEY, 'content-type': 'application/json' };
const withdraw = (body: unknown, headers: Record<string, string> = SITE) =>
  SELF.fetch('https://jobs.test/v1/withdrawals', { method: 'POST', headers, body: JSON.stringify(body) });

describe('a withdrawal declared on the site', () => {
  it('gets the buyer a receipt with its content and the moment it arrived, and tells the owner', async () => {
    const email = 'widerruf@confirm.test';
    await pendingOrder(email, 'de');
    const response = await withdraw({
      locale: 'de',
      name: 'Anna Beispiel',
      email,
      order: 'Bestellung vom 2. November',
      message: 'Ich möchte den Vertrag widerrufen.',
    });
    expect(response.status).toBe(202);
    const { received_at } = (await response.json()) as { received_at: string };
    expect(Date.parse(received_at)).not.toBeNaN();

    const [receipt] = await letters(email);
    expect(receipt?.subject).toBe('Eingangsbestätigung Ihres Widerrufs');
    for (const part of ['Anna Beispiel', email, 'Bestellung vom 2. November', 'Ich möchte den Vertrag widerrufen.', 'Eingegangen am']) {
      expect(receipt?.text, part).toContain(part);
    }
    const told = (await letters('owner@alerts.test')).filter((l) => l.text.includes(email));
    expect(told).toHaveLength(1);
    expect(told[0]?.subject).toContain('Withdrawal from a contract');
  });

  it('mails nothing to an address that never ordered, and answers the same', async () => {
    const email = 'fremd@confirm.test';
    const response = await withdraw({ locale: 'de', name: 'Jemand', email, message: 'https://evil.example/login' });
    expect(response.status).toBe(202);
    expect(await letters(email)).toEqual([]);
    const told = (await letters('owner@alerts.test')).filter((l) => l.text.includes(email));
    expect(told[0]?.text).toContain('not sent: no order from this address');
  });

  it('quotes no link back, and sends one order at most three receipts a day', async () => {
    const email = 'viermal@confirm.test';
    await pendingOrder(email, 'de');
    for (let i = 0; i < 4; i++) {
      expect(
        (await withdraw({ locale: 'de', name: 'Anna', email, message: `Bitte hier klicken: https://evil.example/${i} oder evil.com` }))
          .status,
      ).toBe(202);
    }
    const receipts = await letters(email);
    expect(receipts).toHaveLength(3);
    expect(receipts[0]?.text).not.toContain('evil');
    expect(receipts[0]?.text).toContain('Bitte hier klicken: […] oder […]');
  });

  it('refuses a declaration without a name or an address, and one without the site key', async () => {
    expect((await withdraw({ locale: 'de', name: '', email: 'x@confirm.test' })).status).toBe(400);
    expect((await withdraw({ locale: 'de', name: 'A', email: 'nope' })).status).toBe(400);
    expect((await withdraw({ locale: 'xx', name: 'A', email: 'a@confirm.test' })).status).toBe(400);
    const anonymous = await withdraw({ locale: 'de', name: 'A', email: 'a@confirm.test' }, { 'content-type': 'application/json' });
    expect(anonymous.status).toBe(401);
  });
});
