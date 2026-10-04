import { notFound } from 'next/navigation';

/** Any cabinet address without a page of its own. Static segments win over a catch-all, so the
 * real pages are untouched; this only routes the rest to the cabinet's `not-found`, which an
 * unmatched URL would otherwise skip for the app-wide one. */
export default function Unknown() {
  notFound();
}
