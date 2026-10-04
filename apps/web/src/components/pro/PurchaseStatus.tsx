'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPoller } from '@/lib/pro/poll';
import {
  PURCHASE_POLL_MS,
  type Purchase,
  type PurchaseWatch,
  purchaseWatch,
  type PurchaseStatus as Status,
} from '@/lib/pro/purchases';
import { sendJson, signInAgain } from './post';

const TEXT: Record<PurchaseWatch, string> = {
  waiting: 'Оплата обрабатывается…',
  paid: 'Кредиты зачислены',
  failed: 'Оплата не прошла. Кредиты не списаны, попробуйте ещё раз.',
  timeout: 'Оплата ещё обрабатывается. Обновите страницу через минуту.',
};

/** Back from Stripe (`/credits?purchase=<id>`): asks every few seconds, for a minute at most,
 * whether the webhook has settled the purchase, then refreshes the page so the balance and the
 * history show it. `initial` is the status the page was rendered with; a settled one ends the
 * watch before it starts. */
export function PurchaseStatus({ id, initial }: { id: string; initial?: Status }) {
  const router = useRouter();
  const [watch, setWatch] = useState<PurchaseWatch>(() => purchaseWatch(initial, 0));

  useEffect(() => {
    if (purchaseWatch(initial, 0) !== 'waiting') return;
    const started = Date.now();
    const poller = createPoller<PurchaseWatch>({
      intervalMs: PURCHASE_POLL_MS,
      tick: async () => {
        const { status, data } = await sendJson<{ purchases?: Purchase[] }>(
          '/api/pro/x/purchases',
          'GET',
        );
        if (status === 401) {
          signInAgain();
          return 'failed';
        }
        if (status !== 200) {
          // A failed look still counts against the minute; past it, stop asking.
          if (purchaseWatch(undefined, Date.now() - started) !== 'timeout') {
            throw new Error(`purchases → ${status}`);
          }
          setWatch('timeout');
          return 'timeout';
        }
        const found = data?.purchases?.find((p) => p.id === id);
        const next = purchaseWatch(found?.status, Date.now() - started);
        setWatch(next);
        if (next === 'paid' || next === 'failed') router.refresh();
        return next;
      },
      shouldStop: (result) => result !== 'waiting',
    });
    poller.start();
    return () => poller.stop();
  }, [id, initial, router]);

  const tone = watch === 'paid' ? 'card notice' : watch === 'failed' ? 'card notice bad' : 'card';
  return (
    <div className={tone} role="status" aria-live="polite">
      {watch === 'waiting' ? (
        <span className="spin">{TEXT.waiting}</span>
      ) : watch === 'timeout' ? (
        <span className="muted">{TEXT.timeout}</span>
      ) : (
        <strong>{TEXT[watch]}</strong>
      )}
    </div>
  );
}
