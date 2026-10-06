import Link from 'next/link';
import { Tabs } from '@/components/pro/Tabs';
import { creditsLabel } from '@/lib/pro/credits';
import { currentSeller } from '@/lib/pro/current';

/** Every signed-in page: the mark, who is signed in (a link to the account page), the balance,
 * sign-out and the four tabs. On a phone the aside dissolves into the page (bar on top, tabs at
 * the bottom); on a desktop it is the left rail.
 *
 * «Выйти» is a button in a form that POSTs to `/logout`: signing out ends the session on every
 * device, and only the cabinet's own page can send that — never a link, a prefetch or another
 * site. */
export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const seller = await currentSeller();
  return (
    <div className="shell">
      <aside className="side">
        <header className="bar">
          <Link href="/" className="logo">
            Chronika<small>PRO</small>
          </Link>
          <span className="who">
            <Link href="/account">{seller.name?.trim() || seller.email}</Link>
          </span>
          <span className="credits">{creditsLabel(seller.balance)}</span>
          <form action="/logout" method="post" className="signout-form">
            <button type="submit" className="signout">
              Выйти
            </button>
          </form>
        </header>
        <Tabs />
      </aside>
      <main className="screen">{children}</main>
    </div>
  );
}
