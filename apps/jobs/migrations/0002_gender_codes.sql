-- The chart pipeline speaks the document's gender codes (f/m/n); the first migration wrote the
-- web form's words. SQLite cannot alter a CHECK in place, so the table is rebuilt — it holds no
-- rows yet, which is the only reason a plain drop is honest here.
DROP TABLE charts;

CREATE TABLE charts (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  person_no        INTEGER NOT NULL DEFAULT 1 CHECK (person_no IN (1, 2)),
  birth_ciphertext BLOB NOT NULL,
  birth_nonce      BLOB NOT NULL,
  key_version      INTEGER NOT NULL DEFAULT 1,
  unknown_time     INTEGER NOT NULL DEFAULT 0,
  gender           TEXT NOT NULL DEFAULT 'n' CHECK (gender IN ('f', 'm', 'n')),
  display_name     TEXT,
  place_label      TEXT,
  expires_at       TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX charts_order ON charts (order_id);
CREATE INDEX charts_expiry ON charts (expires_at);
