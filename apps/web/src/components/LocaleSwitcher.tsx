'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { type Locale, localeLabels, localeNames } from '@/i18n/routing';

/** Compact globe button with a dropdown; the list of locales is decided on the server. */
export function LocaleSwitcher({ available }: { available: Locale[] }) {
  const current = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const switchTo = (locale: Locale) => {
    const rest = pathname.replace(new RegExp(`^/${params.locale as string}`), '') || '/';
    router.replace(`/${locale}${rest}`);
    setOpen(false);
  };

  return (
    <div className="lang-drop" ref={box}>
      <button
        type="button"
        className="lang-current"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M1.5 8h13M8 1.5c2.5 2.5 2.5 10.5 0 13M8 1.5c-2.5 2.5-2.5 10.5 0 13" />
        </svg>
        <span className="lang-code">{localeLabels[current]}</span>
        <svg
          className="chev"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>
      <div className="lang-list" role="listbox" data-open={open || undefined}>
        {available.map((locale) => (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={locale === current}
            onClick={() => switchTo(locale)}
          >
            <span className="lang-code">{localeLabels[locale]}</span>
            <span>{localeNames[locale]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
