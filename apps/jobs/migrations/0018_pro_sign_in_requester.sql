-- Chronika Pro: who asked for each sign-in or sign-up link. The visitor's address as the pro site
-- saw it, hashed with the session secret and cut to 16 hex characters — never the address itself.
-- An address is sent at most five links an hour at one requester's request and twenty in all.
-- Tokens from before have none and count only towards the twenty; all are swept a day after they
-- expire. Additive only.
ALTER TABLE pro_login_tokens ADD COLUMN requester TEXT;
