'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { checkEmail } from '@/lib/validate';

interface Birth {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  place: string;
  name: string;
  gender: 'f' | 'm' | 'n';
}

/** Hands the order to the pipeline and sends the visitor to the waiting page. */
export function StartGeneration({
  locale,
  product,
  birth,
  birthSecond,
  blocked = false,
}: {
  locale: string;
  product: string;
  birth: Birth;
  birthSecond?: Birth;
  /** The visitor's country is one the payment provider does not allow us to sell to. */
  blocked?: boolean;
}) {
  const t = useTranslations('checkout');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = checkEmail(email);
    if (!address.ok) {
      setError(t('emailInvalid'));
      return;
    }
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: address.value,
          product,
          locale,
          birth,
          birth_second: birthSecond,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { field?: string } | null;
        setError(
          response.status === 429
            ? t('tooMany')
            : data?.field === 'email'
              ? t('emailInvalid')
              : t('startFailed'),
        );
        setPending(false);
        return;
      }
      const { token, checkout_url } = (await response.json()) as {
        token: string;
        checkout_url?: string;
      };
      // With payments live the order continues on Stripe's page and comes back to the waiting
      // screen; without them (test orders) it goes there directly.
      if (checkout_url) window.location.assign(checkout_url);
      else router.push(`/${locale}/generating?t=${encodeURIComponent(token)}`);
    } catch {
      setError(t('startFailed'));
      setPending(false);
    }
  };

  return (
    <form className="card checkout-start" onSubmit={submit} noValidate>
      <div className="field">
        <label className="label" htmlFor="email">
          {t('email')}
        </label>
        <input
          className={`input${error ? ' is-error' : ''}`}
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
        />
        <span className={`hint${error ? ' is-error' : ''}`}>{error || t('emailHint')}</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span className="box">
          <svg
            viewBox="0 0 14 14"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.5 7.5l3 3 6-7" />
          </svg>
        </span>
        <span>{t('consent')}</span>
      </label>
      {blocked ? <p className="hint is-error">{t('regionBlocked')}</p> : null}
      <button
        className="btn btn-primary btn-lg btn-block"
        type="submit"
        disabled={pending || !agreed || blocked}
      >
        {pending ? t('starting') : t('pay')}
      </button>
      <p className="caption">{t('startNote')}</p>
    </form>
  );
}
