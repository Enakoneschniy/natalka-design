import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  type BrandDraft,
  brandBody,
  brandSaveError,
  checkBrand,
  coverDate,
  DEFAULT_ACCENT,
  draftFromBrand,
  imageError,
  imageProblem,
  isAccent,
  lowContrast,
  relativeLuminance,
  spacedName,
  TONE_SAMPLE,
} from './brand';

const draft = (fields: Partial<BrandDraft> = {}): BrandDraft => ({
  name: 'Мария Звёздная',
  contacts: ['@maria.stars'],
  accent: '#E7B75C',
  intro: '',
  outro: '',
  signature: '',
  tone: 'vy',
  ...fields,
});

describe('accent', () => {
  it('offers six swatches, the default first', () => {
    expect(ACCENTS).toHaveLength(6);
    expect(ACCENTS[0]).toBe(DEFAULT_ACCENT);
    for (const colour of ACCENTS) expect(isAccent(colour)).toBe(true);
  });

  it('accepts only #RRGGBB', () => {
    expect(isAccent('#a1B2c3')).toBe(true);
    expect(isAccent('a1b2c3')).toBe(false);
    expect(isAccent('#abc')).toBe(false);
    expect(isAccent('#a1b2c3 ')).toBe(false);
  });

  it('measures relative luminance the WCAG way', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
  });

  it('warns about a colour too dark for the night cover', () => {
    expect(lowContrast('#3a2a1a')).toBe(true);
    expect(lowContrast('#E7B75C')).toBe(false);
  });

  it('does not warn about the swatches, nor about a colour still being typed', () => {
    for (const colour of ACCENTS) expect(lowContrast(colour)).toBe(false);
    expect(lowContrast('#3a2')).toBe(false);
  });
});

describe('brandBody', () => {
  it('trims every field and drops empty contacts', () => {
    expect(
      brandBody(
        draft({
          name: '  Мария  ',
          contacts: [' @maria.stars ', '   ', '', 't.me/maria '],
          accent: ' #8E7CC3 ',
          intro: ' Привет \n',
          outro: '\nДо встречи ',
          signature: ' М. ',
          tone: 'ty',
        }),
      ),
    ).toEqual({
      name: 'Мария',
      contacts: ['@maria.stars', 't.me/maria'],
      accent: '#8E7CC3',
      intro: 'Привет',
      outro: 'До встречи',
      signature: 'М.',
      tone: 'ty',
    });
  });

  it('refuses more than four contacts', () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    expect(brandBody(draft({ contacts: five }))).toBeNull();
    expect(checkBrand(draft({ contacts: five })).contacts).toBeDefined();
    expect(brandBody(draft({ contacts: ['a', 'b', 'c', 'd', ' '] }))?.contacts).toHaveLength(4);
  });

  it('refuses a contact over 80 characters', () => {
    expect(brandBody(draft({ contacts: ['x'.repeat(81)] }))).toBeNull();
    expect(brandBody(draft({ contacts: [` ${'x'.repeat(80)} `] }))?.contacts).toHaveLength(1);
  });

  it('needs a name of 1 to 60 characters', () => {
    expect(checkBrand(draft({ name: '   ' })).name).toBeDefined();
    expect(checkBrand(draft({ name: 'x'.repeat(61) })).name).toBeDefined();
    expect(checkBrand(draft({ name: 'x'.repeat(60) })).name).toBeUndefined();
  });

  it('needs a #RRGGBB accent', () => {
    expect(checkBrand(draft({ accent: '#E7B75' })).accent).toBeDefined();
    expect(brandBody(draft({ accent: 'gold' }))).toBeNull();
  });

  it('caps the intro and outro at 3000 and the signature at 80', () => {
    expect(checkBrand(draft({ intro: 'x'.repeat(3001) })).intro).toBeDefined();
    expect(checkBrand(draft({ outro: 'x'.repeat(3001) })).outro).toBeDefined();
    expect(checkBrand(draft({ signature: 'x'.repeat(81) })).signature).toBeDefined();
    expect(checkBrand(draft({ intro: 'x'.repeat(3000), signature: 'x'.repeat(80) }))).toEqual({});
  });
});

describe('draftFromBrand', () => {
  it('starts an empty form with one contact line and the default accent', () => {
    expect(draftFromBrand(null, 'vy')).toEqual({
      name: '',
      contacts: [''],
      accent: DEFAULT_ACCENT,
      intro: '',
      outro: '',
      signature: '',
      tone: 'vy',
    });
  });

  it('fills the form from a saved brand and its tone', () => {
    expect(
      draftFromBrand(
        {
          name: 'Мария',
          contacts: ['@m'],
          accent: '#8E7CC3',
          intro: 'i',
          outro: 'o',
          signature: 's',
          has_logo: true,
          has_photo: false,
        },
        'ty',
      ),
    ).toEqual({
      name: 'Мария',
      contacts: ['@m'],
      accent: '#8E7CC3',
      intro: 'i',
      outro: 'o',
      signature: 's',
      tone: 'ty',
    });
  });
});

describe('cover helpers', () => {
  it('spaces the name in capitals, as the PDF cover does', () => {
    expect(spacedName('Мария Звёздная')).toBe('М А Р И Я   З В Ё З Д Н А Я');
    expect(spacedName('  ')).toBe('');
  });

  it('writes the cover date as dd.mm.yyyy', () => {
    expect(coverDate(new Date('2026-10-04T12:00:00Z'))).toBe('04.10.2026');
  });

  it('has a sample sentence for each tone', () => {
    expect(TONE_SAMPLE.vy).toMatch(/^Ваша/);
    expect(TONE_SAMPLE.ty).toMatch(/^Твоя/);
  });
});

describe('images', () => {
  it('takes a PNG or JPEG up to 1 MB', () => {
    expect(imageProblem({ size: 1_048_576, type: 'image/png' })).toBeNull();
    expect(imageProblem({ size: 10, type: 'image/jpeg' })).toBeNull();
  });

  it('refuses other types, big files and empty files', () => {
    expect(imageProblem({ size: 10, type: 'image/webp' })).toMatch(/PNG или JPEG/);
    expect(imageProblem({ size: 1_048_577, type: 'image/png' })).toMatch(/1 МБ/);
    expect(imageProblem({ size: 0, type: 'image/png' })).not.toBeNull();
  });

  it('explains what the server said about an upload', () => {
    expect(imageError(409, 'no_brand')).toBe('Сначала сохраните имя бренда');
    expect(imageError(413)).toMatch(/1 МБ/);
    expect(imageError(415)).toMatch(/PNG или JPEG/);
    expect(imageError(400, 'image')).toMatch(/4000/);
    expect(imageError(0)).toMatch(/Попробуйте ещё раз/);
  });

  it('explains a refused save', () => {
    expect(brandSaveError(400, 'brand')).toMatch(/Проверьте/);
    expect(brandSaveError(503)).toMatch(/Попробуйте ещё раз/);
  });
});
