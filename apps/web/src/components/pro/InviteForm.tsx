'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { inviteOutcome } from '@/lib/pro/purchases';
import { sendJson, signInAgain } from './post';

const CODE_MAX = 64;

/** «Есть инвайт-код?»: one code per seller. Shown while `redeemed` is false; once a code is
 * taken it keeps showing what it added, after the refresh that updates the balance has marked
 * the seller as redeemed. */
export function InviteForm({ redeemed }: { redeemed: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const inFlight = useRef(false);

  if (redeemed && !result?.ok) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setResult({ ok: false, text: 'Введите код' });
      return;
    }
    inFlight.current = true;
    setSending(true);
    setResult(null);
    const { status, data } = await sendJson<{ credits?: number }>('/api/pro/x/invite', 'POST', {
      code: trimmed,
    });
    inFlight.current = false;
    setSending(false);
    if (status === 401) return signInAgain();
    const outcome = inviteOutcome(status, data);
    setResult(outcome);
    // The balance in the header and on this page is the server's.
    if (outcome.ok) router.refresh();
  }

  if (result?.ok) {
    return (
      <div className="card notice" role="status">
        <strong>{result.text}</strong>
        <span className="muted">Инвайт-код активирован.</span>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h3>
        <label htmlFor="invite-code">Есть инвайт-код?</label>
      </h3>
      <div className="row">
        <input
          id="invite-code"
          className="input mono grow"
          value={code}
          maxLength={CODE_MAX}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={result ? true : undefined}
          aria-describedby={result ? 'invite-error' : undefined}
          onChange={(event) => setCode(event.target.value)}
        />
        <button type="submit" className="btn small" disabled={sending}>
          {sending ? 'Проверяем…' : 'Активировать'}
        </button>
      </div>
      {result ? (
        <p id="invite-error" className="field-error" role="alert">
          {result.text}
        </p>
      ) : null}
    </form>
  );
}
