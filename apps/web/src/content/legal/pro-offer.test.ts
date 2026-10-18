import { describe, expect, it } from 'vitest';
import { isDraft, renderLegal } from '.';
import { PRO_OFFER_VERSION, proOffer } from './pro-offer';
import { PRO_OFFER_TRANSLATED_FROM, PRO_OFFER_VERSION_UK, proOfferUk } from './pro-offer-uk';

/** The text of one part of the offer: from its heading to the next heading of any level. */
const part = (heading: string) => {
  const start = proOffer.indexOf(heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const rest = proOffer.slice(start + heading.length);
  const end = rest.search(/\n#{1,2} /);
  return end === -1 ? rest : rest.slice(0, end);
};

describe('proOffer', () => {
  it('has no blanks left for the owner to fill in', () => {
    expect(isDraft(proOffer)).toBe(false);
  });

  it('states the prices of readings in credits and the money-back rule', () => {
    expect(proOffer).toContain('«Натал + прогноз» стоит 2 кредита');
    expect(proOffer).toContain('в течение 14 дней с его покупки, если ни один кредит');
  });

  it('lets the seller close the cabinet with the button, and says what goes', () => {
    const closing = part('## 10. Прекращение');
    expect(closing).toContain('кнопкой «Закрыть кабинет» на странице аккаунта');
    expect(closing).toContain('help@chronika.me');
    expect(closing).toContain('неиспользованные кредиты сгорают, кроме случая из раздела 4');
  });

  it('says in the annex that closing the cabinet deletes every client', () => {
    const storage = part('## Как храним');
    expect(storage).toContain('Кнопка «Закрыть кабинет»');
    expect(storage).toContain('удаляет всех клиентов');
    expect(storage).toContain('Данные рождения хранятся в зашифрованном виде (AES-GCM)');
  });

  it('is dated by the edition that brought the button in', () => {
    expect(PRO_OFFER_VERSION).toBe('6 октября 2026');
    expect(proOffer).toContain(`_Редакция от ${PRO_OFFER_VERSION}.`);
  });

  it('renders the offer and its annex as two titled parts', () => {
    const html = renderLegal(proOffer, 'ru');
    expect(html.match(/<h1>/g)).toHaveLength(2);
    expect(html).not.toContain('<script');
  });
});

describe('proOfferUk', () => {
  it('follows the current Russian edition and says that one prevails', () => {
    expect(PRO_OFFER_TRANSLATED_FROM).toBe(PRO_OFFER_VERSION);
    expect(proOfferUk).toContain(`_Редакція від ${PRO_OFFER_VERSION_UK}.`);
    expect(proOfferUk).toContain('переважає російська редакція');
    expect(isDraft(proOfferUk)).toBe(false);
  });

  it('has every part the Russian text has', () => {
    const headings = (text: string) => text.match(/^#{1,2} .*$/gm) ?? [];
    expect(headings(proOfferUk)).toHaveLength(headings(proOffer).length);
    expect(proOfferUk.match(/^- /gm)?.length).toBe(proOffer.match(/^- /gm)?.length);
  });

  it('keeps the numbers, the deadlines and the button names of the cabinet', () => {
    expect(proOfferUk).toContain('«Натал + прогноз» коштує 2 кредити');
    expect(proOfferUk).toContain('протягом 14 днів з його покупки, якщо жоден кредит');
    expect(proOfferUk).toContain('кнопкою «Закрити кабінет» на сторінці акаунта');
    expect(proOfferUk).toContain('Кнопка «Видалити клієнта»');
    // «через», not «за»: the leak is reported within 72 hours after, not 72 hours before.
    expect(proOfferUk).toContain('не пізніше ніж через 72 години після того');
    expect(proOfferUk).toContain('за згоди одного з батьків або опікуна');
  });
});
