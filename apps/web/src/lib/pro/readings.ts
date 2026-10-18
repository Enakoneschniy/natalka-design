/** How the cabinet speaks about a reading: product names, the status pill, the progress line,
 * the date, the order button, the reading page's dock and its messages. Pure; the Отчёты list,
 * the client card, the order form and the reading page share it. */

import type { ProLang } from './lang';
import { textFor } from './text';

export type Product = 'natal' | 'forecast' | 'synastry' | 'child' | 'bundle';
export type ReadingStatus = 'writing' | 'ready' | 'failed';

/** A reading as `GET readings` lists it (jobs `ReadingSummary`). */
export interface ReadingSummary {
  id: string;
  product: Product;
  /** The language it is written in. Optional: older workers omit it (they wrote Russian only). */
  lang?: ProLang;
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
  lang?: ProLang;
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

/** «Натальная карта», «Натальна карта». */
export const productLabel = (product: Product, lang: ProLang): string =>
  textFor(lang).products[product] ?? product;

export type PillTone = 'ok' | 'wr' | 'bad' | 'gold';

export interface Pill {
  label: string;
  tone: PillTone;
}

/** The status pill. The list says `missing` as a count and `pdf_ready`; the full reading says
 * `missing` as a list (pass its length) and `pdf`. A failed reading had its credits returned. */
export function readingPill(
  reading: {
    status: ReadingStatus;
    missing?: number;
    pdf?: 'none' | 'building' | 'ready';
    pdf_ready?: boolean;
  },
  lang: ProLang,
): Pill {
  const label = textFor(lang).reading.pill;
  if (reading.status === 'failed') return { label: label.failed, tone: 'bad' };
  if (reading.status === 'writing') return { label: label.writing, tone: 'wr' };
  if ((reading.missing ?? 0) > 0) return { label: label.missing, tone: 'bad' };
  if (reading.pdf === 'ready' || reading.pdf_ready) return { label: label.pdf, tone: 'ok' };
  return { label: label.ready, tone: 'gold' };
}

/** What each product costs in credits (jobs `CREDIT_COST`). */
export const CREDIT_COST: Record<Product, number> = {
  natal: 1,
  forecast: 1,
  synastry: 1,
  child: 1,
  bundle: 2,
};

/** The products in the order the form shows them; synastry and bundle carry a note on what they
 * need or give (`productNotes` in the catalogues). */
export const PRODUCTS: Product[] = ['natal', 'forecast', 'synastry', 'child', 'bundle'];

/** What the form says under a product beside its price, if anything. */
export function productNote(product: Product, lang: ProLang): string | undefined {
  const notes: Partial<Record<Product, string>> = textFor(lang).productNotes;
  return notes[product];
}

/** «Заказать за 1 кредит», «… за 2 кредита», «… за 5 кредитов». */
export const orderLabel = (cost: number, lang: ProLang): string => textFor(lang).order.submit(cost);

/** «7 из 20 разделов», «0 из 21 раздела»: after «из» the noun is genitive. */
export const progressLabel = (written: number, total: number, lang: ProLang): string =>
  textFor(lang).reading.progress(written, total);

/** «1 раздел», «3 раздела», «20 разделов». */
export const sectionsLabel = (n: number, lang: ProLang): string =>
  textFor(lang).reading.sections(n);

export function firstName(name: string | undefined, lang: ProLang): string {
  return name?.trim().split(/\s+/)[0] || textFor(lang).reading.someone;
}

/** «Анна · Натальная карта», «Оксана и Игорь · Синастрия». */
export function readingTitle(
  product: Product,
  lang: ProLang,
  client?: string,
  partner?: string,
): string {
  const who = partner
    ? `${firstName(client, lang)} ${textFor(lang).reading.and} ${firstName(partner, lang)}`
    : firstName(client, lang);
  return `${who} · ${productLabel(product, lang)}`;
}

/** «сегодня», «вчера», «2 окт», «29 сен 2025». Calendar days in UTC, the server's clock. */
export function readingDate(iso: string, lang: ProLang, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const t = textFor(lang).reading;
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days === 0) return t.today;
  if (days === 1) return t.yesterday;
  const short = `${at.getUTCDate()} ${t.months[at.getUTCMonth()]}`;
  return at.getUTCFullYear() === now.getUTCFullYear() ? short : `${short} ${at.getUTCFullYear()}`;
}

/** «18 окт»: a day and a month, in UTC like the rest. */
export function dayMonth(iso: string, lang: ProLang): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getUTCDate()} ${textFor(lang).reading.months[at.getUTCMonth()]}`;
}

/** The reading header's second line: rewrites left and the last day of edits, or that edits are
 * closed. */
export function editLine(
  view: Pick<ReadingView, 'frozen' | 'regenerations_left' | 'editable_until'>,
  lang: ProLang,
): string {
  const t = textFor(lang).reading;
  if (view.frozen) return t.frozen;
  return t.editLine(
    view.regenerations_left,
    REGENERATIONS_PER_READING,
    dayMonth(view.editable_until, lang),
  );
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
export function missingNote(
  missing: readonly { id?: string; title: string }[],
  lang: ProLang,
): string {
  return textFor(lang).reading.missingNote(missing.map((m) => `«${m.title}»`).join(', '));
}

/** Why a rewrite or a fill did not happen, from the proxy's status and `error`. */
export function rewriteError(status: number, error: string | undefined, lang: ProLang): string {
  const t = textFor(lang);
  const refused = t.reading.rewriteRefused;
  if (status === 409 && error === 'limit') return refused.limit(REGENERATIONS_PER_READING);
  if (status === 409 && (error === 'frozen' || error === 'busy' || error === 'not_ready')) {
    return refused[error];
  }
  if (status === 503) return t.reading.rewriteFailed;
  if (status === 404) return t.reading.sectionGone;
  return t.common.tryLater;
}

/** Why «Собрать PDF» was refused (409 `error`). */
export function assembleError(error: string | undefined, lang: ProLang): string {
  const t = textFor(lang);
  return (
    (error && Object.hasOwn(t.reading.assembleRefused, error)
      ? t.reading.assembleRefused[error]
      : undefined) ?? t.common.tryLater
  );
}

/** Why a report did not go. */
export function reportError(status: number, lang: ProLang): string {
  const t = textFor(lang);
  if (status === 400) return t.reading.reportEmpty;
  if (status === 429) return t.reading.reportTooMany;
  return t.common.tryLater;
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
