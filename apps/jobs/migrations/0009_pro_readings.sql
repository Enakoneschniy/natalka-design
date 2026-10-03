-- Chronika Pro, phase 2: a seller's clients and the readings written for them.
--
-- A reading is an ordinary order with its job, charts and documents (the pipeline does not care
-- who asked) plus a pro_readings row: whose it is, which clients it is about, and how much
-- rewriting is left. A seller pays in credits, not money: such an order is status 'paid',
-- currency 'credit', amount_minor = credits spent.

ALTER TABLE orders ADD COLUMN pro_account_id TEXT REFERENCES pro_accounts(id);
CREATE INDEX orders_pro_account ON orders (pro_account_id) WHERE pro_account_id IS NOT NULL;

-- A seller's client. Everything personal (name, date, time, place, coordinates, zone, gender)
-- is in the ciphertext. Kept while the seller's account lives, until the seller deletes it.
CREATE TABLE pro_clients (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES pro_accounts(id),
  birth_ciphertext BLOB NOT NULL,
  birth_nonce      BLOB NOT NULL,
  -- When the seller confirmed they have this client's consent.
  consent_at       TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX pro_clients_account ON pro_clients (account_id, created_at);

CREATE TABLE pro_readings (
  order_id          TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  account_id        TEXT NOT NULL REFERENCES pro_accounts(id),
  job_id            TEXT NOT NULL,
  client_id         TEXT NOT NULL REFERENCES pro_clients(id),
  -- The second person of a synastry; NULL for every other product.
  partner_client_id TEXT REFERENCES pro_clients(id),
  -- Paid rewrites used. A section that failed to be written is filled without counting.
  regenerations     INTEGER NOT NULL DEFAULT 0,
  -- After this the reading is frozen: nothing more is rewritten.
  editable_until    TEXT NOT NULL,
  -- Set when nothing could be written and the credits went back.
  refunded_at       TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX pro_readings_account ON pro_readings (account_id, created_at);
CREATE INDEX pro_readings_client ON pro_readings (client_id);
CREATE INDEX pro_readings_partner ON pro_readings (partner_client_id) WHERE partner_client_id IS NOT NULL;
