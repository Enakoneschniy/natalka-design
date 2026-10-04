/** How the cabinet speaks about a reading: product names, the status pill, the progress line,
 * the date. Pure; the Отчёты list, the client card and the reading page share it. */

export type Product = 'natal' | 'forecast' | 'synastry' | 'child' | 'bundle';
export type ReadingStatus = 'writing' | 'ready' | 'failed';

/** A reading as `GET readings` lists it (jobs `ReadingSummary`). */
export interface ReadingSummary {
  id: string;
  product: Product;
  client_id: string;
  partner_client_id: string | null;
  status: ReadingStatus;
  created_at: string;
}

export const PRODUCT_LABEL: Record<Product, string> = {
  natal: 'Натальная карта',
  forecast: 'Прогноз на год',
  synastry: 'Синастрия',
  child: 'Детская карта',
  bundle: 'Натал + прогноз',
};

export type PillTone = 'ok' | 'wr' | 'bad' | 'gold';

export interface Pill {
  label: string;
  tone: PillTone;
}

/** The status pill. Only the full reading (`GET readings/:id`) knows `missing` and `pdf`; a list
 * row without them reads plainly as written or not. A failed reading had its credits returned. */
export function readingPill(reading: {
  status: ReadingStatus;
  missing?: number;
  pdf?: 'none' | 'building' | 'ready';
}): Pill {
  if (reading.status === 'failed') return { label: 'не получился, кредиты вернули', tone: 'bad' };
  if (reading.status === 'writing') return { label: 'пишется', tone: 'wr' };
  if ((reading.missing ?? 0) > 0) return { label: 'раздел не дописан', tone: 'bad' };
  if (reading.pdf === 'ready') return { label: 'PDF готов', tone: 'ok' };
  return { label: 'готов', tone: 'gold' };
}

const plural = new Intl.PluralRules('ru');

/** «7 из 20 разделов», «0 из 21 раздела»: after «из» the noun is genitive. */
export function progressLabel(written: number, total: number): string {
  if (total <= 0) return 'готовим план';
  const noun = plural.select(total) === 'one' ? 'раздела' : 'разделов';
  return `${written} из ${total} ${noun}`;
}

export function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'Клиент';
}

/** «Анна · Натальная карта», «Оксана и Игорь · Синастрия». */
export function readingTitle(product: Product, client?: string, partner?: string): string {
  const who = partner ? `${firstName(client)} и ${firstName(partner)}` : firstName(client);
  return `${who} · ${PRODUCT_LABEL[product] ?? product}`;
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «сегодня», «вчера», «2 окт», «29 сен 2025». Calendar days in UTC, the server's clock. */
export function readingDate(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days === 0) return 'сегодня';
  if (days === 1) return 'вчера';
  const short = `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
  return at.getUTCFullYear() === now.getUTCFullYear() ? short : `${short} ${at.getUTCFullYear()}`;
}
