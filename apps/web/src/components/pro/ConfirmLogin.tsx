'use client';

import Link from 'next/link';
import { useState } from 'react';
import { postJson, TRY_LATER } from './post';

/** The one button that spends the emailed token. Opening the link alone spends nothing. */
export function ConfirmLogin({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'expired' | 'failed'>('idle');

  async function enter() {
    setState('sending');
    const { status } = await postJson('/api/pro/session', { token });
    if (status === 200) return window.location.assign('/');
    setState(status === 400 ? 'expired' : 'failed');
  }

  if (state === 'expired') {
    return (
      <div className="card notice bad" role="alert">
        <strong>Ссылка устарела или уже использована</strong>
        <span className="muted">
          <Link href="/login">Запросите новую ссылку для входа</Link>
        </span>
      </div>
    );
  }

  return (
    <>
      <button className="btn" type="button" onClick={enter} disabled={state === 'sending'}>
        Войти
      </button>
      {state === 'failed' && (
        <p className="field-error" role="alert">
          {TRY_LATER}
        </p>
      )}
    </>
  );
}
