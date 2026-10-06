import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const currentSeller = vi.fn();
vi.mock('@/lib/pro/current', () => ({ currentSeller: () => currentSeller() }));

const { default: Account } = await import('./page');

const render = async () => renderToStaticMarkup(await Account());

describe('the account page', () => {
  beforeEach(() => {
    currentSeller.mockReset().mockResolvedValue({
      email: 'maria@example.com',
      name: 'Мария Звёздная',
      tone: 'vy',
      balance: 12,
      invite_redeemed: true,
    });
  });

  it('shows who is signed in and the balance', async () => {
    const html = await render();
    expect(html).toContain('<h1>Аккаунт</h1>');
    expect(html).toContain('Мария Звёздная');
    expect(html).toContain('maria@example.com');
    expect(html).toContain('12 кредитов');
  });

  it('leaves the name out for a seller who never gave one', async () => {
    currentSeller.mockResolvedValue({
      email: 'maria@example.com',
      name: null,
      tone: 'vy',
      balance: 0,
      invite_redeemed: false,
    });
    const html = await render();
    expect(html).not.toContain('<dt>Имя</dt>');
    expect(html).toContain('maria@example.com');
  });

  it('explains what closing the cabinet deletes, before offering it', async () => {
    const html = await render();
    expect(html).toContain('Закрыть кабинет</h2>');
    for (const gone of ['клиенты', 'разборы', 'PDF', 'бренд', 'кредиты']) {
      expect(html).toContain(gone);
    }
    expect(html).toContain('нельзя отменить');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Закрыть кабинет<\/button>/);
  });
});
