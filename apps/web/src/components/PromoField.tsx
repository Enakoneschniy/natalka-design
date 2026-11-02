'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** The promo code on the order screen: typed here, or already brought in a link. The price on the
 * screen is worked out on the server, so a code that applies is followed by a refresh rather
 * than by arithmetic in the browser. */
export function PromoField({
  applied,
}: {
  /** The code the visitor carries and its terms, already in words; null when there is none. */
  applied: { label: string; outdone: boolean } | null;
}) {
  const t = useTranslations('offer');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const apply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/promo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (response.ok) {
        setCode('');
        router.refresh();
        return;
      }
      const answer = (await response.json().catch(() => null)) as { reason?: string } | null;
      const reason = answer?.reason;
      setError(
        reason === 'unknown' || reason === 'early' || reason === 'expired'
          ? t(reason)
          : t('failed'),
      );
    } catch {
      setError(t('failed'));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    setPending(true);
    try {
      await fetch('/api/promo', { method: 'DELETE' });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  if (applied) {
    return (
      <div className="promo-applied">
        <span>{applied.label}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={remove}
          disabled={pending}
        >
          {t('remove')}
        </button>
        {applied.outdone ? <p className="caption">{t('outdone')}</p> : null}
      </div>
    );
  }

  return (
    <form className="promo-field" onSubmit={apply} noValidate>
      <label className="label" htmlFor="promo">
        {t('field')}
      </label>
      <div className="promo-row">
        <input
          id="promo"
          className={`input mono${error ? ' is-error' : ''}`}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            if (error) setError('');
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={24}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'promo-error' : undefined}
        />
        <button type="submit" className="btn btn-secondary" disabled={pending || !code.trim()}>
          {pending ? t('applying') : t('apply')}
        </button>
      </div>
      {error ? (
        <span id="promo-error" className="hint is-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
