-- Rollback for 0003_appointment_locale.
ALTER TABLE appointments DROP COLUMN IF EXISTS locale;
