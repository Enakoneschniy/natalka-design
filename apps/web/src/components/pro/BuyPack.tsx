'use client';

import { useRef, useState } from 'react';
import { creditsLabel } from '@/lib/pro/credits';
import { buyError, checkoutTarget, money, PACKS, type PackId } from '@/lib/pro/purchases';
import { sendJson, signInAgain, TRY_LATER } from './post';

/** The three packs. «Купить» opens a purchase and goes to its checkout page; every button holds
 * still while one purchase is on its way, so a double tap opens one checkout. */
export function BuyPack() {
  const [buying, setBuying] = useState<PackId | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // State lands on the next render; two taps in one frame both see `buying` null.
  const inFlight = useRef(false);

  async function buy(pack: PackId) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBuying(pack);
    setProblem(null);
    const { status, data } = await sendJson<{ id?: string; checkout_url?: string }>(
      '/api/pro/x/purchases',
      'POST',
      { pack },
    );
    const target = status === 201 ? checkoutTarget(data?.checkout_url) : null;
    if (target) {
      // The page is left; the buttons stay held until it is.
      window.location.assign(target);
      return;
    }
    inFlight.current = false;
    setBuying(null);
    if (status === 401) return signInAgain();
    setProblem(status === 201 ? TRY_LATER : buyError(status));
  }

  return (
    <div className="packs">
      {PACKS.map((p) => (
        <div key={p.id} className={`pack${p.best ? ' best' : ''}`}>
          <b>{creditsLabel(p.credits)}</b>
          <span className="price num">{money(p.amount_minor, 'EUR')}</span>
          <span className="per">
            {p.per}
            {p.best ? ' · выгоднее' : ''}
          </span>
          <button
            type="button"
            className="btn small"
            disabled={buying !== null}
            aria-busy={buying === p.id}
            onClick={() => void buy(p.id)}
          >
            {buying === p.id ? 'Переходим…' : 'Купить'}
          </button>
        </div>
      ))}
      {problem ? (
        <p className="field-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
