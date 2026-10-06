-- What can happen to an order after its payment, and when its payment page was last opened.
--
-- Additive only, safe while the previous worker is still running. The status CHECK on `orders`
-- stays as it is: changing it would mean rebuilding the table, and dropping a table in D1 deletes
-- every row that references it (charts, jobs, documents, readings). The states the status cannot
-- hold live beside it instead:
--   hold = 'amount_mismatch'  Stripe settled another amount than the order asked for. The status
--                             stays 'pending', nothing is written, the owner is alerted.
--   hold = 'disputed'         The payment is disputed. The document is withheld until the
--                             dispute is won, when the hold is cleared again.
ALTER TABLE orders ADD COLUMN hold TEXT CHECK (hold IN ('amount_mismatch', 'disputed'));

-- When the order's current Checkout Session was opened. An unpaid order is swept a week after
-- this (or after created_at, for orders that predate the column).
ALTER TABLE orders ADD COLUMN checkout_at TEXT;

-- Refunds and disputes find their order by the payment.
CREATE INDEX orders_payment_intent ON orders (stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL;

-- A refund or a dispute Stripe reported for a payment, kept so that a completion delivered after
-- it (Stripe does not promise the order of events) books nothing. Payment ids only; swept after a
-- month.
CREATE TABLE stripe_tombstones (
  payment_intent TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('refund', 'dispute')),
  -- The charge or dispute that caused it.
  ref            TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (payment_intent, kind)
);
CREATE INDEX stripe_tombstones_created ON stripe_tombstones (created_at);
