import Link from 'next/link';
import { Tabs } from '@/components/pro/Tabs';
import { creditsLabel } from '@/lib/pro/credits';
import { currentSeller } from '@/lib/pro/current';

/** Every signed-in page: the mark, who is signed in, the balance, and the four tabs. */
export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const seller = await currentSeller();
  return (
    <div className="shell">
      <header className="bar">
        <Link href="/" className="logo">
          Chronika<small>PRO</small>
        </Link>
        <span className="who">{seller.name}</span>
        <span className="credits">{creditsLabel(seller.balance)}</span>
      </header>
      <main className="screen">{children}</main>
      <Tabs />
    </div>
  );
}
