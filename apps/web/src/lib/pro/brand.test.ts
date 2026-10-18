import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  type BrandDraft,
  brandBody,
  brandSaveError,
  canSendAsIs,
  checkBrand,
  coverDate,
  DEFAULT_ACCENT,
  draftFromBrand,
  fitWithin,
  IMAGE_MAX_BYTES,
  imageError,
  imageProblem,
  isAccent,
  lowContrast,
  OUTPUT_TYPES,
  relativeLuminance,
  SOURCE_MAX_BYTES,
  spacedName,
} from './brand';
import { TEXT } from './text';

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
    expect(checkBrand(draft({ contacts: five }), 'ru').contacts).toBeDefined();
    expect(brandBody(draft({ contacts: ['a', 'b', 'c', 'd', ' '] }))?.contacts).toHaveLength(4);
  });

  it('refuses a contact over 80 characters', () => {
    expect(brandBody(draft({ contacts: ['x'.repeat(81)] }))).toBeNull();
    expect(brandBody(draft({ contacts: [` ${'x'.repeat(80)} `] }))?.contacts).toHaveLength(1);
  });

  it('needs a name of 1 to 60 characters', () => {
    expect(checkBrand(draft({ name: '   ' }), 'ru').name).toBeDefined();
    expect(checkBrand(draft({ name: 'x'.repeat(61) }), 'ru').name).toBeDefined();
    expect(checkBrand(draft({ name: 'x'.repeat(60) }), 'ru').name).toBeUndefined();
  });

  it('needs a #RRGGBB accent', () => {
    expect(checkBrand(draft({ accent: '#E7B75' }), 'ru').accent).toBeDefined();
    expect(brandBody(draft({ accent: 'gold' }))).toBeNull();
  });

  it('caps the intro and outro at 3000 and the signature at 80', () => {
    expect(checkBrand(draft({ intro: 'x'.repeat(3001) }), 'ru').intro).toBeDefined();
    expect(checkBrand(draft({ outro: 'x'.repeat(3001) }), 'ru').outro).toBeDefined();
    expect(checkBrand(draft({ signature: 'x'.repeat(81) }), 'ru').signature).toBeDefined();
    expect(checkBrand(draft({ intro: 'x'.repeat(3000), signature: 'x'.repeat(80) }), 'ru')).toEqual(
      {},
    );
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

  it('has a sample sentence for each tone, in each language', () => {
    expect(TEXT.ru.brand.toneSample.vy).toMatch(/^Ваша/);
    expect(TEXT.ru.brand.toneSample.ty).toMatch(/^Твоя/);
    expect(TEXT.uk.brand.toneSample.vy).toMatch(/^Ваш /);
    expect(TEXT.uk.brand.toneSample.ty).toMatch(/^Твій /);
  });
});

describe('images', () => {
  it('takes any picture a phone or computer gives, however big: the browser shrinks it', () => {
    expect(imageProblem({ size: 7_500_000, type: 'image/jpeg' }, 'ru')).toBeNull();
    expect(imageProblem({ size: 10, type: 'image/png' }, 'ru')).toBeNull();
    expect(imageProblem({ size: 10, type: 'image/webp' }, 'ru')).toBeNull();
    expect(imageProblem({ size: 10, type: 'image/heic' }, 'ru')).toBeNull();
    // A HEIC on a desktop often comes with no type at all; whether it opens is up to the browser.
    expect(imageProblem({ size: 10, type: '' }, 'ru')).toBeNull();
  });

  it('refuses what is not a picture, an empty file and a giant one', () => {
    expect(imageProblem({ size: 10, type: 'application/pdf' }, 'ru')).toMatch(/картинк/);
    expect(imageProblem({ size: 0, type: 'image/png' }, 'ru')).not.toBeNull();
    expect(imageProblem({ size: SOURCE_MAX_BYTES, type: 'image/jpeg' }, 'ru')).toBeNull();
    expect(imageProblem({ size: SOURCE_MAX_BYTES + 1, type: 'image/jpeg' }, 'ru')).toMatch(/25 МБ/);
  });

  it('shrinks the long side to the cap and keeps the shape', () => {
    expect(fitWithin(4032, 3024, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3024, 4032, 1200)).toEqual({ width: 900, height: 1200 });
  });

  it('never enlarges a small picture, and never shrinks a side to nothing', () => {
    expect(fitWithin(300, 200, 1200)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(6000, 2, 1200)).toEqual({ width: 1200, height: 1 });
  });

  it('draws a drawing (an SVG logo) at the full size, however small it says it is', () => {
    expect(fitWithin(120, 48, 1200, true)).toEqual({ width: 1200, height: 480 });
    expect(fitWithin(4000, 1000, 1200, true)).toEqual({ width: 1200, height: 300 });
  });

  it('sends a file as it is only when the worker would take it as it is', () => {
    expect(canSendAsIs({ size: 900_000, type: 'image/png' })).toBe(true);
    expect(canSendAsIs({ size: IMAGE_MAX_BYTES, type: 'image/jpeg' })).toBe(true);
    expect(canSendAsIs({ size: IMAGE_MAX_BYTES + 1, type: 'image/png' })).toBe(false);
    expect(canSendAsIs({ size: 10, type: 'image/webp' })).toBe(false);
    expect(canSendAsIs({ size: 0, type: 'image/png' })).toBe(false);
  });

  it('keeps transparency in a PNG; a photo without it goes as JPEG', () => {
    expect(OUTPUT_TYPES.logo.transparent).toEqual(['image/png']);
    expect(OUTPUT_TYPES.logo.opaque).toEqual(['image/png', 'image/jpeg']);
    expect(OUTPUT_TYPES.photo.transparent).toEqual(['image/png']);
    expect(OUTPUT_TYPES.photo.opaque).toEqual(['image/jpeg']);
  });

  it('uploads no more than the jobs worker takes', () => {
    expect(IMAGE_MAX_BYTES).toBe(1_048_576);
  });

  it('explains what the server said about an upload', () => {
    expect(imageError(409, 'no_brand', 'ru')).toBe('Сначала сохраните имя бренда');
    expect(imageError(413, undefined, 'ru')).toMatch(/1 МБ/);
    expect(imageError(415, undefined, 'ru')).toMatch(/PNG или JPEG/);
    expect(imageError(400, 'image', 'ru')).toMatch(/4000/);
    expect(imageError(0, undefined, 'ru')).toMatch(/Попробуйте ещё раз/);
    expect(imageError(409, 'no_brand', 'uk')).toBe('Спершу збережіть ім’я бренду');
    expect(imageError(0, undefined, 'uk')).toMatch(/Спробуйте ще раз/);
  });

  it('explains a refused save', () => {
    expect(brandSaveError(400, 'brand', 'ru')).toMatch(/Проверьте/);
    expect(brandSaveError(503, undefined, 'ru')).toMatch(/Попробуйте ещё раз/);
    expect(brandSaveError(400, 'tone', 'uk')).toMatch(/«ви» чи на «ти»/);
  });

  it('says what is wrong with a field in the cabinet’s language', () => {
    expect(checkBrand(draft({ name: ' ' }), 'ru').name).toBe('Имя: от 1 до 60 символов');
    expect(checkBrand(draft({ name: ' ' }), 'uk').name).toBe('Ім’я: від 1 до 60 символів');
  });
});
