-- Chronika Pro: the sellers who resell our readings under their own brand, how they sign in,
-- the invite codes that bring them, and the credits they spend.
--
-- Credits are a ledger, never a balance column: every purchase, trial grant, spend and refund is
-- a row, and the balance is their sum. Nothing is updated in place, so the history explains every
-- number, and a spend can be made conditional on the sum in a single statement.

CREATE TABLE pro_accounts (
  id            TEXT PRIMARY KEY,
  -- Stored normalised (trimmed, lower case): one address, one account.
  email         TEXT NOT NULL UNIQUE,
  -- How readings address the seller's clients: «ты» or «вы».
  tone          TEXT NOT NULL DEFAULT 'vy' CHECK (tone IN ('ty','vy')),
  -- Sessions carry this number; raising it signs the account out everywhere.
  session_epoch INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

-- Magic links. Only the hash of a token is kept: a database dump cannot sign anyone in.
CREATE TABLE pro_login_tokens (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX pro_login_tokens_email ON pro_login_tokens (email, created_at);

CREATE TABLE pro_invite_codes (
  code       TEXT PRIMARY KEY CHECK (code = upper(code)),
  credits    INTEGER NOT NULL CHECK (credits > 0),
  max_uses   INTEGER NOT NULL CHECK (max_uses > 0),
  uses       INTEGER NOT NULL DEFAULT 0,
  -- Who the code was made for — the only record of where a seller came from.
  note       TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

-- One invite per account, ever: the primary key is the account.
CREATE TABLE pro_invite_redemptions (
  account_id TEXT PRIMARY KEY REFERENCES pro_accounts(id),
  code       TEXT NOT NULL REFERENCES pro_invite_codes(code),
  credits    INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE credit_ledger (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES pro_accounts(id),
  delta      INTEGER NOT NULL CHECK (delta <> 0),
  reason     TEXT NOT NULL CHECK (reason IN ('purchase','trial','report','refund','adjust')),
  -- What caused the entry: a Stripe session, a job, an invite. A cause is booked once.
  ref        TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX credit_ledger_account ON credit_ledger (account_id);
CREATE UNIQUE INDEX credit_ledger_once ON credit_ledger (reason, ref) WHERE ref IS NOT NULL;
