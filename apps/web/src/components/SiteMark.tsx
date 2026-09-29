import Link from 'next/link';
import { Logo } from '@/components/Logo';

/** The mark, and nothing else.
 *
 * There is no navigation bar on this site — one product, one language a visitor ever sees, and a
 * button in every section — but a page still has to say whose page it is, and the mark has to be
 * the way back to the front. It is transparent and out of the way: the hero, the form and the
 * reading all begin right under it.
 */
export function SiteMark({ locale }: { locale: string }) {
  return (
    <div className="site-mark">
      <Link className="logo" href={`/${locale}`} aria-label="Chronika">
        <Logo size={26} />
        <span>Chronika</span>
      </Link>
    </div>
  );
}
