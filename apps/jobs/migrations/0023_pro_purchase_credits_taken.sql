-- Chronika Pro: what has taken a pack's credits back, if anything — 'dispute:<dispute id>' while a
-- dispute holds them, 'refund' once the payment was refunded — so that they are taken back once per
-- payment, whichever comes first. A dispute won, or an inquiry closed, gives back only what that
-- dispute took, and nothing once the payment has been refunded. NULL while the credits stand.
-- Additive only.
ALTER TABLE pro_purchases ADD COLUMN credits_taken TEXT;
