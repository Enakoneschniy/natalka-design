import { describe, expect, it } from 'vitest';
import { isDraft, renderLegal } from '.';
import { terms } from './terms';

const LANGUAGES = ['ru', 'uk', 'en', 'de', 'pl', 'fr', 'es'] as const;
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
  fr: [
    'généralement en 10 à 20 minutes',
    'reste accessible par son lien pendant 30 jours à compter de la commande',
    'écrivez-nous dans les 7 jours : nous établirons, une seule fois et gratuitement, un nouveau document à partir des données corrigées',
    'Notre responsabilité est limitée, pour chaque commande, à son prix',
    'régies par le droit de la République slovaque',
  ],
  es: [
    'normalmente en un plazo de 10 a 20 minutos',
    'está disponible en su enlace durante 30 días desde el pedido',
    'escríbanos en un plazo de 7 días: elaboraremos una vez y gratuitamente un nuevo documento con los datos corregidos',
    'Nuestra responsabilidad por cada pedido se limita a su precio',
    'se rigen por el Derecho de la República Eslovaca',
  ],
};

describe('terms of service', () => {
  it('has no blanks left in the German, Polish, French and Spanish editions', () => {
    expect(isDraft(text('de'))).toBe(false);
    expect(isDraft(text('pl'))).toBe(false);
    expect(isDraft(text('fr'))).toBe(false);
    expect(isDraft(text('es'))).toBe(false);
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

  it('keeps a French consumer the protection of the law where they live', () => {
    const fr = text('fr');
    expect(fr).toContain('# Conditions générales de vente');
    expect(fr).toContain(
      'ce choix ne peut avoir pour résultat de vous priver de la protection que vous assurent les dispositions auxquelles il ne peut être dérogé par accord en vertu de la loi du pays où vous avez votre résidence habituelle',
    );
    expect(fr).toContain('article 6, paragraphe 2, du règlement (CE) n° 593/2008 (Rome I)');
    expect(fr).toContain(
      "notamment en cas de dol ou de faute lourde ainsi qu'en cas d'atteinte à la vie, à l'intégrité physique ou à la santé",
    );
    expect(fr).toContain(
      'Elles sont sans effet sur vos droits légaux en cas de défaut de conformité du document.',
    );
  });

  it('names no dispute-resolution body in French, at the owner’s wish', () => {
    const fr = text('fr');
    expect(fr).toContain(
      'Nous ne sommes pas tenus de participer à des procédures de règlement extrajudiciaire des litiges de consommation et ne nous sommes pas engagés à y participer.',
    );
    expect(fr).not.toMatch(/médiat|conciliat|arbitr|DGCCRF|CECMC|\bODR\b|\bRLL\b/i);
  });

  it('links the French terms to the French refund policy', () => {
    expect(renderLegal(text('fr'), 'fr')).toContain(
      '<a href="/fr/legal/refunds">Rétractation et remboursements</a>',
    );
  });

  it('keeps a Spanish consumer the protection of the law where they live', () => {
    const es = text('es');
    expect(es).toContain('# Condiciones generales');
    expect(es).toContain(
      'esta elección no podrá acarrear la pérdida de la protección que le proporcionen las disposiciones que no puedan excluirse mediante acuerdo en virtud de la ley del país en el que tenga su residencia habitual',
    );
    expect(es).toContain('artículo 6, apartado 2, del Reglamento (CE) n.º 593/2008 (Roma I)');
    expect(es).toContain(
      'en particular en caso de dolo o culpa grave, así como de daños a la vida, la integridad física o la salud',
    );
    expect(es).toContain(
      'No afectan a los derechos que la ley le reconoce en caso de falta de conformidad del documento.',
    );
  });

  it('names no dispute-resolution body in Spanish, at the owner’s wish', () => {
    const es = text('es');
    expect(es).toContain(
      'No estamos obligados a participar en procedimientos de resolución alternativa de litigios de consumo ni nos hemos comprometido a hacerlo.',
    );
    expect(es).not.toMatch(/arbitra|mediaci|junta|Dirección General de Consumo|\bODR\b|\bRAL\b/i);
  });

  it('links the Spanish terms to the Spanish refund policy', () => {
    expect(renderLegal(text('es'), 'es')).toContain(
      '<a href="/es/legal/refunds">Desistimiento y reembolsos</a>',
    );
  });
});
