import Link from 'next/link';
import { Suspense } from 'react';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { Logo } from '@/components/Logo';
import { locales } from '@/i18n/routing';

/** The mark, and nothing else.
 *
 * There is no navigation bar on this site — one product and a button in every section — but a
 * page still has to say whose page it is, and the mark has to be the way back to the front. It is
 * transparent and out of the way: the hero, the form and the reading all begin right under it.
 * The language switch sits at the other end of the same line.
 */
export function SiteMark({ locale }: { locale: string }) {
  return (
    <div className="site-mark">
      <Link className="logo" href={`/${locale}`} aria-label="Chronika">
        <Logo size={26} />
        <span>Chronika</span>
      </Link>
      {/* It reads the query string, which a page rendered on the server does not wait for. */}
      <Suspense>
        <LocaleSwitcher available={locales} />
      </Suspense>
    </div>
  );
}
