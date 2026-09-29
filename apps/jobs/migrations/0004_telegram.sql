-- A chat that asked for an order's document in Telegram. The code is what the deep link carries
-- (Telegram allows 64 characters, a signed token is three times that); the chat is filled in when
-- the person opens the bot, and delivered_at when the document has been sent.
CREATE TABLE telegram_links (
  code         TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  job_id       TEXT NOT NULL,
  locale       TEXT NOT NULL,
  chat_id      INTEGER,
  created_at   TEXT NOT NULL,
  delivered_at TEXT
);
CREATE INDEX telegram_links_order ON telegram_links (order_id);
CREATE INDEX telegram_links_chat ON telegram_links (chat_id);
