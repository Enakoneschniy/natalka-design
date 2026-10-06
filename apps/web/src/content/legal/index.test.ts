import { describe, expect, it } from 'vitest';
import { LEGAL, renderLegal } from '.';

describe('renderLegal', () => {
  it('escapes everything that could open a tag or leave an attribute', () => {
    const html = renderLegal(`Он сказал "да" и 'нет' <b>&</b>`, 'ru');
    expect(html).toBe('<p>Он сказал &quot;да&quot; и &#39;нет&#39; &lt;b&gt;&amp;&lt;/b&gt;</p>');
  });

  it('links within the site and to https, with the locale filled in', () => {
    expect(renderLegal('См. [Условия возврата](/[locale]/legal/refunds).', 'ru')).toBe(
      '<p>См. <a href="/ru/legal/refunds">Условия возврата</a>.</p>',
    );
    expect(renderLegal('[Stripe](https://stripe.com/privacy?a=1&b=2)', 'ru')).toBe(
      '<p><a href="https://stripe.com/privacy?a=1&amp;b=2">Stripe</a></p>',
    );
  });

  it('shows any other link as its text alone', () => {
    for (const href of [
      'javascript:alert`1`',
      'http://example.com',
      '//evil.example/x',
      '/\\evil.example',
      'data:text/html,x',
      'mailto:help@chronika.me',
    ]) {
      expect(renderLegal(`[текст](${href})`, 'ru'), href).toBe('<p>текст</p>');
    }
  });

  it('keeps a quote in a link inside its attribute', () => {
    const html = renderLegal('[x](/a" onclick="alert(1))', 'ru');
    expect(html).not.toContain('" onclick');
    expect(html).toContain('href="/a&quot; onclick=&quot;alert(1"');
  });

  it('renders every document without a raw quote in an attribute', () => {
    for (const doc of Object.values(LEGAL)) {
      for (const [locale, source] of Object.entries(doc)) {
        const html = renderLegal(source, locale);
        expect(html).not.toMatch(/<a href="(?!\/|https:\/\/)/);
        expect(html).not.toContain('<script');
      }
    }
  });
});
