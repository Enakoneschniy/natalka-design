-- The free preview text, cached by the birth data it was written from.
--
-- Two people born in the same minute in the same place get the same three paragraphs, and a
-- visitor who reloads the page pays nothing the second time. The key is a hash: it is enough to
-- match a cache entry and tells anyone reading the table nothing about who asked.
CREATE TABLE previews (
  key         TEXT PRIMARY KEY,
  lang        TEXT NOT NULL,
  blocks      TEXT NOT NULL,   -- JSON: [{title, text}]
  cost_micros INTEGER NOT NULL DEFAULT 0,
  model       TEXT,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX previews_expiry ON previews (expires_at);
