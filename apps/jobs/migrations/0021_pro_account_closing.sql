-- Chronika Pro: a seller can close their cabinet. Closing deletes the clients, their readings and
-- files, the brand and its pictures, and the sign-in links; the account row stays only because the
-- ledger and the purchases point at it, with its address replaced by closed-<id>@invalid, its name
-- removed and closed_at set. A closed account is never signed in to again; the same address can
-- register anew. Additive only.
ALTER TABLE pro_accounts ADD COLUMN closed_at TEXT;
