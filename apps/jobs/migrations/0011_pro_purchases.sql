-- Chronika Pro, phase 4: credit packs bought through Stripe.
--
-- A purchase is written before the seller is sent to Stripe and settled by the webhook. The ledger
-- entry it produces carries the purchase id as its ref, so a webhook delivered twice books once.

CREATE TABLE pro_purchases (
  id                    TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL REFERENCES pro_accounts(id),
  pack                  TEXT NOT NULL CHECK (pack IN ('p10','p30','p100')),
  credits               INTEGER NOT NULL CHECK (credits > 0),
  amount_minor          INTEGER NOT NULL CHECK (amount_minor > 0),
  currency              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','failed','refunded')),
  stripe_session_id     TEXT,
  stripe_payment_intent TEXT,
  created_at            TEXT NOT NULL,
  paid_at               TEXT,
  refunded_at           TEXT
);
CREATE INDEX pro_purchases_account ON pro_purchases (account_id, created_at);
CREATE UNIQUE INDEX pro_purchases_session ON pro_purchases (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX pro_purchases_intent ON pro_purchases (stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL;
