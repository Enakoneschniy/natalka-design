'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Line icons for the phone's bottom bar, drawn in the link's own colour. */
const ICONS = {
  // A page with its corner folded and two lines of text.
  document: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </>
  ),
  // A head and shoulders.
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  // A five-pointed star, the brand's mark.
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z" />,
  // A coin seen face on, with its rim and a stroke across.
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 9.5v5" />
    </>
  ),
};

const TABS = [
  { href: '/', label: 'Отчёты', icon: 'document' },
  { href: '/clients', label: 'Клиенты', icon: 'person' },
  { href: '/brand', label: 'Бренд', icon: 'star' },
  { href: '/credits', label: 'Кредиты', icon: 'coin' },
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
          <svg
            aria-hidden="true"
            focusable="false"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICONS[tab.icon]}
          </svg>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
