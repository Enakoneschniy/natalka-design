/**
 * The edge's rules, run with `node --test` (Node strips the types): the Worker entry itself needs
 * the containers runtime, so everything it decides lives in src/edge.ts and is checked here.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { containerEnv, MAX_BODY_BYTES, refusal, sameKey } from '../src/edge.ts';

const KEY = 'k'.repeat(48);

function request(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Request {
  return new Request(`https://natalka-api.test${path}`, { method, headers, body });
}

async function statusOf(r: Request, key: string | undefined = KEY): Promise<number | null> {
  const refused = await refusal(r, key);
  return refused ? refused.status : null;
}

describe('access', () => {
  test('the two health checks need no key, even before the key is configured', async () => {
    for (const key of [KEY, undefined]) {
      assert.equal(await statusOf(request('GET', '/health'), key), null);
      assert.equal(await statusOf(request('GET', '/edge-health'), key), null);
    }
  });

  test('only GET is open on the health paths', async () => {
    assert.equal(await statusOf(request('POST', '/health', { 'content-length': '2' }, '{}')), 401);
    assert.equal(await statusOf(request('HEAD', '/health')), 401);
    assert.equal(await statusOf(request('GET', '/health/')), 401);
  });

  test('everything else needs the key', async () => {
    const refused = await refusal(request('GET', '/v1/sections'), KEY);
    assert.equal(refused?.status, 401);
    assert.deepEqual(await refused?.json(), { error: 'unauthorized' });
    assert.equal(await statusOf(request('OPTIONS', '/v1/section')), 401);
  });

  test('a wrong key is refused, including a prefix of the right one', async () => {
    for (const wrong of ['', 'nope', KEY.slice(0, -1), `${KEY}k`, KEY.toUpperCase()]) {
      assert.equal(await statusOf(request('GET', '/v1/sections', { 'x-api-key': wrong })), 401);
    }
  });

  test('the right key goes through', async () => {
    assert.equal(await statusOf(request('GET', '/v1/sections', { 'x-api-key': KEY })), null);
    const post = request('POST', '/v1/section', { 'x-api-key': KEY, 'content-length': '2' }, '{}');
    assert.equal(await statusOf(post), null);
  });

  test('without a configured key nothing but the health checks is served', async () => {
    const refused = await refusal(request('GET', '/v1/sections', { 'x-api-key': '' }), undefined);
    assert.equal(refused?.status, 503);
    assert.equal(await statusOf(request('GET', '/v1/sections', { 'x-api-key': KEY }), ''), 503);
  });
});

describe('bodies', () => {
  const headers = (length?: string): Record<string, string> =>
    length === undefined ? { 'x-api-key': KEY } : { 'x-api-key': KEY, 'content-length': length };

  test('a body of unknown length is refused', async () => {
    assert.equal(await statusOf(request('POST', '/v1/document', headers(), '{}')), 411);
    assert.equal(await statusOf(request('POST', '/v1/document', headers('ten'), '{}')), 411);
  });

  test('a request without a body needs no length', async () => {
    assert.equal(await statusOf(request('POST', '/v1/document', headers())), null);
    assert.equal(await statusOf(request('GET', '/v1/sections', headers())), null);
  });

  test('a body over 8 MB is refused, whatever the method', async () => {
    assert.equal(MAX_BODY_BYTES, 8 * 1024 * 1024);
    const over = String(MAX_BODY_BYTES + 1);
    assert.equal(await statusOf(request('POST', '/v1/document', headers(over))), 413);
    assert.equal(await statusOf(request('GET', '/v1/sections', headers(over))), 413);
    const exact = String(MAX_BODY_BYTES);
    assert.equal(await statusOf(request('POST', '/v1/document', headers(exact))), null);
  });

  test('the key is checked before the body', async () => {
    const r = request('POST', '/v1/document', { 'content-length': String(MAX_BODY_BYTES + 1) });
    assert.equal(await statusOf(r), 401);
  });
});

describe('sameKey', () => {
  test('compares whole values', async () => {
    assert.equal(await sameKey(KEY, KEY), true);
    assert.equal(await sameKey(KEY, `${KEY} `), false);
    assert.equal(await sameKey('', KEY), false);
  });
});

describe('container environment', () => {
  test('the gateway token is passed only when it is set', () => {
    const without = containerEnv({ NATALKA_MODEL_API_KEY: 'm', NATALKA_AI_GATEWAY_URL: 'g' });
    assert.deepEqual(without, { NATALKA_MODEL_API_KEY: 'm', NATALKA_AI_GATEWAY_URL: 'g' });
    const blank = containerEnv({ NATALKA_MODEL_API_KEY: 'm', NATALKA_AI_GATEWAY_TOKEN: '' });
    assert.equal('NATALKA_AI_GATEWAY_TOKEN' in blank, false);
    const withToken = containerEnv({ NATALKA_MODEL_API_KEY: 'm', NATALKA_AI_GATEWAY_TOKEN: 't' });
    assert.equal(withToken.NATALKA_AI_GATEWAY_TOKEN, 't');
  });

  test('the model key falls back to the name it was first stored under', () => {
    assert.equal(containerEnv({ NATALKA_ANTHROPIC_API_KEY: 'old' }).NATALKA_MODEL_API_KEY, 'old');
    assert.equal(containerEnv({}).NATALKA_MODEL_API_KEY, '');
  });

  test('the access key never reaches the container', () => {
    const workerEnv = { NATALKA_MODEL_API_KEY: 'm', ACCESS_KEY: KEY };
    assert.equal(Object.values(containerEnv(workerEnv)).includes(KEY), false);
  });
});
