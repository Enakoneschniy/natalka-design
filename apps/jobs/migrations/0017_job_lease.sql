-- A queue delivery holds its job while it works on it, so two deliveries of the same job (the
-- queue may deliver twice) never write it at once. lease_by names the message holding it: the
-- queue's retry of that same message takes the job over at once, any other waits for the lease to
-- end. Additive only.
ALTER TABLE jobs ADD COLUMN lease_until TEXT;
ALTER TABLE jobs ADD COLUMN lease_by TEXT;
