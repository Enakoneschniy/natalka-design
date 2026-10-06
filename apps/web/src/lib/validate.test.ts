import { describe, expect, it } from 'vitest';
import { checkBirth, checkEmail, checkOrder, cleanText } from './validate';

const TODAY = new Date('2026-10-06T12:00:00Z');

const person = {
  date: '1990-05-15',
  time: '14:30',
  latitude: 50.45,
  longitude: 30.52,
  zone: 'Europe/Kyiv',
  place: 'Киев, Украина',
  name: 'Анна',
  gender: 'f',
};

const order = { email: 'anna@example.com', product: 'natal', locale: 'ru', birth: person };

const field = (result: { ok: boolean; field?: string }) => (result.ok ? null : result.field);

describe('cleanText', () => {
  it('drops control characters and trims', () => {
    expect(cleanText(' Ан\u0000на\n\t\u0085 ')).toBe('Анна');
    expect(cleanText('Анна-Мария О’Нил')).toBe('Анна-Мария О’Нил');
  });
});

describe('checkEmail', () => {
  it('takes an address of the usual shape, trimmed', () => {
    expect(checkEmail(' anna@example.com ')).toEqual({ ok: true, value: 'anna@example.com' });
  });

  it('refuses what is not one or is too long', () => {
    for (const bad of ['', 'anna', 'anna@example', 'an na@example.com', 42, null]) {
      expect(checkEmail(bad).ok, String(bad)).toBe(false);
    }
    expect(checkEmail(`${'a'.repeat(243)}@example.com`).ok).toBe(false);
    expect(checkEmail(`${'a'.repeat(242)}@example.com`).ok).toBe(true);
  });
});

describe('checkBirth', () => {
  const check = (patch: Record<string, unknown>) =>
    checkBirth({ ...person, ...patch }, 'birth', TODAY);

  it('keeps a good birth as it is, the name cleaned', () => {
    expect(check({ name: ' Анна\u0007 ' })).toEqual({
      ok: true,
      value: { ...person, name: 'Анна' },
    });
  });

  it('takes an unknown time and fills what may be left out', () => {
    const result = checkBirth(
      { date: '1990-05-15', time: null, latitude: 0, longitude: 0, zone: 'UTC' },
      'birth',
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        date: '1990-05-15',
        time: null,
        latitude: 0,
        longitude: 0,
        zone: 'UTC',
        place: '',
        name: '',
        gender: 'n',
      },
    });
  });

  it('wants a real date between 1900 and today', () => {
    for (const date of ['1990-02-30', '1990-13-01', '15.05.1990', '1899-12-31', '2026-10-07']) {
      expect(field(check({ date })), date).toBe('birth.date');
    }
    expect(check({ date: '1900-01-01' }).ok).toBe(true);
    expect(check({ date: '2026-10-06' }).ok).toBe(true);
  });

  it('wants HH:MM or nothing for the time', () => {
    for (const time of ['24:00', '9:30', '12:60', '12:30:00', 1230]) {
      expect(field(check({ time })), String(time)).toBe('birth.time');
    }
  });

  it('wants coordinates on the globe', () => {
    for (const latitude of [90.1, -91, Number.NaN, '50', Number.POSITIVE_INFINITY]) {
      expect(field(check({ latitude })), String(latitude)).toBe('birth.latitude');
    }
    for (const longitude of [180.5, -181, Number.NaN, null]) {
      expect(field(check({ longitude })), String(longitude)).toBe('birth.longitude');
    }
    expect(check({ latitude: -90, longitude: 180 }).ok).toBe(true);
  });

  it('bounds the zone, the place and the name', () => {
    expect(field(check({ zone: '' }))).toBe('birth.zone');
    expect(field(check({ zone: 'Z'.repeat(65) }))).toBe('birth.zone');
    expect(field(check({ place: 'п'.repeat(121) }))).toBe('birth.place');
    expect(field(check({ name: 'и'.repeat(81) }))).toBe('birth.name');
    expect(check({ name: `${'и'.repeat(80)}\u0000` }).ok).toBe(true);
    expect(field(check({ gender: 'x' }))).toBe('birth.gender');
  });

  it('refuses something that is not a birth at all', () => {
    expect(field(checkBirth(null, 'birth_second', TODAY))).toBe('birth_second');
    expect(field(checkBirth([person], 'birth', TODAY))).toBe('birth');
  });
});

describe('checkOrder', () => {
  it('passes a good order on with only the fields jobs takes', () => {
    const result = checkOrder(
      { ...order, cancel_url: 'https://evil.example', product_name: 'x' },
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      value: { email: 'anna@example.com', product: 'natal', locale: 'ru', birth: person },
    });
  });

  it('names the first field that is wrong', () => {
    expect(field(checkOrder({ ...order, email: 'nope' }, TODAY))).toBe('email');
    expect(field(checkOrder({ ...order, product: 'tarot' }, TODAY))).toBe('product');
    expect(field(checkOrder({ ...order, locale: 'de' }, TODAY))).toBe('locale');
    expect(field(checkOrder({ ...order, birth: { ...person, zone: '' } }, TODAY))).toBe(
      'birth.zone',
    );
    expect(field(checkOrder(null, TODAY))).toBe('body');
  });

  it('wants the partner for a synastry, and only for one', () => {
    expect(field(checkOrder({ ...order, product: 'synastry' }, TODAY))).toBe('birth_second');
    const pair = checkOrder(
      { ...order, product: 'synastry', birth_second: { ...person, name: 'Б' } },
      TODAY,
    );
    expect(pair.ok && pair.value.birth_second?.name).toBe('Б');
    const single = checkOrder({ ...order, birth_second: { ...person, date: 'bad' } }, TODAY);
    expect(single.ok && single.value.birth_second).toBeUndefined();
  });

  it('defaults the locale to Russian', () => {
    const result = checkOrder({ ...order, locale: undefined }, TODAY);
    expect(result.ok && result.value.locale).toBe('ru');
  });
});
