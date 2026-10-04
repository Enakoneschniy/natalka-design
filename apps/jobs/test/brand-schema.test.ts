import { describe, expect, it } from 'vitest';
import { signIn, testEnv } from './env';

describe('0010 brand schema', () => {
  it('keeps one brand per seller with sane defaults', async () => {
    const { account } = await signIn('brand-schema@brand.test');
    await testEnv.DB.prepare('INSERT INTO pro_brands (account_id, name, updated_at) VALUES (?, ?, ?)')
      .bind(account.id, 'Мария', '2026-10-04T00:00:00.000Z')
      .run();
    const row = await testEnv.DB.prepare('SELECT contacts, accent, intro, logo_key FROM pro_brands WHERE account_id = ?')
      .bind(account.id)
      .first();
    expect(row).toEqual({ contacts: '[]', accent: '#E7B75C', intro: '', logo_key: null });
    await expect(
      testEnv.DB.prepare('INSERT INTO pro_brands (account_id, name, updated_at) VALUES (?, ?, ?)')
        .bind(account.id, 'Ещё', '2026-10-04T00:00:00.000Z')
        .run(),
    ).rejects.toThrow(/UNIQUE|PRIMARY/);
  });
});
