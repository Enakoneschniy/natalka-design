import { describe, expect, it } from 'vitest';
import { isDraft, renderLegal } from '.';
import { proOffer } from './pro-offer';

describe('proOffer', () => {
  it('has no blanks left for the owner to fill in', () => {
    expect(isDraft(proOffer)).toBe(false);
  });

  it('states the prices of readings in credits and the money-back rule', () => {
    expect(proOffer).toContain('«Натал + прогноз» стоит 2 кредита');
    expect(proOffer).toContain('в течение 14 дней с его покупки, если ни один кредит');
  });

  it('renders the offer and its annex as two titled parts', () => {
    const html = renderLegal(proOffer, 'ru');
    expect(html.match(/<h1>/g)).toHaveLength(2);
    expect(html).not.toContain('<script');
  });
});
