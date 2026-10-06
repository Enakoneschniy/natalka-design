/** How the waiting page reads an order: open, waiting for its money, or closed. Plain functions,
 * so the rules are tested without a browser. */

export interface OrderView {
  paid: boolean;
  order_status?: string;
  step: string;
  status: string;
}

/** The message a closed order gets: the money went back, the bank is looking at a dispute, or the
 * payment did not go through. Null while the order is open. */
export function closedOrder(view: OrderView): 'refunded' | 'disputed' | 'declined' | null {
  if (view.order_status === 'refunded' || view.order_status === 'disputed') {
    return view.order_status;
  }
  return view.order_status === 'failed' ? 'declined' : null;
}

/** How long an unpaid order waits before the page offers the payment page again. A buyer back
 * from Stripe usually sees the payment settle within seconds; offering to pay at once would invite
 * a second payment for the same order. */
export const PAYMENT_GRACE_MS = 15_000;

/** The payment page is offered again for an order that has stayed unpaid through the grace
 * period on this page. */
export function offersPayment(view: OrderView, pendingSince: number | null, now: number): boolean {
  if (view.paid || view.order_status !== 'pending' || pendingSince === null) return false;
  return now - pendingSince >= PAYMENT_GRACE_MS;
}

/** Nothing more will change without the visitor: the document is ready, the run failed, or the
 * order is closed. The page stops asking. */
export const settled = (view: OrderView): boolean =>
  view.step === 'done' || view.status === 'failed' || closedOrder(view) !== null;
