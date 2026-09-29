import { privacy } from './privacy';
import { refunds } from './refunds';
import { terms } from './terms';

export const LEGAL = { privacy, terms, refunds } as const;
export type LegalDoc = keyof typeof LEGAL;

/** Heading, paragraph, list and inline marks — the four things a policy is made of. A markdown
 * library would be a dependency for a page nobody reads twice. */
export function renderLegal(source: string, locale: string): string {
  const inline = (text: string) =>
    escape(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<em>$2</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, (_, label: string, href: string) => {
        const target = href.replace('[locale]', locale);
        return `<a href="${target}">${label}</a>`;
      });

  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const block of source.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim());
    if (lines.every((l) => l.startsWith('- '))) {
      list.push(...lines.map((l) => l.slice(2)));
      continue;
    }
    flush();
    const text = lines.join(' ');
    if (text.startsWith('## ')) out.push(`<h2>${inline(text.slice(3))}</h2>`);
    else if (text.startsWith('# ')) out.push(`<h1>${inline(text.slice(2))}</h1>`);
    else out.push(`<p>${inline(text)}</p>`);
  }
  flush();
  return out.join('\n');
}

/** The h1 of a document, for the page title. */
export function legalTitle(source: string): string {
  return source.match(/^# (.+)$/m)?.[1] ?? 'Chronika';
}

/** Anything still in square brackets is a field the owner has not filled in yet. */
export const isDraft = (source: string): boolean =>
  /\[[^\]]+\]/.test(source.replace(/\[(.+?)\]\(.+?\)/g, ''));

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
