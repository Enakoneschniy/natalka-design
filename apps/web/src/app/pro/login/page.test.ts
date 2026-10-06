import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasLiveSession = vi.fn();
vi.mock('@/lib/pro/current', () => ({ hasLiveSession: () => hasLiveSession() }));

const { default: Login } = await import('./page');

const render = async (query: Record<string, string> = {}) =>
  renderToStaticMarkup(await Login({ searchParams: Promise.resolve(query) }));

const CLOSED = 'Кабинет закрыт, данные удалены.';

describe('the sign-in page', () => {
  beforeEach(() => {
    hasLiveSession.mockReset().mockResolvedValue(false);
  });

  it('says the cabinet is closed and its data deleted after closing', async () => {
    const html = await render({ closed: '1' });
    expect(html).toContain(CLOSED);
    expect(html).toContain('Прислать ссылку для входа');
  });

  it('says nothing of the kind on a plain visit or after a session ran out', async () => {
    expect(await render()).not.toContain(CLOSED);
    const expired = await render({ expired: '1' });
    expect(expired).not.toContain(CLOSED);
    expect(expired).toContain('Сессия закончилась, войдите снова.');
  });
});
