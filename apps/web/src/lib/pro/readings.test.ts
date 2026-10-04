import { describe, expect, it } from 'vitest';
import {
  firstName,
  PRODUCT_LABEL,
  progressLabel,
  readingDate,
  readingPill,
  readingTitle,
} from './readings';

describe('PRODUCT_LABEL', () => {
  it('names every product in Russian', () => {
    expect(PRODUCT_LABEL).toEqual({
      natal: 'Натальная карта',
      forecast: 'Прогноз на год',
      synastry: 'Синастрия',
      child: 'Детская карта',
      bundle: 'Натал + прогноз',
    });
  });
});

describe('readingPill', () => {
  it('shows a reading being written', () => {
    expect(readingPill({ status: 'writing' })).toEqual({ label: 'пишется', tone: 'wr' });
  });

  it('shows a ready reading, and one whose PDF is ready', () => {
    expect(readingPill({ status: 'ready' })).toEqual({ label: 'готов', tone: 'gold' });
    expect(readingPill({ status: 'ready', missing: 0, pdf: 'none' })).toEqual({
      label: 'готов',
      tone: 'gold',
    });
    expect(readingPill({ status: 'ready', pdf: 'ready' })).toEqual({
      label: 'PDF готов',
      tone: 'ok',
    });
  });

  it('flags a section left unwritten before anything else about a ready reading', () => {
    expect(readingPill({ status: 'ready', missing: 2, pdf: 'ready' })).toEqual({
      label: 'раздел не дописан',
      tone: 'bad',
    });
  });

  it('says a failed reading was refunded', () => {
    expect(readingPill({ status: 'failed', missing: 3 })).toEqual({
      label: 'не получился, кредиты вернули',
      tone: 'bad',
    });
  });
});

describe('progressLabel', () => {
  it('agrees the noun with the total', () => {
    expect(progressLabel(7, 20)).toBe('7 из 20 разделов');
    expect(progressLabel(0, 21)).toBe('0 из 21 раздела');
    expect(progressLabel(1, 3)).toBe('1 из 3 разделов');
  });

  it('says nothing useful is known before the plan exists', () => {
    expect(progressLabel(0, 0)).toBe('готовим план');
  });
});

describe('firstName and readingTitle', () => {
  it('takes the first word of a name', () => {
    expect(firstName('  Анна  Коваль ')).toBe('Анна');
    expect(firstName('')).toBe('Клиент');
  });

  it('joins the person and the product', () => {
    expect(readingTitle('natal', 'Анна Коваль')).toBe('Анна · Натальная карта');
    expect(readingTitle('synastry', 'Оксана Мельник', 'Игорь Мельник')).toBe(
      'Оксана и Игорь · Синастрия',
    );
  });

  it('copes with a client that is gone', () => {
    expect(readingTitle('natal', undefined)).toBe('Клиент · Натальная карта');
  });
});

describe('readingDate', () => {
  const now = new Date('2026-10-04T12:00:00Z');

  it('says today and yesterday in words', () => {
    expect(readingDate('2026-10-04T01:00:00.000Z', now)).toBe('сегодня');
    expect(readingDate('2026-10-03T23:00:00.000Z', now)).toBe('вчера');
  });

  it('gives a short date this year and the year otherwise', () => {
    expect(readingDate('2026-10-02T10:00:00.000Z', now)).toBe('2 окт');
    expect(readingDate('2025-09-29T10:00:00.000Z', now)).toBe('29 сен 2025');
  });

  it('keeps quiet about a date it cannot read', () => {
    expect(readingDate('nonsense', now)).toBe('');
  });
});
