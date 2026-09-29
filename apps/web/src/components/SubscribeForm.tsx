'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BirthInput } from '@/lib/jobs';

/** Cadence, email, consent — then the subscription exists and the first horoscope is on its way. */
export function SubscribeForm({
  locale,
  birth,
  price,
}: {
  locale: string;
  birth: BirthInput;
  price: string;
}) {
  const t = useTranslations('subscription');
  const router = useRouter();
  const [cadence, setCadence] = useState<'week' | 'month'>('week');
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !agreed) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, locale, cadence, birth }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const { token } = (await response.json()) as { token: string };
      router.push(`/${locale}/subscription?t=${encodeURIComponent(token)}`);
    } catch {
      setError(t('failed'));
      setPending(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="card person-card">
        <div className="field">
          <span className="label">{t('cadence')}</span>
          <div className="cadence" role="radiogroup" aria-label={t('cadence')}>
            {(['week', 'month'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={cadence === option}
                className={`cadence-option${cadence === option ? ' is-active' : ''}`}
                onClick={() => setCadence(option)}
              >
                <strong>{t(option)}</strong>
                <span className="muted">{t(`${option}Hint`)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="sub-email">
            {t('email')}
          </label>
          <input
            className="input"
            id="sub-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="hint">{t('emailHint')}</span>
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
          <span>{t('consent', { price })}</span>
        </label>
      </div>

      <div className="form-foot">
        <button
          className="btn btn-primary btn-lg"
          type="submit"
          disabled={pending || !agreed || !email}
        >
          {pending ? t('submitPending') : t('submit')}
        </button>
        <span className="caption">{t('foot', { price })}</span>
        {error ? <span className="hint is-error">{error}</span> : null}
      </div>
    </form>
  );
}
