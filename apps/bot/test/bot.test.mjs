import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import worker from '../src/index.ts';

const ORIGIN = 'https://bot.test';
const SETUP_KEY = 'setup-key-for-tests';

/** Bot API calls the worker made, answered the way Telegram answers them. */
let telegram = [];
/** Calls the worker made to the jobs worker over its binding. */
let jobs = [];

beforeEach(() => {
  telegram = [];
  jobs = [];
  mock.method(globalThis, 'fetch', async (url, init) => {
    telegram.push({ method: String(url).split('/').pop(), body: JSON.parse(init.body) });
    return Response.json({ ok: true, result: true, description: 'Webhook was set' });
  });
});

afterEach(() => mock.restoreAll());

function env(overrides = {}) {
  return {
    SITE_URL: 'https://chronika.test',
    TELEGRAM_BOT_TOKEN: '123456:token-for-tests',
    SETUP_KEY,
    JOBS: {
      forgetTelegram: async (chatId) => {
        jobs.push({ forgetTelegram: chatId });
      },
    },
    ...overrides,
  };
}

const call = (path, init = {}, bindings = env()) =>
  worker.fetch(new Request(`${ORIGIN}${path}`, init), bindings);

const setupWith = (key, bindings) =>
  call('/setup', key === undefined ? {} : { headers: { 'x-setup-key': key } }, bindings);

describe('/setup', () => {
  it('is an unknown path while SETUP_KEY is not configured', async () => {
    const unknown = await call('/nothing-here');
    for (const key of [undefined, '', SETUP_KEY]) {
      const response = await setupWith(key, env({ SETUP_KEY: undefined }));
      assert.equal(response.status, 404);
      assert.equal(await response.text(), await unknown.clone().text());
    }
    assert.equal(telegram.length, 0);
  });

  it('is an unknown path without the right key', async () => {
    for (const key of [undefined, '', 'setup-key-for-test5', 'setup-key', `${SETUP_KEY}!`]) {
      const response = await setupWith(key);
      assert.equal(response.status, 404, `key ${JSON.stringify(key)}`);
    }
    assert.equal(telegram.length, 0);
  });

  it('points the webhook at this worker and keeps the updates Telegram is holding', async () => {
    const response = await setupWith(SETUP_KEY);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { webhook: true, note: 'Webhook was set' });
    assert.deepEqual(
      telegram.map((c) => c.method),
      ['setWebhook', 'setMyCommands'],
    );
    const [webhook] = telegram;
    assert.equal(webhook.body.url, `${ORIGIN}/webhook`);
    assert.equal(webhook.body.drop_pending_updates, false);
    assert.deepEqual(webhook.body.allowed_updates, ['message']);
    assert.match(webhook.body.secret_token, /^[0-9a-f]{32}$/);
  });

  it('compares the key in constant time', async () => {
    const compare = mock.method(crypto.subtle, 'timingSafeEqual');
    await setupWith(SETUP_KEY);
    assert.equal(compare.mock.callCount(), 1);
  });
});

describe('/webhook', () => {
  const update = {
    update_id: 1,
    message: { message_id: 1, chat: { id: 42, type: 'private' }, text: '/stop' },
  };

  async function secretTelegramWasGiven() {
    await setupWith(SETUP_KEY);
    const secret = telegram[0].body.secret_token;
    telegram = [];
    return secret;
  }

  const post = (secret) =>
    call('/webhook', {
      method: 'POST',
      headers: secret === undefined ? {} : { 'x-telegram-bot-api-secret-token': secret },
      body: JSON.stringify(update),
    });

  it('refuses updates that do not carry the secret', async () => {
    const secret = await secretTelegramWasGiven();
    for (const given of [undefined, '', secret.slice(0, -1), `${secret.slice(0, -1)}x`]) {
      const response = await post(given);
      assert.equal(response.status, 403, `secret ${JSON.stringify(given)}`);
    }
    assert.deepEqual(jobs, []);
    assert.equal(telegram.length, 0);
  });

  it('handles updates that carry the secret', async () => {
    const response = await post(await secretTelegramWasGiven());

    assert.equal(response.status, 200);
    assert.deepEqual(jobs, [{ forgetTelegram: 42 }]);
    assert.equal(telegram.length, 1);
    assert.equal(telegram[0].method, 'sendMessage');
    assert.equal(telegram[0].body.chat_id, 42);
  });

  it('compares the secret in constant time', async () => {
    const secret = await secretTelegramWasGiven();
    const compare = mock.method(crypto.subtle, 'timingSafeEqual');
    await post(secret);
    assert.equal(compare.mock.callCount(), 1);
  });
});

describe('/health', () => {
  it('answers without any key', async () => {
    const response = await call('/health');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', configured: true });
  });
});
