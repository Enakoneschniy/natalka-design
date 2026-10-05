import Link from 'next/link';
import { Tabs } from '@/components/pro/Tabs';
import { creditsLabel } from '@/lib/pro/credits';
import { currentSeller } from '@/lib/pro/current';

/** Every signed-in page: the mark, who is signed in, the balance, sign-out and the four tabs.
 * On a phone the aside dissolves into the page (bar on top, tabs at the bottom); on a desktop it
 * is the left rail.
 *
 * «Выйти» is a plain anchor on purpose: a prefetching `next/link` would GET `/logout` from the
 * cabinet itself, same-origin, and sign the seller out just by showing the header. */
export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const seller = await currentSeller();
  return (
    <div className="shell">
      <aside className="side">
        <header className="bar">
          <Link href="/" className="logo">
            Chronika<small>PRO</small>
          </Link>
          <span className="who">{seller.name?.trim() || seller.email}</span>
          <span className="credits">{creditsLabel(seller.balance)}</span>
          <a href="/logout" className="signout">
            Выйти
          </a>
        </header>
        <Tabs />
      </aside>
      <main className="screen">{children}</main>
    </div>
  );
}
