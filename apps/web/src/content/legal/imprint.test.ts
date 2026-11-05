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

  it('gives a Polish visitor the company’s facts', () => {
    const pl = imprint.pl ?? '';
    for (const fact of [
      'coremind s. r. o.',
      'spółka z ograniczoną odpowiedzialnością prawa słowackiego',
      'Vlčie hrdlo 1887/81, 821 07 Bratysława – Ružinov, Słowacja',
      'Rejestr handlowy Sądu Miejskiego Bratysława III, oddział Sro, wkładka nr 194301/B',
      'Numer identyfikacyjny (IČO): 57 339 368',
      'Numer VAT UE (IČ DPH): SK2122681594',
      'help@chronika.me',
    ]) {
      expect(pl, fact).toContain(fact);
    }
  });

  it('names the managing director in German only, at the owner’s wish', () => {
    for (const lang of ['ru', 'uk', 'en', 'pl']) {
      expect(imprint[lang], lang).toContain('SK2122681594');
      expect(imprint[lang], lang).not.toContain('Nakoneshnyi');
    }
    // Nor under a Polish spelling of the name, nor by his office.
    expect(imprint.pl).not.toMatch(
      /Yevhenii|Jewhen|Nakonesh|Nakonesz|Nakonecz|konateľ|prezes zarządu/i,
    );
  });
});
