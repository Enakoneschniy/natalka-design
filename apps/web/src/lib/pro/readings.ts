/** How the cabinet speaks about a reading: product names, the status pill, the progress line,
 * the date, the order button, the reading page's dock and its messages. Pure; the Отчёты list,
 * the client card, the order form and the reading page share it. */

import { creditsLabel } from './credits';
import { TRY_LATER } from './messages';

export type Product = 'natal' | 'forecast' | 'synastry' | 'child' | 'bundle';
export type ReadingStatus = 'writing' | 'ready' | 'failed';

/** A reading as `GET readings` lists it (jobs `ReadingSummary`). */
export interface ReadingSummary {
  id: string;
  product: Product;
  client_id: string;
  partner_client_id: string | null;
  status: ReadingStatus;
  /** Planned sections a ready reading lacks (0 otherwise). Optional: older workers omit it. */
  missing?: number;
  /** A PDF exists and is not being rebuilt. */
  pdf_ready?: boolean;
  created_at: string;
}

export interface ReadingSection {
  id: string;
  title: string;
  text: string;
}

/** A reading as `GET readings/:id` gives it (jobs `ReadingView`). */
export interface ReadingView {
  id: string;
  product: Product;
  client_id: string;
  partner_client_id: string | null;
  status: ReadingStatus;
  written: number;
  total: number;
  /** In the order of the plan. */
  sections: ReadingSection[];
  /** Planned sections that could not be written; filled free of charge. */
  missing: { id: string; title: string }[];
  regenerations_left: number;
  editable_until: string;
  frozen: boolean;
  pdf: 'none' | 'building' | 'ready';
  pages: number | null;
  created_at: string;
}

export const REGENERATIONS_PER_READING = 10;

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

/** The status pill. The list says `missing` as a count and `pdf_ready`; the full reading says
 * `missing` as a list (pass its length) and `pdf`. A failed reading had its credits returned. */
export function readingPill(reading: {
  status: ReadingStatus;
  missing?: number;
  pdf?: 'none' | 'building' | 'ready';
  pdf_ready?: boolean;
}): Pill {
  if (reading.status === 'failed') return { label: 'не удалось, кредиты вернулись', tone: 'bad' };
  if (reading.status === 'writing') return { label: 'пишется', tone: 'wr' };
  if ((reading.missing ?? 0) > 0) return { label: 'раздел не дописан', tone: 'bad' };
  if (reading.pdf === 'ready' || reading.pdf_ready) return { label: 'PDF готов', tone: 'ok' };
  return { label: 'готов', tone: 'gold' };
}

/** What each product costs in credits (jobs `CREDIT_COST`). */
export const CREDIT_COST: Record<Product, number> = {
  natal: 1,
  forecast: 1,
  synastry: 1,
  child: 1,
  bundle: 2,
};

/** The products in the order the form shows them, with a word on what each needs or gives. */
export const PRODUCTS: { product: Product; note?: string }[] = [
  { product: 'natal' },
  { product: 'forecast' },
  { product: 'synastry', note: 'нужен партнёр' },
  { product: 'child' },
  { product: 'bundle', note: 'два документа в одном' },
];

/** «Заказать за 1 кредит», «… за 2 кредита», «… за 5 кредитов». */
export function orderLabel(cost: number): string {
  return `Заказать за ${creditsLabel(cost)}`;
}

const plural = new Intl.PluralRules('ru');

/** «7 из 20 разделов», «0 из 21 раздела»: after «из» the noun is genitive. */
export function progressLabel(written: number, total: number): string {
  if (total <= 0) return 'готовим план';
  const noun = plural.select(total) === 'one' ? 'раздела' : 'разделов';
  return `${written} из ${total} ${noun}`;
}

/** «1 раздел», «3 раздела», «20 разделов». */
export function sectionsLabel(n: number): string {
  const form = plural.select(n);
  const noun = form === 'one' ? 'раздел' : form === 'few' ? 'раздела' : 'разделов';
  return `${n} ${noun}`;
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

/** «18 окт»: a day and a month, in UTC like the rest. */
export function dayMonth(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

/** The reading header's second line: rewrites left and the last day of edits, or that edits are
 * closed. */
export function editLine(
  view: Pick<ReadingView, 'frozen' | 'regenerations_left' | 'editable_until'>,
): string {
  if (view.frozen) return 'правки закрыты';
  return `переписать: ${view.regenerations_left} из ${REGENERATIONS_PER_READING} до ${dayMonth(view.editable_until)}`;
}

export type DockState = 'writing' | 'failed' | 'missing' | 'assemble' | 'building' | 'download';

/** What the bar under a reading offers. */
export function dockState(view: Pick<ReadingView, 'status' | 'missing' | 'pdf'>): DockState {
  if (view.status === 'failed') return 'failed';
  if (view.status === 'writing') return 'writing';
  if (view.missing.length > 0) return 'missing';
  if (view.pdf === 'building') return 'building';
  if (view.pdf === 'ready') return 'download';
  return 'assemble';
}

/** A reading page polls while the texts are being written or the PDF is being assembled. */
export function needsPolling(view: Pick<ReadingView, 'status' | 'pdf'>): boolean {
  return view.status === 'writing' || (view.status === 'ready' && view.pdf === 'building');
}

/** «Сначала допишите: «Солнце», «Луна»». */
export function missingNote(missing: readonly { id?: string; title: string }[]): string {
  return `Сначала допишите: ${missing.map((m) => `«${m.title}»`).join(', ')}`;
}

const REWRITE_REFUSED: Record<string, string> = {
  limit: `Переписывать больше нельзя: использованы все ${REGENERATIONS_PER_READING} попыток`,
  frozen: 'Срок правок закончился',
  busy: 'Раздел уже переписывается, подождите',
  not_ready: 'Сейчас собирается PDF. Подождите пару минут.',
};

/** Why a rewrite or a fill did not happen, from the proxy's status and `error`. */
export function rewriteError(status: number, error?: string): string {
  if (status === 409 && error && REWRITE_REFUSED[error]) return REWRITE_REFUSED[error];
  if (status === 503) return 'Не получилось переписать раздел. Попробуйте ещё раз.';
  if (status === 404) return 'Раздел не найден. Обновите страницу.';
  return TRY_LATER;
}

const ASSEMBLE_REFUSED: Record<string, string> = {
  incomplete: 'Сначала допишите все разделы',
  no_brand: 'Сначала заполните бренд: он нужен для обложки PDF',
  not_ready: 'Разбор ещё пишется',
};

/** Why «Собрать PDF» was refused (409 `error`). */
export function assembleError(error: string | undefined): string {
  return (error && ASSEMBLE_REFUSED[error]) || TRY_LATER;
}

/** Why a report did not go. */
export function reportError(status: number): string {
  if (status === 400) return 'Напишите, что не так: до 1000 символов';
  if (status === 429) return 'Слишком много сообщений. Попробуйте через час.';
  return TRY_LATER;
}

export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
}

const MARK = /<(\/?)(b|strong|i|em)>/gi;

/** A section's text as paragraphs of marked runs. Paragraphs part on blank lines; `<b>`/`<strong>`
 * and `<i>`/`<em>` become marks; every other `<…>` stays literal text, so nothing is ever parsed
 * as HTML. React renders the runs as text. */
export function richParagraphs(text: string): Run[][] {
  return text
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const runs: Run[] = [];
      let bold = 0;
      let italic = 0;
      let last = 0;
      const push = (chunk: string) => {
        if (chunk) runs.push({ text: chunk, bold: bold > 0, italic: italic > 0 });
      };
      for (const match of block.matchAll(MARK)) {
        push(block.slice(last, match.index));
        last = (match.index ?? 0) + match[0].length;
        const closing = match[1] === '/';
        const tag = (match[2] ?? '').toLowerCase();
        const step = closing ? -1 : 1;
        if (tag === 'b' || tag === 'strong') bold = Math.max(0, bold + step);
        else italic = Math.max(0, italic + step);
      }
      push(block.slice(last));
      return runs;
    })
    .filter((runs) => runs.length > 0);
}

/** The reading once a rewrite or a fill came back: the new text in place (a filled section joins
 * the end until the next look at the reading puts it in plan order), the new counter, and no PDF,
 * since the worker drops the old one. */
export function applyRewrite(
  view: ReadingView,
  section: ReadingSection,
  regenerationsLeft: number | undefined,
): ReadingView {
  const known = view.sections.some((s) => s.id === section.id);
  return {
    ...view,
    sections: known
      ? view.sections.map((s) => (s.id === section.id ? section : s))
      : [...view.sections, section],
    missing: view.missing.filter((m) => m.id !== section.id),
    written: known ? view.written : view.written + 1,
    regenerations_left: regenerationsLeft ?? view.regenerations_left,
    pdf: 'none',
    pages: null,
  };
}

/** A PDF build that ended without a PDF: the worker gave up on it. */
export function pdfBuildFailed(before: ReadingView['pdf'], after: ReadingView['pdf']): boolean {
  return before === 'building' && after === 'none';
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** A section's number as the sketch shows it: I, II, III… */
export function roman(n: number): string {
  let rest = Math.max(0, Math.floor(n));
  let out = '';
  for (const [value, letters] of ROMAN) {
    while (rest >= value) {
      out += letters;
      rest -= value;
    }
  }
  return out;
}
