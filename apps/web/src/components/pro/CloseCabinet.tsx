'use client';

import { useEffect, useRef, useState } from 'react';
import { closeOutcome, sameAddress } from '@/lib/pro/account';
import { useText } from './Lang';
import { sendJson, signInAgain } from './post';

/** «Закрыть кабинет»: what goes, said plainly, then a confirm step on the page itself that asks
 * for the cabinet's address. The proxy clears the session cookies with its answer; sign-in then
 * says the cabinet is closed. */
export function CloseCabinet({ email }: { email: string }) {
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useText();
  const field = useRef<HTMLInputElement>(null);
  // State lands on the next render; two taps in one frame both see `closing` false.
  const inFlight = useRef(false);

  // The question takes focus on the field it needs answered.
  useEffect(() => {
    if (asking) field.current?.focus();
  }, [asking]);

  async function close(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!sameAddress(typed, email)) {
      setError(t.close.mismatch);
      return;
    }
    inFlight.current = true;
    setClosing(true);
    setError(null);
    const { status } = await sendJson('/api/pro/x/me', 'DELETE', { confirm_email: typed.trim() });
    const outcome = closeOutcome(status);
    // The page is left; the buttons stay held until it is.
    if (outcome === 'closed') return window.location.assign('/login?closed=1');
    inFlight.current = false;
    setClosing(false);
    if (outcome === 'signed-out') return signInAgain();
    setError(outcome === 'mismatch' ? t.close.mismatch : t.common.tryLater);
  }

  function cancel() {
    setAsking(false);
    setTyped('');
    setError(null);
  }

  return (
    <section className="close-cabinet" aria-labelledby="close-cabinet-title">
      <h2 id="close-cabinet-title">{t.close.title}</h2>
      <p>{t.close.warning}</p>
      <ul>
        {t.close.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="muted">
        {t.close.refundBefore}
        <a href="mailto:help@chronika.me">help@chronika.me</a>
        {t.close.refundAfter}
      </p>
      {asking ? (
        <form
          className="card confirm"
          onSubmit={close}
          noValidate
          aria-labelledby="close-cabinet-question"
        >
          <p id="close-cabinet-question">{t.close.question}</p>
          <div className="field">
            <label htmlFor="close-cabinet-email">
              {t.close.confirmLabel}
              <span className="wrap">{email}</span>
            </label>
            <input
              ref={field}
              id="close-cabinet-email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              aria-invalid={error === t.close.mismatch ? true : undefined}
              aria-describedby={error ? 'close-cabinet-error' : undefined}
            />
            {error ? (
              <span id="close-cabinet-error" className="field-error" role="alert">
                {error}
              </span>
            ) : null}
          </div>
          <div className="row">
            <button type="submit" className="btn danger" disabled={closing}>
              {closing ? t.close.closing : t.close.submit}
            </button>
            <button type="button" className="btn ghost" onClick={cancel} disabled={closing}>
              {t.common.cancel}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn ghost danger start" onClick={() => setAsking(true)}>
          {t.close.title}
        </button>
      )}
    </section>
  );
}
