'use client';

import { useEffect, useRef, useState } from 'react';
import { closeOutcome, sameAddress } from '@/lib/pro/account';
import { sendJson, signInAgain, TRY_LATER } from './post';

const MISMATCH = 'Адрес не совпадает с почтой кабинета.';

/** «Закрыть кабинет»: what goes, said plainly, then a confirm step on the page itself that asks
 * for the cabinet's address. The proxy clears the session cookies with its answer; sign-in then
 * says the cabinet is closed. */
export function CloseCabinet({ email }: { email: string }) {
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(MISMATCH);
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
    setError(outcome === 'mismatch' ? MISMATCH : TRY_LATER);
  }

  function cancel() {
    setAsking(false);
    setTyped('');
    setError(null);
  }

  return (
    <section className="close-cabinet" aria-labelledby="close-cabinet-title">
      <h2 id="close-cabinet-title">Закрыть кабинет</h2>
      <p>Это нельзя отменить. Вместе с кабинетом удалятся:</p>
      <ul>
        <li>клиенты и их данные рождения;</li>
        <li>все разборы, карты и PDF;</li>
        <li>ваш бренд: логотип, фото и тексты.</li>
      </ul>
      <p className="muted">
        Неиспользованные кредиты сгорят, записи о покупках останутся: их требует бухгалтерия. Если
        хотите вернуть деньги за пакет, из которого не потрачено ни одного кредита, напишите на{' '}
        <a href="mailto:help@chronika.me">help@chronika.me</a> до закрытия. На эту почту можно будет
        зарегистрироваться снова: кабинет откроется пустым.
      </p>
      {asking ? (
        <form
          className="card confirm"
          onSubmit={close}
          noValidate
          aria-labelledby="close-cabinet-question"
        >
          <p id="close-cabinet-question">Закрыть кабинет и удалить все данные?</p>
          <div className="field">
            <label htmlFor="close-cabinet-email">
              Чтобы подтвердить, введите почту кабинета: <span className="wrap">{email}</span>
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
              aria-invalid={error === MISMATCH ? true : undefined}
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
              {closing ? 'Закрываем…' : 'Закрыть навсегда'}
            </button>
            <button type="button" className="btn ghost" onClick={cancel} disabled={closing}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn ghost danger start" onClick={() => setAsking(true)}>
          Закрыть кабинет
        </button>
      )}
    </section>
  );
}
