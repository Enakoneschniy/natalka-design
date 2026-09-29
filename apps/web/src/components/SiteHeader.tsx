'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { LocaleSwitcher } from './LocaleSwitcher';
import { Logo } from './Logo';

/** The mark, the language, and the one thing the page is for. While the site sells one product
 * there is nothing to navigate to: every section below ends in the same button. */
export function SiteHeader({ locale, available }: { locale: Locale; available: Locale[] }) {
  const t = useTranslations('nav');
  return (
    <header className="nav">
      <div className="container-page nav-inner">
        <Link className="logo" href={`/${locale}`}>
          <Logo />
          Chronika
        </Link>
        <div className="nav-actions">
          <LocaleSwitcher available={available} />
          <Link className="btn btn-primary btn-sm" href={`/${locale}/start?p=bundle`}>
            {t('start')}
          </Link>
        </div>
      </div>
    </header>
  );
}
