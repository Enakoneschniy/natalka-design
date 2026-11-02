import { describe, expect, it } from 'vitest';
import { imprint } from './imprint';

describe('imprint', () => {
  it('gives a German visitor everything § 5 DDG asks of the provider', () => {
    const de = imprint.de ?? '';
    for (const fact of [
      'coremind s. r. o.',
      'Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slowakei',
      'Vertreten durch den Geschäftsführer (konateľ): Yevhenii Nakoneshnyi',
      'Abteilung Sro, Einlage Nr. 194301/B',
      'Umsatzsteuer-Identifikationsnummer: SK2122681594',
      'help@chronika.me',
    ]) {
      expect(de, fact).toContain(fact);
    }
  });

  it('names the managing director in German only, at the owner’s wish', () => {
    for (const lang of ['ru', 'uk', 'en']) {
      expect(imprint[lang], lang).toContain('SK2122681594');
      expect(imprint[lang], lang).not.toContain('Nakoneshnyi');
    }
  });
});
