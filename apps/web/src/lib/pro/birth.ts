/** A client's birth as the cabinet's form holds it, checked the way the jobs worker checks it
 * (`parseClientBirth`), and turned into the body `POST clients` wants. Pure: the form, the list
 * and the card share it, and the tests pin the rules. */

import type { City } from '@/app/api/cities/route';
import { cityLabel } from '@/lib/birth-input';

export type Gender = 'female' | 'male' | 'neutral';

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Женский' },
  { value: 'male', label: 'Мужской' },
  { value: 'neutral', label: 'Не указывать' },
];

/** The web's labels to the codes the jobs worker stores. */
export const GENDER_CODE: Record<Gender, 'f' | 'm' | 'n'> = {
  female: 'f',
  male: 'm',
  neutral: 'n',
};

/** A client as `GET clients` returns it (jobs `ClientView`). */
export interface ProClient {
  id: string;
  name: string;
  /** `yyyy-mm-dd`. */
  date: string;
  /** `hh:mm`, or null when unknown. */
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  place: string;
  gender: 'f' | 'm' | 'n';
  created_at: string;
}

/** The body of `POST clients`: jobs `ClientBirth` and the seller's word that the client agreed. */
export interface ClientBody {
  name: string;
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  place: string;
  gender: 'f' | 'm' | 'n';
  consent: true;
}

/** The new-client form as typed. */
export interface ClientDraft {
  name: string;
  /** `dd.mm.yyyy`, as `maskDate` leaves it. */
  date: string;
  /** `hh:mm`, as `maskTime` leaves it. */
  time: string;
  unknownTime: boolean;
  city: City | null;
  gender: Gender;
  consent: boolean;
}

export type ClientField = 'name' | 'date' | 'time' | 'city' | 'consent';

export const NAME_MAX = 80;
const EARLIEST_BIRTH = '1900-01-01';

/** `dd.mm.yyyy` → `yyyy-mm-dd`, or null unless it is a real date from 1900-01-01 up to today
 * (UTC, as the jobs worker counts it). */
export function parseBirthDate(text: string, today: Date = new Date()): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return null;
  // Zero-padded ISO dates compare as strings.
  return iso >= EARLIEST_BIRTH && iso <= today.toISOString().slice(0, 10) ? iso : null;
}

/** A 24-hour `hh:mm`, or null. */
export function parseBirthTime(text: string): string | null {
  const trimmed = text.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : null;
}

export const FIELD_ERROR: Record<ClientField, string> = {
  name: `Укажите имя, до ${NAME_MAX} символов.`,
  date: 'Укажите дату в виде дд.мм.гггг — не раньше 1900 года и не позже сегодняшнего дня.',
  time: 'Укажите время в виде чч:мм или отметьте, что оно неизвестно.',
  city: 'Выберите город из списка.',
  consent: 'Без согласия клиента сохранить его данные нельзя.',
};

/** What is wrong with the form, field by field; empty when it can be sent. */
export function checkClient(
  draft: ClientDraft,
  today: Date = new Date(),
): Partial<Record<ClientField, string>> {
  const errors: Partial<Record<ClientField, string>> = {};
  const name = draft.name.trim();
  if (name.length === 0 || name.length > NAME_MAX) errors.name = FIELD_ERROR.name;
  if (!parseBirthDate(draft.date, today)) errors.date = FIELD_ERROR.date;
  if (!draft.unknownTime && !parseBirthTime(draft.time)) errors.time = FIELD_ERROR.time;
  if (!draft.city) errors.city = FIELD_ERROR.city;
  if (!draft.consent) errors.consent = FIELD_ERROR.consent;
  return errors;
}

/** The `POST clients` body for a form that passes `checkClient`, else null. */
export function clientBody(draft: ClientDraft, today: Date = new Date()): ClientBody | null {
  const date = parseBirthDate(draft.date, today);
  const time = draft.unknownTime ? null : parseBirthTime(draft.time);
  const { city } = draft;
  if (Object.keys(checkClient(draft, today)).length > 0 || !date || !city) return null;
  return {
    name: draft.name.trim(),
    date,
    time,
    latitude: city.latitude,
    longitude: city.longitude,
    zone: city.zone,
    place: cityLabel(city),
    gender: GENDER_CODE[draft.gender],
    consent: true,
  };
}

/** `yyyy-mm-dd` → `dd.mm.yyyy`. */
export const displayDate = (iso: string): string => iso.split('-').reverse().join('.');

/** «15.05.1994 · 15:25 · Евпатория», or «время неизвестно» in the middle. */
export function birthLine(client: Pick<ProClient, 'date' | 'time' | 'place'>): string {
  return [displayDate(client.date), client.time ?? 'время неизвестно', client.place].join(' · ');
}

/** «45.20° N · 33.36° E · Europe/Simferopol», shown under the city once it is picked. */
export function coordinatesLine(city: Pick<City, 'latitude' | 'longitude' | 'zone'>): string {
  const lat = `${Math.abs(city.latitude).toFixed(2)}° ${city.latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(city.longitude).toFixed(2)}° ${city.longitude >= 0 ? 'E' : 'W'}`;
  return `${lat} · ${lon} · ${city.zone}`;
}

/** The letter in a client's avatar. */
export const initial = (name: string): string => name.trim().charAt(0).toUpperCase() || '·';
