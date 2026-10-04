'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Отчёты' },
  { href: '/clients', label: 'Клиенты' },
  { href: '/brand', label: 'Бренд' },
  { href: '/credits', label: 'Кредиты' },
] as const;

/** The public path of the page, whether Next reports the address bar or the internal `/pro` tree. */
const publicPath = (pathname: string) => pathname.replace(/^\/pro(?=\/|$)/, '') || '/';

/** A reading, a new order and the sample all belong to the Отчёты tab. */
const isActive = (path: string, href: string) =>
  href === '/'
    ? path === '/' || path === '/example' || path.startsWith('/readings/')
    : path === href || path.startsWith(`${href}/`);

export function Tabs() {
  const path = publicPath(usePathname() ?? '/');
  return (
    <nav className="tabs" aria-label="Разделы кабинета">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={isActive(path, tab.href) ? 'page' : undefined}
        >
          <i aria-hidden="true" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
