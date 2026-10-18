'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useText } from './Lang';
import { afterSignIn, confirmOutcome, postJson } from './post';

/** A link that no longer signs anyone in, and the way to a new one. */
export function LinkExpired() {
  const t = useText();
  return (
    <div className="card notice bad" role="alert">
      <strong>{t.confirm.expired}</strong>
      <span className="muted">
        <Link href="/login">{t.confirm.newLink}</Link>
      </span>
    </div>
  );
}

/** The one button that spends the emailed token. Opening the link alone spends nothing. */
export function ConfirmLogin({ token }: { token: string }) {
  const t = useText();
  const [state, setState] = useState<'idle' | 'sending' | 'expired' | 'unavailable' | 'failed'>(
    'idle',
  );

  async function enter() {
    setState('sending');
    const { status, invite } = await postJson('/api/pro/session', { token });
    const outcome = confirmOutcome(status);
    if (outcome === 'signed-in') return window.location.assign(afterSignIn(invite));
    setState(outcome);
  }

  if (state === 'expired') return <LinkExpired />;

  return (
    <>
      <button className="btn" type="button" onClick={enter} disabled={state === 'sending'}>
        {t.common.signIn}
      </button>
      {(state === 'failed' || state === 'unavailable') && (
        <p className="field-error" role="alert">
          {state === 'unavailable' ? t.common.unavailable : t.common.tryLater}
        </p>
      )}
    </>
  );
}
