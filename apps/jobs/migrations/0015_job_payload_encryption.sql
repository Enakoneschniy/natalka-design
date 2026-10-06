-- A job's payload — the calculated chart and every text written from it — is encrypted at rest
-- like the birth data (AES-GCM under DATA_KEY), its ciphertext and nonce in two new columns. Rows
-- written before stay readable as plain JSON; the nightly sweep encrypts them a few hundred at a
-- time and empties the plain column. Additive only.
ALTER TABLE jobs ADD COLUMN payload_ct BLOB;
ALTER TABLE jobs ADD COLUMN payload_nonce BLOB;

-- A chart's name and place were kept in the clear beside its ciphertext. Nothing reads them: the
-- file name and the cover take both from the decrypted birth data. New charts no longer write
-- them, and the sweep clears any written by a worker deployed before this one.
UPDATE charts SET display_name = NULL, place_label = NULL
WHERE display_name IS NOT NULL OR place_label IS NOT NULL;
