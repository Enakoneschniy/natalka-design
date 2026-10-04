import { describe, expect, it } from 'vitest';
import type { City } from '@/app/api/cities/route';
import {
  birthLine,
  type ClientDraft,
  checkClient,
  clientBody,
  coordinatesLine,
  GENDER_CODE,
  parseBirthDate,
  parseBirthTime,
} from './birth';

const today = new Date('2026-10-04T12:00:00Z');

const city: City = {
  id: 1,
  name: 'Евпатория',
  country: 'Украина',
  region: 'Крым',
  latitude: 45.2,
  longitude: 33.36,
  zone: 'Europe/Simferopol',
  population: 100000,
};

const draft = (fields: Partial<ClientDraft> = {}): ClientDraft => ({
  name: 'Анна Коваль',
  date: '15.05.1994',
  time: '15:25',
  unknownTime: false,
  city,
  gender: 'female',
  consent: true,
  ...fields,
});

describe('parseBirthDate', () => {
  it('turns dd.mm.yyyy into an ISO date', () => {
    expect(parseBirthDate('15.05.1994', today)).toBe('1994-05-15');
  });

  it('keeps to 1900 up to today', () => {
    expect(parseBirthDate('31.12.1899', today)).toBeNull();
    expect(parseBirthDate('01.01.1900', today)).toBe('1900-01-01');
    expect(parseBirthDate('04.10.2026', today)).toBe('2026-10-04');
    expect(parseBirthDate('05.10.2026', today)).toBeNull();
  });

  it('refuses a date the calendar does not have', () => {
    expect(parseBirthDate('30.02.2000', today)).toBeNull();
    expect(parseBirthDate('29.02.2000', today)).toBe('2000-02-29');
    expect(parseBirthDate('29.02.1900', today)).toBeNull();
    expect(parseBirthDate('00.01.2000', today)).toBeNull();
  });

  it('refuses anything not fully typed', () => {
    expect(parseBirthDate('', today)).toBeNull();
    expect(parseBirthDate('15.05.94', today)).toBeNull();
    expect(parseBirthDate('1994-05-15', today)).toBeNull();
  });
});

describe('parseBirthTime', () => {
  it('accepts a 24-hour hh:mm', () => {
    expect(parseBirthTime('00:00')).toBe('00:00');
    expect(parseBirthTime('15:25')).toBe('15:25');
    expect(parseBirthTime('23:59')).toBe('23:59');
  });

  it('refuses the rest', () => {
    expect(parseBirthTime('24:00')).toBeNull();
    expect(parseBirthTime('12:60')).toBeNull();
    expect(parseBirthTime('9:30')).toBeNull();
    expect(parseBirthTime('')).toBeNull();
  });
});

describe('GENDER_CODE', () => {
  it('maps the form labels to the codes jobs wants', () => {
    expect(GENDER_CODE).toEqual({ female: 'f', male: 'm', neutral: 'n' });
  });
});

describe('checkClient', () => {
  it('passes a complete form', () => {
    expect(checkClient(draft(), today)).toEqual({});
  });

  it('names each field that is wrong', () => {
    const errors = checkClient(
      {
        name: ' ',
        date: '30.02.2000',
        time: '25:00',
        unknownTime: false,
        city: null,
        gender: 'male',
        consent: false,
      },
      today,
    );
    expect(Object.keys(errors).sort()).toEqual(['city', 'consent', 'date', 'name', 'time']);
  });

  it('caps the name at 80 characters after trimming', () => {
    expect(checkClient(draft({ name: `  ${'а'.repeat(80)}  ` }), today).name).toBeUndefined();
    expect(checkClient(draft({ name: 'а'.repeat(81) }), today).name).toBeDefined();
  });

  it('ignores the time when it is unknown', () => {
    expect(checkClient(draft({ time: '', unknownTime: true }), today)).toEqual({});
  });
});

describe('clientBody', () => {
  it('is exactly the jobs ClientBirth plus consent', () => {
    expect(clientBody(draft({ name: '  Анна Коваль ' }), today)).toEqual({
      name: 'Анна Коваль',
      date: '1994-05-15',
      time: '15:25',
      latitude: 45.2,
      longitude: 33.36,
      zone: 'Europe/Simferopol',
      place: 'Евпатория, Крым, Украина',
      gender: 'f',
      consent: true,
    });
  });

  it('says time:null when the time is unknown, whatever was typed', () => {
    const body = clientBody(draft({ time: '15:25', unknownTime: true, gender: 'neutral' }), today);
    expect(body?.time).toBeNull();
    expect(body?.gender).toBe('n');
  });

  it('is null for a form that does not pass', () => {
    expect(clientBody(draft({ consent: false }), today)).toBeNull();
  });
});

describe('birthLine', () => {
  it('shows the date, the time and the place', () => {
    expect(birthLine({ date: '1994-05-15', time: '15:25', place: 'Евпатория' })).toBe(
      '15.05.1994 · 15:25 · Евпатория',
    );
  });

  it('says when the time is unknown', () => {
    expect(birthLine({ date: '1988-03-19', time: null, place: 'Киев' })).toBe(
      '19.03.1988 · время неизвестно · Киев',
    );
  });
});

describe('coordinatesLine', () => {
  it('shows latitude, longitude and zone', () => {
    expect(coordinatesLine(city)).toBe('45.20° N · 33.36° E · Europe/Simferopol');
    expect(
      coordinatesLine({ latitude: -33.8688, longitude: -70.5, zone: 'America/Santiago' }),
    ).toBe('33.87° S · 70.50° W · America/Santiago');
  });
});
