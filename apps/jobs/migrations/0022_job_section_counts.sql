-- How many sections a job's plan holds and how many of them are written, kept in the clear beside
-- the encrypted payload, so that a seller's list of readings says what is missing without
-- decrypting every payload. Written with the payload from now on; NULL in rows from before until
-- the payload is next written, the nightly sweep encrypts a plain one, or the reading is opened.
-- Additive only.
ALTER TABLE jobs ADD COLUMN sections_planned INTEGER;
ALTER TABLE jobs ADD COLUMN sections_written INTEGER;
