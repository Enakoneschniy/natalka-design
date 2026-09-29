-- The horoscope subscription. What it keeps is the chart — positions and houses, the input the
-- horoscope endpoint takes — and, for thirty days, the encrypted birth data behind it, so a wrong
-- birth time can still be corrected while people notice such things. The sweep nulls the birth
-- columns after birth_expires_at; the chart stays for as long as the subscription lives.
CREATE TABLE subscriptions (
  id                     TEXT PRIMARY KEY,
  email                  TEXT,
  locale                 TEXT NOT NULL,
  gender                 TEXT NOT NULL DEFAULT 'n' CHECK (gender IN ('f','m','n')),
  display_name           TEXT,
  cadence                TEXT NOT NULL CHECK (cadence IN ('week','month')),
  chart_json             TEXT NOT NULL,
  birth_ciphertext       BLOB,
  birth_nonce            BLOB,
  birth_expires_at       TEXT,
  status                 TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','paused','cancelled')),
  next_send_at           TEXT NOT NULL,
  send_hour_utc          INTEGER NOT NULL DEFAULT 6,
  trial_ends_at          TEXT,
  stripe_subscription_id TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX subscriptions_due ON subscriptions (status, next_send_at);
CREATE INDEX subscriptions_email ON subscriptions (email);

-- Every horoscope written, with what it cost and where it went.
CREATE TABLE horoscopes (
  id               TEXT PRIMARY KEY,
  subscription_id  TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  period           TEXT NOT NULL,
  start_date       TEXT NOT NULL,
  end_date         TEXT NOT NULL,
  title            TEXT NOT NULL,
  text             TEXT NOT NULL,
  cost_micros      INTEGER NOT NULL DEFAULT 0,
  channels         TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL
);
CREATE INDEX horoscopes_subscription ON horoscopes (subscription_id, created_at);

-- A chat bound to a subscription, by the same kind of code the document links use.
CREATE TABLE telegram_subscriptions (
  code             TEXT PRIMARY KEY,
  subscription_id  TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  chat_id          INTEGER,
  created_at       TEXT NOT NULL
);
CREATE INDEX telegram_subscriptions_sub ON telegram_subscriptions (subscription_id);
CREATE INDEX telegram_subscriptions_chat ON telegram_subscriptions (chat_id);
