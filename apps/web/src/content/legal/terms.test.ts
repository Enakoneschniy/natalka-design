import { describe, expect, it } from 'vitest';
import { isDraft, renderLegal } from '.';
import { terms } from './terms';

const LANGUAGES = ['ru', 'uk', 'en', 'de'] as const;
const text = (locale: string) => terms[locale] ?? '';

/** What each language must say, in its own words: the delivery, the free rebuild, the cap, the law. */
const FACTS: Record<(typeof LANGUAGES)[number], string[]> = {
  ru: [
    'обычно за 10–20 минут',
    'доступен по ссылке в течение 30 дней с момента заказа',
    'напишите нам в течение 7 дней — один раз мы пересоберём документ по исправленным данным бесплатно',
    'Наша ответственность по любому заказу ограничена его стоимостью',
    'применяется право Словацкой Республики',
  ],
  uk: [
    'зазвичай за 10–20 хвилин',
    'доступний за посиланням протягом 30 днів з моменту замовлення',
    'напишіть нам протягом 7 днів — один раз ми перезберемо документ за виправленими даними безкоштовно',
    'Наша відповідальність за будь-яким замовленням обмежена його вартістю',
    'застосовується право Словацької Республіки',
  ],
  en: [
    'usually within 10–20 minutes',
    'stays available at its link for 30 days from the order',
    'write to us within 7 days — once, we will rebuild the document from corrected data at no charge',
    'Our liability for any order is limited to its price',
    'governed by the law of the Slovak Republic',
  ],
  de: [
    'in der Regel innerhalb von 10–20 Minuten',
    'ist 30 Tage ab der Bestellung über seinen Link abrufbar',
    'schreiben Sie uns innerhalb von 7 Tagen – einmal erstellen wir das Dokument kostenlos mit den korrigierten Daten neu',
    'Unsere Haftung ist für jede Bestellung auf deren Preis begrenzt',
    'gilt das Recht der Slowakischen Republik',
  ],
};

describe('terms of service', () => {
  it('has no blanks left in the German edition', () => {
    expect(isDraft(text('de'))).toBe(false);
  });

  it('keeps every language in step, section for section', () => {
    const sections = LANGUAGES.map((locale) => text(locale).match(/^## /gm)?.length);
    expect(new Set(sections).size).toBe(1);
    expect(sections[0]).toBe(10);
  });

  it('states the delivery, the free rebuild, the liability cap and the law in every language', () => {
    for (const locale of LANGUAGES) {
      for (const fact of FACTS[locale]) expect(text(locale), `${locale}: ${fact}`).toContain(fact);
    }
  });

  it('keeps a German consumer the protection of the law where they live', () => {
    const de = text('de');
    expect(de).toContain(
      'gilt diese Rechtswahl nur so weit, wie Ihnen dadurch nicht der Schutz entzogen wird, den Ihnen die zwingenden Bestimmungen des Rechts des Staates gewähren, in dem Sie Ihren gewöhnlichen Aufenthalt haben',
    );
    expect(de).toContain('Art. 6 Abs. 2 Rom-I-VO');
    expect(de).toContain(
      'Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).',
    );
    expect(de).toContain(
      'bei Vorsatz und grober Fahrlässigkeit sowie bei der Verletzung des Lebens',
    );
  });

  it('links the German terms to the German refund policy', () => {
    expect(renderLegal(text('de'), 'de')).toContain(
      '<a href="/de/legal/refunds">Erstattung und Widerruf</a>',
    );
  });
});
