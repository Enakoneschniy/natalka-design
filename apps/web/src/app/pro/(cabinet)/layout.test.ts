import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pro/current', () => ({
  currentSeller: async () => ({
    email: 'maria@example.com',
    name: 'Мария',
    tone: 'vy',
    balance: 12,
    invite_redeemed: false,
  }),
}));

const pageLang: { current: 'ru' | 'uk' } = { current: 'ru' };
vi.mock('@/lib/pro/locale', async () => {
  const { textFor } = await import('@/lib/pro/text');
  return {
    proLang: async () => pageLang.current,
    proText: async () => textFor(pageLang.current),
    titleOf: () => async () => ({ title: '' }),
  };
});

const { LangProvider } = await import('@/components/pro/Lang');
const { default: CabinetLayout } = await import('./layout');

const render = async () =>
  renderToStaticMarkup(
    createElement(
      LangProvider,
      { lang: pageLang.current },
      await CabinetLayout({ children: null }),
    ),
  );

describe('the cabinet layout', () => {
  it('signs out with a POST form to /logout, never with a link', async () => {
    const html = await render();
    expect(html).toMatch(
      /<form[^>]*action="\/logout"[^>]*method="post"[^>]*>\s*<button[^>]*type="submit"[^>]*>Выйти<\/button>\s*<\/form>/,
    );
    expect(html).not.toMatch(/href="\/logout/);
  });

  it('speaks Ukrainian to a Ukrainian visitor, with the language switch in the bar', async () => {
    pageLang.current = 'uk';
    try {
      const html = await render();
      expect(html).toContain('>Вийти</button>');
      expect(html).toContain('12 кредитів');
      expect(html).toContain('<legend class="visually-hidden">Мова кабінету</legend>');
      expect(html).toMatch(/<button[^>]*lang="uk"[^>]*aria-pressed="true"[^>]*>UA<\/button>/);
    } finally {
      pageLang.current = 'ru';
    }
  });

  it('shows who is signed in, as a link to the account page, and the balance', async () => {
    const html = await render();
    expect(html).toMatch(/<span class="who"><a href="\/account">Мария<\/a><\/span>/);
    expect(html).toContain('12 кредитов');
  });
});
