/** The birth-place search, as it goes to the city index. */

const MAX_QUERY = 64;
const MAX_WORDS = 5;
const MIN_WORD = 2;

/** What a typed query becomes: every word a prefix, so "kyi obl" still finds "Kyiv Oblast" —
 * at most five words of two letters or more, from the first 64 characters. Null when nothing is
 * left to look for. `name` is the query as typed, for ranking an exact name first. */
export function cityQuery(raw: string | null | undefined): { match: string; name: string } | null {
  const name = (raw ?? '').trim().slice(0, MAX_QUERY);
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/["*]/g, ''))
    .filter((word) => word.length >= MIN_WORD)
    .slice(0, MAX_WORDS);
  if (words.length === 0) return null;
  return { match: words.map((word) => `"${word}"*`).join(' '), name };
}
