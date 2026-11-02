'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { checkEmail } from '@/lib/validate';

/** The declaration itself: name, the order's address, and what identifies the order. The button
 * says what it does — "Widerruf bestätigen" — and the answer shows when the declaration arrived,
 * the same moment the receipt in the letter names. */
export function WithdrawForm({ locale }: { locale: string }) {
  const t = useTranslations('withdraw');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [done, setDone] = useState<{ when: string; email: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = checkEmail(email);
    const found = {
      ...(name.trim() ? {} : { name: t('nameInvalid') }),
      ...(address.ok ? {} : { email: t('emailInvalid') }),
    };
    setErrors(found);
    if (!address.ok || !name.trim()) return;
    setPending(true);
    try {
      const response = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale, name, email: address.value, order, message }),
      });
      if (response.status === 429) {
        setErrors({ form: t('tooMany') });
        return;
      }
      if (!response.ok) {
        setErrors({ form: t('failed') });
        return;
      }
      const answer = (await response.json()) as { received_at?: string | null };
      const at = answer.received_at ? new Date(answer.received_at) : new Date();
      setDone({
        when: new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(at),
        email: address.value,
      });
    } catch {
      setErrors({ form: t('failed') });
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className="card withdraw-done" role="status">
        <h2>{t('doneTitle')}</h2>
        <p>{t('doneBody', done)}</p>
      </div>
    );
  }

  return (
    <form className="card withdraw-form" onSubmit={submit} noValidate>
      <div className="field">
        <label className="label" htmlFor="w-name">
          {t('name')}
        </label>
        <input
          id="w-name"
          className={`input${errors.name ? ' is-error' : ''}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={120}
          aria-invalid={errors.name ? true : undefined}
        />
        {errors.name ? <span className="hint is-error">{errors.name}</span> : null}
      </div>
      <div className="field">
        <label className="label" htmlFor="w-email">
          {t('email')}
        </label>
        <input
          id="w-email"
          type="email"
          className={`input${errors.email ? ' is-error' : ''}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          maxLength={254}
          aria-invalid={errors.email ? true : undefined}
        />
        {errors.email ? <span className="hint is-error">{errors.email}</span> : null}
      </div>
      <div className="field">
        <label className="label" htmlFor="w-order">
          {t('order')}
        </label>
        <input
          id="w-order"
          className="input"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          maxLength={120}
        />
        <span className="hint">{t('orderHint')}</span>
      </div>
      <div className="field">
        <label className="label" htmlFor="w-message">
          {t('message')}
        </label>
        <textarea
          id="w-message"
          className="input"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
        />
        <span className="hint">{t('messageHint')}</span>
      </div>
      {errors.form ? (
        <p className="hint is-error" role="alert">
          {errors.form}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={pending}>
        {pending ? t('sending') : t('submit')}
      </button>
    </form>
  );
}
