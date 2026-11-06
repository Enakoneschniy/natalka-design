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

  it('gives a French visitor the company’s facts', () => {
    const fr = imprint.fr ?? '';
    for (const fact of [
      '# Mentions légales',
      'coremind s. r. o.',
      'société à responsabilité limitée de droit slovaque',
      'Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slovaquie',
      'Registre du commerce du tribunal municipal de Bratislava III, section Sro, insertion n° 194301/B',
      "Numéro d'identification (IČO) : 57 339 368",
      'Numéro de TVA intracommunautaire (IČ DPH) : SK2122681594',
      'help@chronika.me',
    ]) {
      expect(fr, fact).toContain(fact);
    }
  });

  it('gives a Spanish visitor the company’s facts', () => {
    const es = imprint.es ?? '';
    for (const fact of [
      '# Aviso legal',
      'coremind s. r. o.',
      'sociedad de responsabilidad limitada constituida conforme al Derecho eslovaco',
      'Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Eslovaquia',
      'Registro Mercantil del Tribunal Municipal de Bratislava III, sección Sro, inserción n.º 194301/B',
      'Número de identificación (IČO): 57 339 368',
      'Número de IVA intracomunitario (IČ DPH): SK2122681594',
      'help@chronika.me',
    ]) {
      expect(es, fact).toContain(fact);
    }
  });

  it('names the managing director in German only, at the owner’s wish', () => {
    for (const lang of ['ru', 'uk', 'en', 'pl', 'fr', 'es']) {
      expect(imprint[lang], lang).toContain('SK2122681594');
      expect(imprint[lang], lang).not.toContain('Nakoneshnyi');
    }
    // Nor under a Polish spelling of the name, nor by his office.
    expect(imprint.pl).not.toMatch(
      /Yevhenii|Jewhen|Nakonesh|Nakonesz|Nakonecz|konateľ|prezes zarządu/i,
    );
    // Nor under a French or Spanish spelling, nor by his office in either language.
    expect(imprint.fr).not.toMatch(
      /Yevhen|Ievhen|Ievgu|Yevgu|Evgu|Nakone|konateľ|gérant|dirigeant|directeur|représenté/i,
    );
    expect(imprint.es).not.toMatch(
      /Yevhen|Ievhen|Yevgu|Evgu|Nakone|konateľ|administrador|gerente|director|representad/i,
    );
  });
});
