-- Chronika Pro: a reading is held while one of its sections is written at the seller's request (a
-- rewrite, or a section that was never written), so that two requests never call the model for
-- one reading at once: the second is told the reading is busy. busy_until is when a hold that was
-- never let go runs out on its own; NULL while the reading is free. Additive only.
ALTER TABLE pro_readings ADD COLUMN busy_until TEXT;
