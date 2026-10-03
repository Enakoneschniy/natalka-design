import { describe, expect, it } from 'vitest';
import { createClient, getClient, listClients, parseClientBirth } from '../src/pro/clients';
import { signIn, testEnv } from './env';
import { ANNA } from './people';

describe('parseClientBirth', () => {
  it('accepts a complete birth and trims text', () => {
    expect(parseClientBirth({ ...ANNA, name: '  Анна ', extra: 1 })).toEqual(ANNA);
  });

  it('accepts an unknown time as null', () => {
    expect(parseClientBirth({ ...ANNA, time: null })?.time).toBeNull();
  });

  it('rejects what is malformed or missing', () => {
    const bad: Record<string, unknown>[] = [
      { ...ANNA, name: '' },
      { ...ANNA, name: 'x'.repeat(81) },
      { ...ANNA, date: '15.05.1994' },
      { ...ANNA, date: '1994-02-30' },
      { ...ANNA, time: '25:00' },
      { ...ANNA, time: undefined },
      { ...ANNA, latitude: 91 },
      { ...ANNA, longitude: '33' },
      { ...ANNA, zone: '' },
      { ...ANNA, place: '' },
      { ...ANNA, gender: 'x' },
    ];
    for (const value of bad) expect(parseClientBirth(value)).toBeNull();
    expect(parseClientBirth(null)).toBeNull();
    expect(parseClientBirth('Анна')).toBeNull();
  });
});

describe('clients', () => {
  it('stores nothing personal in the clear', async () => {
    const { account } = await signIn('cipher@clients.test');
    const id = await createClient(testEnv, account.id, ANNA);
    const row = await testEnv.DB.prepare('SELECT * FROM pro_clients WHERE id = ?').bind(id).first();
    expect(JSON.stringify(row)).not.toContain('Евпатория');
    expect(JSON.stringify(row)).not.toContain('1994-05-15');
  });

  it("returns a seller's own clients, newest first, decrypted", async () => {
    const { account } = await signIn('list@clients.test');
    await createClient(testEnv, account.id, ANNA);
    await createClient(testEnv, account.id, { ...ANNA, name: 'Борис', gender: 'm' });
    const clients = await listClients(testEnv, account.id);
    expect(clients.map((c) => c.name)).toEqual(['Борис', 'Анна']);
    expect(clients[1]).toMatchObject(ANNA);
  });

  it("never shows one seller another seller's client", async () => {
    const owner = await signIn('owner@clients.test');
    const stranger = await signIn('stranger@clients.test');
    const id = await createClient(testEnv, owner.account.id, ANNA);
    expect(await getClient(testEnv, stranger.account.id, id)).toBeNull();
    expect(await listClients(testEnv, stranger.account.id)).toEqual([]);
    expect((await getClient(testEnv, owner.account.id, id))?.name).toBe('Анна');
  });
});
