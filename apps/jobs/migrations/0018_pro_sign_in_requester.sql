-- Chronika Pro: who asked for each sign-in or sign-up link — never the address itself, but the
-- first 32 hex characters of an HMAC (keyed with the session secret) of the requester's block: an
-- IPv4 address, or an IPv6 address's /64; 'unknown' when the pro site passed no usable address.
-- An address is sent at most five links an hour at one requester's request and twenty in all,
-- whoever asked. Tokens from before have none and count only towards the twenty; all are swept a
-- day after they expire. Additive only.
ALTER TABLE pro_login_tokens ADD COLUMN requester TEXT;
