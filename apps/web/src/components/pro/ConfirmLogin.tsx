'use client';

import Link from 'next/link';
import { useState } from 'react';
import { confirmOutcome, postJson, TRY_LATER, UNAVAILABLE } from './post';

/** A link that no longer signs anyone in, and the way to a new one. */
export function LinkExpired() {
  return (
    <div className="card notice bad" role="alert">
      <strong>Ссылка устарела или уже использована</strong>
      <span className="muted">
        <Link href="/login">Запросите новую ссылку для входа</Link>
      </span>
    </div>
  );
}

/** The one button that spends the emailed token. Opening the link alone spends nothing. */
export function ConfirmLogin({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'expired' | 'unavailable' | 'failed'>(
    'idle',
  );

  async function enter() {
    setState('sending');
    const { status } = await postJson('/api/pro/session', { token });
    const outcome = confirmOutcome(status);
    if (outcome === 'signed-in') return window.location.assign('/');
    setState(outcome);
  }

  if (state === 'expired') return <LinkExpired />;

  return (
    <>
      <button className="btn" type="button" onClick={enter} disabled={state === 'sending'}>
        Войти
      </button>
      {(state === 'failed' || state === 'unavailable') && (
        <p className="field-error" role="alert">
          {state === 'unavailable' ? UNAVAILABLE : TRY_LATER}
        </p>
      )}
    </>
  );
}
