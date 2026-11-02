import { describe, expect, it } from 'vitest';
import { isDraft } from '.';
import { privacy } from './privacy';

const LANGUAGES = ['ru', 'uk', 'en', 'de'] as const;
const text = (locale: string) => privacy[locale] ?? '';

/** What each language must say, in its own words. */
const FACTS: Record<(typeof LANGUAGES)[number], string[]> = {
  ru: [
    'Оплату принимает **Stripe**: ему передаются адрес почты, название продукта и цена — без данных рождения',
    'передаются положения планет, аспекты и дома, имя, дата и время рождения',
    'Координаты, место рождения, часовой пояс и почта модели не передаются',
    'только если вы нажали «Разрешить», и только на страницах без личных данных',
    'только после того, как вы подтвердите её по ссылке из письма',
    '**удаляются через 30 дней**',
    'Неоплаченный заказ удаляется со всеми данными через 7 дней',
    'хранится 180 дней',
    'хранятся ещё 30 дней и удаляются',
  ],
  uk: [
    'Оплату приймає **Stripe**: йому передаються адреса пошти, назва продукту і ціна — без даних народження',
    "передаються положення планет, аспекти й доми, ім'я, дата і час народження",
    'Координати, місце народження, часовий пояс і пошта моделі не передаються',
    'лише якщо ви натиснули «Дозволити», і лише на сторінках без особистих даних',
    'лише після того, як ви підтвердите її за посиланням із листа',
    '**видаляються через 30 днів**',
    'Неоплачене замовлення видаляється з усіма даними через 7 днів',
    'зберігається 180 днів',
    'зберігаються ще 30 днів і видаляються',
  ],
  en: [
    'Payments are taken by **Stripe**, which receives your email address, the product name and the price — no birth data',
    'receives the planetary positions, aspects and houses, your first name, and the date and time of birth',
    'Coordinates, the place of birth, the time zone and your email are not sent to the model',
    'only if you pressed "Allow", and only on pages without personal data',
    'starts only once you confirm it through the link in our email',
    '**deleted 30 days**',
    'An unpaid order is deleted with all its data after 7 days',
    'kept for 180 days',
    'kept for 30 more days and then deleted',
  ],
  de: [
    'Zahlungen nimmt **Stripe** entgegen: Stripe erhält Ihre E-Mail-Adresse, den Produktnamen und den Preis – ohne Geburtsdaten',
    'erhält die Stellungen der Planeten, Aspekte und Häuser, Ihren Vornamen sowie Geburtsdatum und Geburtszeit',
    'Koordinaten, Geburtsort, Zeitzone und E-Mail-Adresse erhält das Modell nicht',
    'nur geladen, wenn Sie „Zulassen“ gewählt haben, und nur auf Seiten ohne personenbezogene Daten',
    'erst, wenn Sie es über den Link in unserer E-Mail bestätigt haben',
    '**30 Tage nach der Bestellung gelöscht**',
    'Eine unbezahlte Bestellung wird mit allen Daten nach 7 Tagen gelöscht',
    '180 Tage aufbewahrt',
    'noch 30 Tage aufbewahrt und dann gelöscht',
  ],
};

/** The edition every language is dated by. */
const EDITION: Record<(typeof LANGUAGES)[number], string> = {
  ru: '_Редакция от 2 ноября 2026 г.',
  uk: '_Редакція від 2 листопада 2026 р.',
  en: '_Version of 2 November 2026.',
  de: '_Fassung vom 2. November 2026.',
};

describe('privacy policy', () => {
  it('has no blanks left in any language', () => {
    for (const locale of LANGUAGES) expect(isDraft(text(locale)), locale).toBe(false);
  });

  it('keeps every language in step, section for section', () => {
    const sections = LANGUAGES.map((locale) => text(locale).match(/^## /gm)?.length);
    expect(new Set(sections).size).toBe(1);
    expect(sections[0]).toBe(8);
  });

  it('states what the model, Stripe and the tags receive, and how long data is kept', () => {
    for (const locale of LANGUAGES) {
      for (const fact of FACTS[locale]) expect(text(locale), `${locale}: ${fact}`).toContain(fact);
    }
  });

  it('is dated by the same edition in every language', () => {
    for (const locale of LANGUAGES) expect(text(locale), locale).toContain(EDITION[locale]);
  });

  it('names, in German, the controller, the legal bases, the processors and the rights', () => {
    const de = text('de');
    for (const term of [
      'Verantwortlicher im Sinne der DSGVO: coremind s. r. o.',
      'Art. 6 Abs. 1 lit. a DSGVO',
      'Art. 6 Abs. 1 lit. b DSGVO',
      'Art. 6 Abs. 1 lit. c DSGVO',
      'Art. 6 Abs. 1 lit. f DSGVO',
      'Auftragsverarbeiter im Sinne von Art. 28 DSGVO',
      '**Widerspruchsrecht:**',
      'Art. 7 Abs. 3 DSGVO',
      'Beschwerde bei einer Datenschutz-Aufsichtsbehörde',
      'Art. 77 DSGVO',
    ]) {
      expect(de, term).toContain(term);
    }
  });
});
