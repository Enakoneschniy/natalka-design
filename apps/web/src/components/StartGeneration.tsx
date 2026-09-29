'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
}: {
  locale: string;
  product: string;
  birth: Birth;
  birthSecond?: Birth;
}) {
  const t = useTranslations('checkout');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError(t('emailInvalid'));
      return;
    }
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, product, locale, birth, birth_second: birthSecond }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const { token } = (await response.json()) as { token: string };
      router.push(`/${locale}/generating?t=${encodeURIComponent(token)}`);
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
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={pending}>
        {pending ? t('starting') : t('start')}
      </button>
      <p className="caption">{t('startNote')}</p>
    </form>
  );
}
