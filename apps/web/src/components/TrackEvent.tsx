'use client';

import { useEffect, useRef } from 'react';

/** One step of the funnel, reported to whichever tags are loaded.
 *
 * It fires once per mount and does nothing at all when no tag is present, which is the normal
 * state before consent. The names are each platform's own: the same step is called three things.
 */
export type Step = 'view' | 'checkout' | 'purchase';

const NAMES: Record<Step, { meta: string; tiktok: string; google: string }> = {
  view: { meta: 'ViewContent', tiktok: 'ViewContent', google: 'view_item' },
  checkout: { meta: 'InitiateCheckout', tiktok: 'InitiateCheckout', google: 'begin_checkout' },
  purchase: { meta: 'Purchase', tiktok: 'CompletePayment', google: 'purchase' },
};

interface Window2 extends Window {
  fbq?: (...args: unknown[]) => void;
  ttq?: { track: (name: string, data?: unknown, options?: unknown) => void };
  gtag?: (...args: unknown[]) => void;
}

export function TrackEvent({
  step,
  value,
  currency,
  /** The order, so the same sale reported from the browser and from the server is one sale. */
  eventId,
}: {
  step: Step;
  value?: number | null;
  currency?: string | null;
  eventId?: string | null;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const w = window as Window2;
    const name = NAMES[step];
    const money = value != null && currency ? { value: value / 100, currency } : {};

    w.fbq?.('track', name.meta, money, eventId ? { eventID: eventId } : undefined);
    w.ttq?.track(name.tiktok, { ...money, event_id: eventId ?? undefined });
    w.gtag?.('event', name.google, {
      ...(value != null && currency ? { value: value / 100, currency } : {}),
      ...(eventId ? { transaction_id: eventId } : {}),
    });
  }, [step, value, currency, eventId]);

  return null;
}
