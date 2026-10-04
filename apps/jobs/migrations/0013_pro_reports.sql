-- Chronika Pro, phase 5b: what a seller flags in a reading. Kept for the owner to read (admin, phase 6).

CREATE TABLE pro_reports (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES pro_accounts(id),
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  comment    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX pro_reports_account ON pro_reports (account_id, created_at);
