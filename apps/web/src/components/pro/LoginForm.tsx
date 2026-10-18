'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useText } from './Lang';
import { postJson } from './post';

type State = 'idle' | 'sending' | 'sent';

/** Email in, «Проверьте почту» out — the same answer whether or not the address has a cabinet.
 * Above the field it says why the visitor is here, when the session ran out or the cabinet was
 * just closed. */
export function LoginForm({ expired, closed = false }: { expired: boolean; closed?: boolean }) {
  const t = useText();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError(t.login.noEmail);
      return;
    }
    setError(null);
    setState('sending');
    const { status } = await postJson('/api/pro/login', { email: email.trim() });
    if (status === 202) return setState('sent');
    setState('idle');
    setError(status === 400 ? t.login.badEmail : t.common.tryLater);
  }

  return (
    <form onSubmit={submit} noValidate>
      {closed ? (
        <div className="card notice" role="status">
          <strong>{t.login.closed}</strong>
        </div>
      ) : (
        expired && <p className="muted">{t.login.expired}</p>
      )}
      <div className="field">
        <label htmlFor="login-email">{t.common.email}</label>
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
        {t.login.submit}
      </button>
      <p className="muted alt">
        {t.login.noCabinet} <Link href="/signup">{t.login.signup}</Link>
      </p>
      {state === 'sent' && (
        <div className="card notice" role="status">
          <strong>{t.login.sentTitle}</strong>
          <span className="muted">{t.login.sentText}</span>
        </div>
      )}
    </form>
  );
}
