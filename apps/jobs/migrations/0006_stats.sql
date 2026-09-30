-- What the site is doing, counted by us.
--
-- Aggregates only: a day, an event, and the few things a decision depends on — which price the
-- visitor was shown, which headline brought them, which country they are in. No identifier, no
-- address, nothing that belongs to a person, so there is nothing here to ask consent for and
-- nothing to leak. One row per combination per day, bumped in place.
CREATE TABLE stats (
  day          TEXT NOT NULL,           -- YYYY-MM-DD, UTC
  event        TEXT NOT NULL,           -- landing | start | preview | paywall | checkout | paid
  variant      TEXT NOT NULL DEFAULT '',-- the price experiment: a | b | ''
  angle        TEXT NOT NULL DEFAULT '',-- which headline: dates | home | love | ''
  country      TEXT NOT NULL DEFAULT '',
  currency     TEXT NOT NULL DEFAULT '',
  count        INTEGER NOT NULL DEFAULT 0,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, variant, angle, country, currency)
);
CREATE INDEX stats_day ON stats (day);

-- Which side of the price experiment this order came from. Without it the experiment can be
-- watched but not settled: the money is in `orders`, and the variant was only in a cookie.
ALTER TABLE orders ADD COLUMN variant TEXT;
