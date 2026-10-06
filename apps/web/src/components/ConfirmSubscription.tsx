'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** The one button on the confirmation page. Opening the link confirms nothing — a mail scanner
 * follows links too; pressing this does, and leads to the subscription's own page. */
export function ConfirmSubscription({ locale, token }: { locale: string; token: string }) {
  const t = useTranslations('subscription');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [gone, setGone] = useState(false);

  const confirm = async () => {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/subscriptions/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => null)) as { token?: string } | null;
      if (response.ok && data?.token) {
        router.replace(`/${locale}/subscription?t=${encodeURIComponent(data.token)}`);
        return;
      }
      if (response.status === 404 || response.status === 400) setGone(true);
      else setError(response.status === 429 ? t('tooMany') : t('confirmFailed'));
    } catch {
      setError(t('confirmFailed'));
    }
    setPending(false);
  };

  if (gone) return <p className="explain">{t('confirmGone')}</p>;

  return (
    <div className="form-foot">
      <button className="btn btn-primary btn-lg" type="button" disabled={pending} onClick={confirm}>
        {pending ? t('confirmPending') : t('confirm')}
      </button>
      {error ? <span className="hint is-error">{error}</span> : null}
    </div>
  );
}
