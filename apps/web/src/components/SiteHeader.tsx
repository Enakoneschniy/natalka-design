'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Locale } from '@/i18n/routing';
import { LocaleSwitcher } from './LocaleSwitcher';
import { Logo } from './Logo';

export function SiteHeader({ locale, available }: { locale: Locale; available: Locale[] }) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const links = [
    { href: `/${locale}#products`, label: t('products') },
    { href: `/${locale}#how`, label: t('how') },
    { href: `/${locale}#faq`, label: t('faq') },
  ];

  return (
    <>
      <header className="nav">
        <div className="container-page nav-inner">
          <Link className="logo" href={`/${locale}`}>
            <Logo />
            Natalka
          </Link>
          <nav className="nav-links">
            {links.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            <Link className="btn btn-primary btn-sm" href={`/${locale}/start`}>
              {t('start')}
            </Link>
          </div>
          <LocaleSwitcher available={available} />
          <button
            type="button"
            className="nav-burger"
            aria-label={t('menu')}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>
      <div className="menu" data-open={open || undefined} aria-hidden={!open}>
        <div className="menu-inner">
          <nav className="menu-links">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </nav>
          <Link
            className="btn btn-primary btn-lg"
            href={`/${locale}/start`}
            onClick={() => setOpen(false)}
          >
            {t('start')}
          </Link>
        </div>
      </div>
    </>
  );
}
