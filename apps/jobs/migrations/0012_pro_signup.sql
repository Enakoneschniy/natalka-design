-- Chronika Pro, phase 5a: a seller registers first and confirms the address; only then is there an
-- account to sign in to. A sign-in link is never sent to an address without one.

ALTER TABLE pro_login_tokens ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login' CHECK (purpose IN ('login','signup'));
-- What the seller typed at sign-up, kept with the token until the address is confirmed.
ALTER TABLE pro_login_tokens ADD COLUMN signup_name TEXT;
ALTER TABLE pro_login_tokens ADD COLUMN signup_invite TEXT;

ALTER TABLE pro_accounts ADD COLUMN name TEXT;
-- When the seller accepted the offer, at sign-up. NULL for accounts created before sign-up existed.
ALTER TABLE pro_accounts ADD COLUMN terms_accepted_at TEXT;
