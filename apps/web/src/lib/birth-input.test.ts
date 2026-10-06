import { describe, expect, it } from 'vitest';
import type { City } from '@/app/api/cities/route';
import { cityLabel, maskDate, maskTime, parseDate, parseTime } from './birth-input';

describe('birth input', () => {
  it('masks a date and a time as they are typed', () => {
    expect(maskDate('15051994')).toBe('15.05.1994');
    expect(maskDate('15a0')).toBe('15.0');
    expect(maskDate('1505199400')).toBe('15.05.1994');
    expect(maskTime('1525')).toBe('15:25');
    expect(maskTime('15')).toBe('15');
  });

  it('reads a typed date only if it exists, from 1900 up to today', () => {
    const now = new Date(2026, 9, 6, 12);
    expect(parseDate('15.05.1994', now)).toBe('1994-05-15');
    expect(parseDate(' 01.01.1900 ', now)).toBe('1900-01-01');
    expect(parseDate('06.10.2026', now)).toBe('2026-10-06');
    expect(parseDate('31.02.1994', now)).toBeNull();
    expect(parseDate('31.12.1899', now)).toBeNull();
    expect(parseDate('07.10.2026', now)).toBeNull();
    expect(parseDate('1994-05-15', now)).toBeNull();
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
