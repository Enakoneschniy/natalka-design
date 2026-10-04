import { beforeEach, describe, expect, it, vi } from 'vitest';

const readSession = vi.fn();
const me = vi.fn();
const proCall = vi.fn();
vi.mock('./session', () => ({ readSession: () => readSession() }));
vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  me: (session: string) => me(session),
  proCall: (path: string, init: unknown) => proCall(path, init),
}));

const { ProUnauthorized } = await import('./client');
const { cabinetGet, currentSeller, hasLiveSession } = await import('./current');

/** `redirect()` throws; the target is in the error's digest. */
const redirectedTo = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return String((error as { digest?: string }).digest ?? '');
  }
  return null;
};

describe('currentSeller', () => {
  beforeEach(() => {
    readSession.mockReset();
    me.mockReset();
  });

  it('sends a visitor without a session to sign-in', async () => {
    readSession.mockResolvedValue(null);
    expect(await redirectedTo(currentSeller)).toContain(';/login;');
    expect(me).not.toHaveBeenCalled();
  });

  it('sends a rejected session to the logout route, which clears the cookie', async () => {
    readSession.mockResolvedValue('stale');
    me.mockRejectedValue(new ProUnauthorized());
    expect(await redirectedTo(currentSeller)).toContain(';/logout?expired=1;');
  });

  it('returns the seller for a good session', async () => {
    readSession.mockResolvedValue('good');
    me.mockResolvedValue({ name: 'Анна', balance: 12 });
    await expect(currentSeller()).resolves.toMatchObject({ name: 'Анна', balance: 12 });
    expect(me).toHaveBeenCalledWith('good');
  });

  it('lets other failures surface as errors', async () => {
    readSession.mockResolvedValue('good');
    me.mockRejectedValue(new Error('me → 500'));
    await expect(currentSeller()).rejects.toThrow('me → 500');
  });
});

describe('hasLiveSession', () => {
  beforeEach(() => {
    readSession.mockReset();
    me.mockReset();
  });

  it('is false without a cookie and does not ask the API', async () => {
    readSession.mockResolvedValue(null);
    expect(await hasLiveSession()).toBe(false);
    expect(me).not.toHaveBeenCalled();
  });

  it('is false when the API rejects the session', async () => {
    readSession.mockResolvedValue('stale');
    me.mockRejectedValue(new ProUnauthorized());
    expect(await hasLiveSession()).toBe(false);
  });

  it('is true when the API accepts it', async () => {
    readSession.mockResolvedValue('good');
    me.mockResolvedValue({ name: 'Анна', balance: 0 });
    expect(await hasLiveSession()).toBe(true);
  });
});

describe('cabinetGet', () => {
  beforeEach(() => {
    readSession.mockReset();
    proCall.mockReset();
  });

  it('sends a visitor without a session to sign-in', async () => {
    readSession.mockResolvedValue(null);
    expect(await redirectedTo(() => cabinetGet('/v1/pro/clients'))).toContain(';/login;');
    expect(proCall).not.toHaveBeenCalled();
  });

  it('sends a rejected session to the logout route', async () => {
    readSession.mockResolvedValue('stale');
    proCall.mockRejectedValue(new ProUnauthorized());
    expect(await redirectedTo(() => cabinetGet('/v1/pro/clients'))).toContain(
      ';/logout?expired=1;',
    );
  });

  it('asks as the seller and returns the answer', async () => {
    readSession.mockResolvedValue('good');
    proCall.mockResolvedValue({ status: 200, data: { clients: [] } });
    await expect(cabinetGet('/v1/pro/clients')).resolves.toEqual({
      status: 200,
      data: { clients: [] },
    });
    expect(proCall).toHaveBeenCalledWith('/v1/pro/clients', { session: 'good' });
  });
});
