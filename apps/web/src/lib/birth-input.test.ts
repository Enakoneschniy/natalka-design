import { describe, expect, it } from 'vitest';
import type { City } from '@/app/api/cities/route';
import { cityLabel, maskDate, maskTime } from './birth-input';

describe('birth input', () => {
  it('masks a date and a time as they are typed', () => {
    expect(maskDate('15051994')).toBe('15.05.1994');
    expect(maskDate('15a0')).toBe('15.0');
    expect(maskDate('1505199400')).toBe('15.05.1994');
    expect(maskTime('1525')).toBe('15:25');
    expect(maskTime('15')).toBe('15');
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
