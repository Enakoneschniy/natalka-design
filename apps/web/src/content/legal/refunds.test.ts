import { describe, expect, it } from 'vitest';
import { isDraft, renderLegal } from '.';
import { refunds } from './refunds';

const LANGUAGES = ['ru', 'uk', 'en', 'de'] as const;
const text = (locale: string) => refunds[locale] ?? '';

/** The refund promises and the deadlines, in each language's own words. */
const PROMISES: Record<(typeof LANGUAGES)[number], string[]> = {
  ru: [
    'не был доставлен в течение 24 часов после оплаты',
    'Оплата прошла дважды',
    'в течение 5 рабочих дней с нашей стороны',
    'один раз пересоберём документ по исправленным данным бесплатно, если вы напишете в течение 7 дней после заказа',
    'По закону у вас есть 14 дней',
    'Отвечаем в течение двух рабочих дней',
  ],
  uk: [
    'не був доставлений протягом 24 годин після оплати',
    'Оплата пройшла двічі',
    'протягом 5 робочих днів з нашого боку',
    'один раз перезберемо документ за виправленими даними безкоштовно, якщо ви напишете протягом 7 днів після замовлення',
    'За законом у вас є 14 днів',
    'Відповідаємо протягом двох робочих днів',
  ],
  en: [
    'was not delivered within 24 hours of payment',
    'You were charged twice',
    'within 5 working days on our side',
    'once, we will rebuild the document from corrected data at no charge if you write within 7 days of the order',
    'By law you have 14 days',
    'We answer within two working days',
  ],
  de: [
    'nicht innerhalb von 24 Stunden nach der Zahlung zugestellt',
    'Die Zahlung wurde doppelt abgebucht',
    'innerhalb von 5 Arbeitstagen auf unserer Seite',
    'erstellen das Dokument aber einmal kostenlos mit den korrigierten Daten neu, wenn Sie uns innerhalb von 7 Tagen nach der Bestellung schreiben',
    'Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.',
    'Wir antworten innerhalb von zwei Arbeitstagen',
  ],
};

/** The text of one part of the German policy: from its heading to the next heading of any level. */
const part = (heading: string) => {
  const de = text('de');
  const start = de.indexOf(heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const rest = de.slice(start + heading.length);
  const end = rest.search(/\n#{1,2} /);
  return end === -1 ? rest : rest.slice(0, end);
};

describe('refund policy', () => {
  it('has no blanks left in the German edition', () => {
    expect(isDraft(text('de'))).toBe(false);
  });

  it('keeps every language in step, section for section', () => {
    const sections = LANGUAGES.map((locale) => text(locale).match(/^## /gm)?.length);
    expect(new Set(sections).size).toBe(1);
    expect(sections[0]).toBe(6);
  });

  it('makes the same refund promises in every language', () => {
    for (const locale of LANGUAGES) {
      for (const promise of PROMISES[locale]) {
        expect(text(locale), `${locale}: ${promise}`).toContain(promise);
      }
    }
  });

  it('lists the same five cases for a full refund in every language', () => {
    for (const locale of LANGUAGES) {
      const second = text(locale).split(/^## /m)[2] ?? '';
      expect(second.match(/^- /gm)?.length, locale).toBe(5);
    }
  });

  it('carries a German Widerrufsbelehrung for digital content', () => {
    const belehrung = part('## Widerrufsbelehrung');
    for (const line of [
      '**Widerrufsrecht**',
      'Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.',
      'Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slowakei, E-Mail: help@chronika.me) mittels einer eindeutigen Erklärung',
      'Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.',
      '**Folgen des Widerrufs**',
      'unverzüglich und spätestens binnen vierzehn Tagen',
      '**Erlöschen des Widerrufsrechts**',
      '§ 356 Abs. 6 BGB',
      'Sie ausdrücklich zugestimmt haben, dass wir vor Ablauf der Widerrufsfrist mit der Vertragserfüllung beginnen',
      'dass durch diese Zustimmung mit Beginn der Vertragserfüllung Ihr Widerrufsrecht erlischt',
      // What the payment page asks the German buyer to agree to (apps/jobs/src/stripe.ts).
      'dass Sie dadurch mit Beginn der Vertragserfüllung Ihr Widerrufsrecht verlieren',
    ]) {
      expect(belehrung, line).toContain(line);
    }
  });

  it('carries the Muster-Widerrufsformular, addressed and as a list', () => {
    const form = part('## Widerrufsbelehrung').split('**Muster-Widerrufsformular**')[1] ?? '';
    for (const line of [
      '- An coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slowakei, E-Mail: help@chronika.me:',
      '- Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag',
      '- Bestellt am (*)/erhalten am (*)',
      '- Name des/der Verbraucher(s)',
      '- Anschrift des/der Verbraucher(s)',
      '- Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)',
      '- Datum',
      '(*) Unzutreffendes streichen.',
    ]) {
      expect(form, line).toContain(line);
    }
    const html = renderLegal(text('de'), 'de');
    expect(html).toContain('<p><strong>Muster-Widerrufsformular</strong></p>');
    expect(html).toContain(
      '<li>Name des/der Verbraucher(s)</li><li>Anschrift des/der Verbraucher(s)</li>',
    );
  });
});
