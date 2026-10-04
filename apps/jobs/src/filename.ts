import type { Product } from './db';

/** What the document is called when it lands in a Downloads folder or a Telegram chat:
 * "Оксана — 17.05.1990 14-30 — натальная карта.pdf". The name, the birth, the product — in that
 * order, because a folder sorts by the first word and a person looks for their own name. */

const PRODUCT: Record<string, Record<Product, string>> = {
  uk: {
    natal: 'натальна карта',
    forecast: 'прогноз',
    synastry: 'сумісність',
    child: 'дитяча карта',
    bundle: 'карта і прогноз',
  },
  ru: {
    natal: 'натальная карта',
    forecast: 'прогноз',
    synastry: 'совместимость',
    child: 'детская карта',
    bundle: 'карта и прогноз',
  },
  en: {
    natal: 'birth chart',
    forecast: 'forecast',
    synastry: 'compatibility',
    child: "child's chart",
    bundle: 'chart and forecast',
  },
};

const AND: Record<string, string> = { uk: 'і', ru: 'и', en: 'and', pl: 'i', de: 'und' };

interface Person {
  name: string;
  date: string;
  time: string | null;
}

export function documentFilename(
  product: Product,
  locale: string,
  first: Person,
  second: Person | null,
): string {
  const label = (PRODUCT[locale] ?? PRODUCT.en)?.[product] ?? product;
  const dmy = (iso: string) => iso.split('-').reverse().join('.');
  const parts: string[] = [];
  if (second) {
    parts.push(`${clean(first.name)} ${AND[locale] ?? 'and'} ${clean(second.name)}`);
  } else {
    parts.push(clean(first.name));
    parts.push(first.time ? `${dmy(first.date)} ${first.time.replace(':', '-')}` : dmy(first.date));
  }
  parts.push(label);
  return `${parts.filter(Boolean).join(' — ')}.pdf`;
}

/** Characters no file system accepts, and the whitespace a name should not carry. */
const clean = (text: string) => text.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();

/** Content-Disposition for a non-ASCII name: the RFC 5987 form for browsers that read it, an
 * ASCII fallback for the rest. */
export function contentDisposition(filename: string, inline = true): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'reading.pdf';
  const fallback = ascii.endsWith('.pdf') ? ascii : 'reading.pdf';
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
