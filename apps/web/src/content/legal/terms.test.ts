import { describe, expect, it } from 'vitest';
import { isDraft, renderLegal } from '.';
import { terms } from './terms';

const LANGUAGES = ['ru', 'uk', 'en', 'de', 'pl'] as const;
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
  pl: [
    'zazwyczaj w ciągu 10–20 minut',
    'jest dostępny pod swoim linkiem przez 30 dni od złożenia zamówienia',
    'prosimy napisać do nas w ciągu 7 dni – jeden raz bezpłatnie przygotujemy dokument ponownie na podstawie poprawionych danych',
    'Nasza odpowiedzialność z tytułu każdego zamówienia jest ograniczona do jego ceny',
    'stosuje się prawo Republiki Słowackiej',
  ],
};

describe('terms of service', () => {
  it('has no blanks left in the German and Polish editions', () => {
    expect(isDraft(text('de'))).toBe(false);
    expect(isDraft(text('pl'))).toBe(false);
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

  it('keeps a Polish consumer the protection of the law where they live', () => {
    const pl = text('pl');
    expect(pl).toContain(
      'wybór ten nie pozbawia Państwa ochrony przyznanej Państwu na mocy przepisów, których nie można wyłączyć w drodze umowy, obowiązujących w państwie, w którym mają Państwo miejsce zwykłego pobytu',
    );
    expect(pl).toContain('art. 6 ust. 2 rozporządzenia (WE) nr 593/2008 (Rzym I)');
    expect(pl).toContain(
      'w szczególności w przypadku szkody wyrządzonej umyślnie lub wskutek rażącego niedbalstwa oraz szkody na życiu, ciele lub zdrowiu',
    );
    expect(pl).toContain(
      'Pozostają one bez wpływu na Państwa ustawowe uprawnienia w przypadku braku zgodności dokumentu z umową.',
    );
  });

  it('names no dispute-resolution body in Polish, at the owner’s wish', () => {
    const pl = text('pl');
    expect(pl).toContain(
      'Nie jesteśmy obowiązani do udziału w postępowaniach w sprawie pozasądowego rozwiązywania sporów konsumenckich i nie zobowiązaliśmy się do takiego udziału.',
    );
    expect(pl).not.toMatch(/rzeczni|inspekcj|UOKiK|ochrony konkurencji|polubown|\bODR\b/i);
  });

  it('links the Polish terms to the Polish refund policy', () => {
    expect(renderLegal(text('pl'), 'pl')).toContain(
      '<a href="/pl/legal/refunds">Odstąpienie od umowy i zwroty</a>',
    );
  });
});
