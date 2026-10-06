import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const peekLogin = vi.fn();
const liveSeller = vi.fn();
vi.mock('@/lib/pro/client', async (original) => ({
  ...(await original<typeof import('@/lib/pro/client')>()),
  peekLogin: (token: string) => peekLogin(token),
}));
vi.mock('@/lib/pro/current', () => ({ liveSeller: () => liveSeller() }));

const { default: ConfirmLoginPage } = await import('./page');

const render = async (token = 't-1') =>
  renderToStaticMarkup(await ConfirmLoginPage({ params: Promise.resolve({ token }) }));

const seller = (email: string) => ({ email, name: null, tone: 'vy', balance: 0 });
const WARNING = 'Эта ссылка откроет другой кабинет';

describe('the sign-in confirm page', () => {
  beforeEach(() => {
    peekLogin.mockReset().mockResolvedValue('ye***@gmail.com');
    liveSeller.mockReset().mockResolvedValue(null);
  });

  it('says whose cabinet the link opens, and asks jobs without spending the token', async () => {
    const html = await render('t-42');
    expect(peekLogin).toHaveBeenCalledWith('t-42');
    expect(html).toContain('Ссылка откроет кабинет');
    expect(html).toContain('ye***@gmail.com');
    expect(html).toMatch(/<button[^>]*>Войти<\/button>/);
    expect(html).not.toContain(WARNING);
  });

  it('warns when this browser is signed in to another cabinet', async () => {
    liveSeller.mockResolvedValue(seller('maria@example.com'));
    const html = await render();
    expect(html).toContain('Вы уже вошли как');
    expect(html).toContain('ma***@example.com');
    expect(html).toContain(WARNING);
    expect(html).toMatch(/<button[^>]*>Войти<\/button>/);
  });

  it('does not warn when the link opens the cabinet already signed in to', async () => {
    liveSeller.mockResolvedValue(seller('yevhenii@gmail.com'));
    expect(await render()).not.toContain(WARNING);
  });

  it('shows a dead link as expired, with no button', async () => {
    peekLogin.mockResolvedValue(null);
    liveSeller.mockResolvedValue(seller('maria@example.com'));
    const html = await render();
    expect(html).toContain('Ссылка устарела или уже использована');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('Войти</button>');
    expect(html).not.toContain(WARNING);
  });

  it('keeps the plain button when jobs cannot say whose link it is', async () => {
    peekLogin.mockRejectedValue(new Error('peek → 503'));
    liveSeller.mockResolvedValue(seller('maria@example.com'));
    const html = await render();
    expect(html).toContain('Нажмите «Войти», чтобы открыть кабинет на этом устройстве.');
    expect(html).toMatch(/<button[^>]*>Войти<\/button>/);
    expect(html).not.toContain('Ссылка откроет кабинет');
    expect(html).not.toContain(WARNING);
  });

  it('shows the address as text, whatever it holds', async () => {
    peekLogin.mockResolvedValue('<img src=x onerror=alert(1)>***@a.co');
    const html = await render();
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
