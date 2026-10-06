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

const { default: CabinetLayout } = await import('./layout');

const render = async () => renderToStaticMarkup(await CabinetLayout({ children: null }));

describe('the cabinet layout', () => {
  it('signs out with a POST form to /logout, never with a link', async () => {
    const html = await render();
    expect(html).toMatch(
      /<form[^>]*action="\/logout"[^>]*method="post"[^>]*>\s*<button[^>]*type="submit"[^>]*>Выйти<\/button>\s*<\/form>/,
    );
    expect(html).not.toMatch(/href="\/logout/);
  });

  it('shows who is signed in, as a link to the account page, and the balance', async () => {
    const html = await render();
    expect(html).toMatch(/<span class="who"><a href="\/account">Мария<\/a><\/span>/);
    expect(html).toContain('12 кредитов');
  });
});
