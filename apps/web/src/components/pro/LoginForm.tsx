'use client';

import Link from 'next/link';
import { useState } from 'react';
import { postJson, TRY_LATER } from './post';

type State = 'idle' | 'sending' | 'sent';

/** Email in, «Проверьте почту» out — the same answer whether or not the address has a cabinet. */
export function LoginForm({ expired }: { expired: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError('Укажите электронную почту.');
      return;
    }
    setError(null);
    setState('sending');
    const { status } = await postJson('/api/pro/login', { email: email.trim() });
    if (status === 202) return setState('sent');
    setState('idle');
    setError(status === 400 ? 'Проверьте адрес почты.' : TRY_LATER);
  }

  return (
    <form onSubmit={submit} noValidate>
      {expired && <p className="muted">Сессия закончилась, войдите снова.</p>}
      <div className="field">
        <label htmlFor="login-email">Электронная почта</label>
        <input
          id="login-email"
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
        />
        {error && (
          <span id="login-error" className="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
      <button className="btn" type="submit" disabled={state === 'sending'}>
        Прислать ссылку для входа
      </button>
      <p className="muted alt">
        Нет кабинета? <Link href="/signup">Зарегистрироваться</Link>
      </p>
      {state === 'sent' && (
        <div className="card notice" role="status">
          <strong>Проверьте почту</strong>
          <span className="muted">
            Если у этого адреса есть кабинет, ссылка придёт в течение минуты и будет действовать 15
            минут.
          </span>
        </div>
      )}
    </form>
  );
}
