'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CONSENT_COOKIE, CONSENT_MAX_AGE } from '@/lib/marketing';

/** The question, asked once.
 *
 * Nothing is loaded before the answer, so saying no is the default state rather than a promise.
 * The answer goes into a first-party cookie and the page is re-rendered by the server, which is
 * what puts the tags in — or leaves them out.
 */
export function Consent() {
  const t = useTranslations('consent');
  const router = useRouter();
  const [gone, setGone] = useState(false);

  const answer = (value: 'granted' | 'denied') => {
    // A first-party cookie the server reads on the next render. The cookie store API is not
    // everywhere yet, and this is the one line that has to work in every browser.
    // biome-ignore lint/suspicious/noDocumentCookie: the visitor's own answer, set once
    document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax; secure`;
    setGone(true);
    router.refresh();
  };

  if (gone) return null;

  return (
    <div className="consent" role="dialog" aria-live="polite" aria-label={t('title')}>
      <p>{t('text')}</p>
      <div className="consent-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => answer('denied')}>
          {t('deny')}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => answer('granted')}>
          {t('allow')}
        </button>
      </div>
    </div>
  );
}
