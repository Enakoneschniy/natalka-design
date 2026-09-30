-- Two things a sale has to remember about itself, and one it cannot be asked later.
--
-- `consent` is the visitor's answer to the cookie question at the moment they bought. The answer
-- lives in a browser cookie; the payment webhook arrives minutes later with no browser attached.
-- Without keeping it here, a conversion can never be reported to an advertising platform from
-- the server, and it cannot be reconstructed afterwards.
--
-- `source` is where they came from. Both are written when the order is created.
ALTER TABLE orders ADD COLUMN consent TEXT;
ALTER TABLE orders ADD COLUMN source TEXT;

-- The counters gain a source too. It has to be part of the key: without it every campaign would
-- collapse into the same row. SQLite cannot alter a primary key, so the table is rebuilt and the
-- rows so far are carried over with an empty source.
CREATE TABLE stats_new (
  day          TEXT NOT NULL,
  event        TEXT NOT NULL,
  variant      TEXT NOT NULL DEFAULT '',
  angle        TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT '',
  country      TEXT NOT NULL DEFAULT '',
  currency     TEXT NOT NULL DEFAULT '',
  count        INTEGER NOT NULL DEFAULT 0,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, variant, angle, source, country, currency)
);
INSERT INTO stats_new (day, event, variant, angle, source, country, currency, count, amount_minor)
  SELECT day, event, variant, angle, '', country, currency, count, amount_minor FROM stats;
DROP TABLE stats;
ALTER TABLE stats_new RENAME TO stats;
CREATE INDEX stats_day ON stats (day);
