import { createExecutionContext, createScheduledController, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { encryptJson, readLink, signLink } from '../src/crypto';
import type { Env } from '../src/env';
import worker from '../src/index';
import { deliverHoroscope, sealLegacyCharts, sweepSubscriptions } from '../src/subscriptions';
import { lastRequest, letters, recordingQueue, testEnv } from './env';

const SITE = { 'x-site-key': 'test-site-key', 'content-type': 'application/json' };
const BIRTH = {
  date: '1992-03-08',
  time: '09:15',
  latitude: 50.45,
  longitude: 30.52,
  zone: 'Europe/Kyiv',
  place: 'Киев',
  name: 'Марта',
  gender: 'f',
};
const request = (email: string, patch: Record<string, unknown> = {}) => ({
  email,
  locale: 'ru',
  cadence: 'week',
  birth: BIRTH,
  ...patch,
});

const call = (env: Env, method: string, path: string, body?: unknown) =>
  worker.fetch(
    new Request(`https://jobs.test${path}`, {
      method,
      headers: SITE,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    createExecutionContext(),
  );
const subscribe = (body: unknown, env: Env = testEnv) => call(env, 'POST', '/v1/subscriptions', body);
const confirm = (token: unknown, env: Env = testEnv) => call(env, 'POST', '/v1/subscriptions/confirm', { token });

const rows = async (email: string) =>
  (
    await testEnv.DB.prepare('SELECT * FROM subscriptions WHERE email = ? ORDER BY created_at, rowid')
      .bind(email)
      .all<Record<string, unknown>>()
  ).results;

/** The confirmation tokens in the letters sent to an address, oldest first. */
const confirmTokens = async (email: string) =>
  (await letters(email))
    .map((letter) => letter.text.match(/\/subscription\/confirm\?t=(\S+)/)?.[1])
    .filter((token): token is string => Boolean(token));

/** Subscribes and confirms, and returns the subscription's id and management token. */
async function confirmed(email: string, env: Env = testEnv) {
  await subscribe(request(email));
  const [token] = await confirmTokens(email);
  const response = await confirm(token, env);
  const { token: manage } = (await response.json()) as { token: string };
  const id = ((await rows(email))[0]?.id as string) ?? '';
  return { id, manage };
}

describe('POST /v1/subscriptions', () => {
  it('stores a pending request, sends only the confirmation letter and queues nothing', async () => {
    const { env, sent } = recordingQueue();
    const response = await subscribe(request(' Pending@Subs.test '), env);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: 'pending' });
    expect(sent).toEqual([]);

    const [row] = await rows('pending@subs.test');
    expect(row).toMatchObject({
      status: 'paused',
      confirmed_at: null,
      trial_ends_at: null,
      ended_at: null,
      chart_json: '',
      chart_ciphertext: null,
      display_name: null,
    });
    expect(JSON.stringify(row)).not.toContain('Марта');

    const [letter] = await letters('pending@subs.test');
    expect(letter?.subject).toBe('Подтвердите подписку на гороскопы');
    const [token] = await confirmTokens('pending@subs.test');
    expect(letter?.html).toContain(`https://chronika.test/ru/subscription/confirm?t=${token}`);
    expect(await readLink('subconfirm', token as string, testEnv.LINK_KEY)).toEqual({ sub: row?.id });
    const exp = JSON.parse(atob((token as string).split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).exp;
    expect(exp * 1000 - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(exp * 1000 - Date.now()).toBeLessThanOrEqual(7 * 86_400_000);
  });

  it('writes the letter in the subscriber’s language', async () => {
    await subscribe(request('uk@subs.test', { locale: 'uk' }));
    await subscribe(request('en@subs.test', { locale: 'en' }));
    expect((await letters('uk@subs.test'))[0]?.subject).toBe('Підтвердіть підписку на гороскопи');
    expect((await letters('en@subs.test'))[0]?.subject).toBe('Confirm your horoscope subscription');
    expect((await confirmTokens('uk@subs.test'))[0]).toBeTruthy();
  });

  it('treats a repeated request as the same one and sends at most three letters a day', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await subscribe(request('again@subs.test'));
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ status: 'pending' });
    }
    expect(await rows('again@subs.test')).toHaveLength(1);
    expect(await letters('again@subs.test')).toHaveLength(3);
  });

  it('keeps at most three subscriptions waiting or running per address, and says nothing about it', async () => {
    for (const date of ['1990-01-01', '1990-01-02', '1990-01-03', '1990-01-04']) {
      const response = await subscribe(request('many@subs.test', { birth: { ...BIRTH, date } }));
      expect(await response.json()).toEqual({ status: 'pending' });
    }
    expect(await rows('many@subs.test')).toHaveLength(3);
    expect(await letters('many@subs.test')).toHaveLength(3);
  });

  it('refuses malformed fields by name', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ email: 'nope' }, 'email'],
      [{ locale: 'pl' }, 'locale'],
      [{ cadence: 'day' }, 'cadence'],
      [{ birth: { ...BIRTH, date: '1992-13-01' } }, 'birth.date'],
      [{ birth: { ...BIRTH, latitude: 100 } }, 'birth.latitude'],
      [{ birth: { ...BIRTH, name: 'М'.repeat(81) } }, 'birth.name'],
    ];
    for (const [patch, field] of cases) {
      const response = await subscribe(request('bad@subs.test', patch));
      expect(response.status, JSON.stringify(patch)).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid', field });
    }
    expect(await rows('bad@subs.test')).toEqual([]);
  });

  it('takes a subscription without a name', async () => {
    expect((await subscribe(request('noname@subs.test', { birth: { ...BIRTH, name: '' } }))).status).toBe(202);
  });
});

describe('POST /v1/subscriptions/confirm', () => {
  it('starts the free month, encrypts the chart and queues the first horoscope, once', async () => {
    await subscribe(request('confirm@subs.test'));
    const [token] = await confirmTokens('confirm@subs.test');
    const { env, sent } = recordingQueue();

    const first = await confirm(token, env);
    expect(first.status).toBe(200);
    const { token: manage } = (await first.json()) as { token: string };
    expect(await readLink('sub', manage, testEnv.LINK_KEY)).toBeTruthy();
    const [row] = await rows('confirm@subs.test');
    expect(sent).toEqual([{ subscriptionId: row?.id }]);
    expect(row).toMatchObject({ status: 'active', ended_at: null, chart_json: '', display_name: null });
    expect(row?.chart_ciphertext).toBeTruthy();
    const trial = Date.parse(row?.trial_ends_at as string) - Date.now();
    expect(trial).toBeGreaterThan(29.9 * 86_400_000);
    expect(trial).toBeLessThanOrEqual(30 * 86_400_000);

    const again = await confirm(token, env);
    expect(again.status).toBe(200);
    expect(sent).toHaveLength(1);

    const view = await SELF.fetch(`https://jobs.test/v1/subscriptions/${manage}`, { headers: SITE });
    expect(await view.json()).toMatchObject({ status: 'active', name: 'Марта', cadence: 'week' });
  });

  it('answers 404 for a link that is not a valid confirmation', async () => {
    await subscribe(request('wrong@subs.test'));
    const [row] = await rows('wrong@subs.test');
    const manage = await signLink('sub', { sub: row?.id as string }, testEnv.LINK_KEY, 60);
    const expired = await signLink('subconfirm', { sub: row?.id as string }, testEnv.LINK_KEY, -10);
    const order = await signLink('order', { order: 'o', job: 'j' }, testEnv.LINK_KEY, 60);
    for (const token of ['a.b.c', manage, expired, order, 42]) {
      expect((await confirm(token)).status, String(token)).toBe(404);
    }
    expect((await rows('wrong@subs.test'))[0]).toMatchObject({ confirmed_at: null });
    // A GET is never a confirmation: mail scanners open links.
    const scanned = await SELF.fetch('https://jobs.test/v1/subscriptions/confirm', { headers: SITE });
    expect(scanned.status).toBe(404);
  });
});

describe('a confirmed subscription', () => {
  it('gets its horoscope written from the encrypted chart, to its name', async () => {
    const { id } = await confirmed('horoscope@subs.test');
    await deliverHoroscope(testEnv, id);
    const sent = (await lastRequest('/v1/horoscope|Марта')) as Record<string, unknown>;
    expect(sent).toMatchObject({ name: 'Марта', facts: { positions: [{ body: 'Sun', longitude: 347.5 }] } });
    const letter = (await letters('horoscope@subs.test')).find((l) => l.subject.startsWith('Неделя для Марта'));
    expect(letter).toBeTruthy();
  });

  it('ends with one letter when the free month is over, and queues nothing', async () => {
    const { id, manage } = await confirmed('trial@subs.test');
    await testEnv.DB.prepare('UPDATE subscriptions SET trial_ends_at = ?, next_send_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), new Date(Date.now() - 1000).toISOString(), id)
      .run();
    const { env, sent } = recordingQueue();
    const hourly = () => worker.scheduled(createScheduledController({ cron: '5 * * * *' }), env, createExecutionContext());
    await hourly();
    await hourly();
    expect(sent.filter((m) => 'subscriptionId' in m && m.subscriptionId === id)).toEqual([]);
    expect((await rows('trial@subs.test'))[0]).toMatchObject({ status: 'paused' });
    expect((await rows('trial@subs.test'))[0]?.ended_at).toBeTruthy();
    const ended = (await letters('trial@subs.test')).filter((l) => l.subject === 'Бесплатный месяц закончился');
    expect(ended).toHaveLength(1);
    expect(ended[0]?.text).toContain(`https://chronika.test/ru/subscription?t=`);

    const view = await SELF.fetch(`https://jobs.test/v1/subscriptions/${manage}`, { headers: SITE });
    expect(await view.json()).toMatchObject({ status: 'ended' });
    const resume = await call(testEnv, 'PATCH', `/v1/subscriptions/${manage}`, { status: 'active' });
    expect(resume.status).toBe(409);
    expect((await call(testEnv, 'PATCH', `/v1/subscriptions/${manage}`, { status: 'cancelled' })).status).toBe(200);
  });

  it('is not written for once its free month is over, even when the queue already had it', async () => {
    const { id } = await confirmed('late@subs.test');
    await testEnv.DB.prepare('UPDATE subscriptions SET trial_ends_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), id)
      .run();
    await deliverHoroscope(testEnv, id);
    expect((await rows('late@subs.test'))[0]?.ended_at).toBeTruthy();
    const written = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM horoscopes WHERE subscription_id = ?')
      .bind(id)
      .first<{ n: number }>();
    expect(written?.n).toBe(0);
  });
});

describe('subscriptions from before this release', () => {
  async function legacy(email: string, patch: Record<string, unknown> = {}) {
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();
    const { ciphertext, nonce } = await encryptJson(BIRTH, testEnv.DATA_KEY);
    const row = {
      status: 'active',
      confirmed_at: ts,
      trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      display_name: 'Старая',
      chart_json: JSON.stringify({ positions: [{ body: 'Moon', longitude: 3 }], houses: null }),
      ...patch,
    };
    await testEnv.DB.prepare(
      `INSERT INTO subscriptions (id, email, locale, gender, display_name, cadence, chart_json, birth_ciphertext,
         birth_nonce, birth_expires_at, status, next_send_at, trial_ends_at, confirmed_at, created_at, updated_at)
       VALUES (?, ?, 'ru', 'f', ?, 'week', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, email, row.display_name, row.chart_json, ciphertext, nonce, ts, row.status, ts, row.trial_ends_at, row.confirmed_at, ts, ts)
      .run();
    return { id, manage: await signLink('sub', { sub: id }, testEnv.LINK_KEY, 60) };
  }

  it('are written from their plain chart and name, until the sweep encrypts both', async () => {
    const { id, manage } = await legacy('old@subs.test');
    await deliverHoroscope(testEnv, id);
    expect(await lastRequest('/v1/horoscope|Старая')).toMatchObject({ facts: { positions: [{ body: 'Moon' }] } });

    while ((await sealLegacyCharts(testEnv, 200)) > 0) {
      // until no plain chart is left
    }
    const [row] = await rows('old@subs.test');
    expect(row).toMatchObject({ chart_json: '', display_name: null });
    expect(row?.chart_ciphertext).toBeTruthy();
    const view = await SELF.fetch(`https://jobs.test/v1/subscriptions/${manage}`, { headers: SITE });
    expect(await view.json()).toMatchObject({ status: 'active', name: 'Старая' });
  });

  it('count as confirmed when the previous worker made them during the deploy', async () => {
    const { manage } = await legacy('deploy@subs.test', { confirmed_at: null });
    const view = await SELF.fetch(`https://jobs.test/v1/subscriptions/${manage}`, { headers: SITE });
    expect(await view.json()).toMatchObject({ status: 'active' });
    await sealLegacyCharts(testEnv, 200);
    expect((await rows('deploy@subs.test'))[0]?.confirmed_at).toBeTruthy();
  });
});

describe('the subscription sweep', () => {
  it('drops unconfirmed requests after a week and stopped subscriptions a month after they stopped', async () => {
    const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    await subscribe(request('sweep-old@subs.test'));
    await subscribe(request('sweep-new@subs.test'));
    await testEnv.DB.prepare('UPDATE subscriptions SET created_at = ? WHERE email = ?').bind(days(8), 'sweep-old@subs.test').run();
    const cancelled = await confirmed('sweep-cancelled@subs.test');
    const ended = await confirmed('sweep-ended@subs.test');
    const recent = await confirmed('sweep-recent@subs.test');
    await testEnv.DB.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(days(31), cancelled.id).run();
    await testEnv.DB.prepare("UPDATE subscriptions SET status = 'paused', ended_at = ? WHERE id = ?").bind(days(31), ended.id).run();
    await testEnv.DB.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(days(5), recent.id).run();

    await sweepSubscriptions(testEnv.DB);
    expect(await rows('sweep-old@subs.test')).toEqual([]);
    expect(await rows('sweep-new@subs.test')).toHaveLength(1);
    expect(await rows('sweep-cancelled@subs.test')).toEqual([]);
    expect(await rows('sweep-ended@subs.test')).toEqual([]);
    expect(await rows('sweep-recent@subs.test')).toHaveLength(1);
  });
});
