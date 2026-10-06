-- A horoscope subscription starts only once its address is confirmed, and its free month ends.
--
-- Additive only, safe while the previous worker is still running. The status CHECK stays as it is
-- (rebuilding the table would delete its horoscopes and Telegram bindings with it), and the new
-- states live beside it:
--   pending  confirmed_at IS NULL and trial_ends_at IS NULL. Stored as 'paused', so the due query
--            never picks it up; confirming sets both dates. (A subscription the previous worker
--            makes during the deploy has a trial date and no confirmation: it counts as confirmed.)
--   ended    ended_at is set: the free month is over. Stored as 'paused'.
ALTER TABLE subscriptions ADD COLUMN confirmed_at TEXT;
ALTER TABLE subscriptions ADD COLUMN ended_at TEXT;

-- The chart, encrypted like the birth data: positions, houses, and the name the horoscope is
-- written to. chart_json keeps the plain chart of rows from before, and an empty string in new
-- ones (it is NOT NULL); the nightly sweep encrypts the old rows and empties display_name.
ALTER TABLE subscriptions ADD COLUMN chart_ciphertext BLOB;
ALTER TABLE subscriptions ADD COLUMN chart_nonce BLOB;

-- Every subscription so far was live from the start: confirmed when it was made, its free month
-- counted from then.
UPDATE subscriptions SET confirmed_at = created_at WHERE confirmed_at IS NULL;
UPDATE subscriptions SET trial_ends_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+30 days')
WHERE trial_ends_at IS NULL;

-- Confirmation letters sent, by a keyed hash of the address rather than the address: at most three
-- a day per address. Rows older than two days are swept.
CREATE TABLE mail_log (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX mail_log_recent ON mail_log (kind, email_hash, created_at);
