-- Chronika Pro: tries that are limited per hour, one row per try that counts.
--   kind 'invite'  an invite code that did not work; subject = the seller's account id. At most
--                  five an hour, then every try is refused until the hour has passed.
-- Ids and times only; the nightly sweep removes rows older than a day. A new table, additive only.
CREATE TABLE pro_attempts (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  subject    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX pro_attempts_recent ON pro_attempts (kind, subject, created_at);
