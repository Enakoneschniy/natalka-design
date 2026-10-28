import { describe, expect, it } from 'vitest';
import type { City } from '@/app/api/cities/route';
import { cityLabel, maskDate, maskTime, parseTime, readDate, remask } from './birth-input';

describe('birth input', () => {
  it('masks a date and a time as they are typed', () => {
    expect(maskDate('15051994')).toBe('15.05.1994');
    expect(maskDate('15a0')).toBe('15.0');
    expect(maskDate('1505199400')).toBe('15.05.1994');
    expect(maskTime('1525')).toBe('15:25');
    expect(maskTime('15')).toBe('15');
  });

  it('keeps the caret where a digit was fixed in the middle', () => {
    // 31.02.1990 → the 2 erased: the digits re-flow, and the caret stays after "31.0".
    expect(remask(maskDate, '31.0.1990', 4)).toEqual({ value: '31.01.990', caret: 4 });
    // …so the 3 typed next lands where the 2 was.
    expect(remask(maskDate, '31.031.990', 5)).toEqual({ value: '31.03.1990', caret: 5 });
    // Typing at the end steps over the separator the mask adds.
    expect(remask(maskDate, '310', 3)).toEqual({ value: '31.0', caret: 4 });
    // Erasing a separator steps back over it instead of being undone in place.
    expect(remask(maskDate, '31.021990', 5)).toEqual({ value: '31.02.1990', caret: 5 });
    expect(remask(maskTime, '1:30', 1)).toEqual({ value: '13:0', caret: 1 });
    expect(remask(maskDate, '', 0)).toEqual({ value: '', caret: 0 });
  });

  it('reads a typed date only if it exists, from 1900 up to today, and says why not', () => {
    const now = new Date(2026, 9, 6, 12);
    expect(readDate('15.05.1994', now)).toEqual({ iso: '1994-05-15' });
    expect(readDate(' 01.01.1900 ', now)).toEqual({ iso: '1900-01-01' });
    expect(readDate('06.10.2026', now)).toEqual({ iso: '2026-10-06' });
    expect(readDate('', now)).toEqual({ problem: 'format' });
    expect(readDate('15.05.94', now)).toEqual({ problem: 'format' });
    expect(readDate('1994-05-15', now)).toEqual({ problem: 'format' });
    expect(readDate('31.02.1994', now)).toEqual({ problem: 'missing' });
    expect(readDate('15.13.1994', now)).toEqual({ problem: 'missing' });
    expect(readDate('00.05.1994', now)).toEqual({ problem: 'missing' });
    expect(readDate('31.12.1899', now)).toEqual({ problem: 'early' });
    expect(readDate('07.10.2026', now)).toEqual({ problem: 'future' });
  });

  it('reads a typed time of day', () => {
    expect(parseTime('9:05')).toBe('09:05');
    expect(parseTime('23:59')).toBe('23:59');
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('12:60')).toBeNull();
  });

  it('labels a city with whatever region and country it has', () => {
    const city: City = {
      id: 1,
      name: 'Евпатория',
      region: 'Крым',
      country: 'Украина',
      latitude: 45.2,
      longitude: 33.36,
      zone: 'Europe/Simferopol',
      population: 1,
    };
    expect(cityLabel(city)).toBe('Евпатория, Крым, Украина');
    expect(cityLabel({ ...city, region: null })).toBe('Евпатория, Украина');
  });
});
