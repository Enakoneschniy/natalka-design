'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BirthInput } from '@/lib/jobs';
import { checkEmail } from '@/lib/validate';

/** Cadence, email, consent — then a letter goes to the address, and the subscription starts only
 * once its link is confirmed. The page says so and shows nothing more. */
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
  const [cadence, setCadence] = useState<'week' | 'month'>('week');
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = checkEmail(email);
    if (!agreed) return;
    if (!address.ok) {
      setError(t('emailInvalid'));
      return;
    }
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: address.value, locale, cadence, birth }),
      });
      if (response.status === 202) {
        setSentTo(address.value);
        return;
      }
      const data = (await response.json().catch(() => null)) as { field?: string } | null;
      setError(
        response.status === 429
          ? t('tooMany')
          : data?.field === 'email'
            ? t('emailInvalid')
            : t('failed'),
      );
    } catch {
      setError(t('failed'));
    }
    setPending(false);
  };

  if (sentTo) {
    return (
      <div className="card checkout-soon" role="status">
        <h2>{t('checkMailTitle')}</h2>
        <p className="muted">{t('checkMailBody', { email: sentTo })}</p>
        <p className="caption">{t('checkMailNote')}</p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="card person-card">
        <div className="field">
          <span className="label">{t('cadence')}</span>
          {/* The label above names the group; each option is a button that says whether it is
              pressed. */}
          <div className="cadence">
            {(['week', 'month'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={cadence === option}
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
