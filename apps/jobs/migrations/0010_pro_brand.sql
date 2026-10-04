-- Chronika Pro, phase 3: the seller's brand, and the form of address each reading was ordered in.
--
-- A brand is the seller's own presentation, not personal data about their clients: it is stored
-- in the clear. Images live in R2 under brand/<account_id>/; the row keeps their keys.

CREATE TABLE pro_brands (
  account_id TEXT PRIMARY KEY REFERENCES pro_accounts(id),
  name       TEXT NOT NULL,
  -- JSON array of up to four lines: a handle, a phone, a site.
  contacts   TEXT NOT NULL DEFAULT '[]',
  accent     TEXT NOT NULL DEFAULT '#E7B75C',
  intro      TEXT NOT NULL DEFAULT '',
  outro      TEXT NOT NULL DEFAULT '',
  signature  TEXT NOT NULL DEFAULT '',
  logo_key   TEXT,
  photo_key  TEXT,
  updated_at TEXT NOT NULL
);

-- «вы» or «ты», taken from the account when the reading is ordered, so a later change of mind
-- does not rewrite half a reading in the other form.
ALTER TABLE pro_readings ADD COLUMN address TEXT NOT NULL DEFAULT 'vy' CHECK (address IN ('vy','ty'));
