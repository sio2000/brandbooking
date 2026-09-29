-- The language the customer booked in. Emails to the customer (confirmation,
-- reminders, changes) and the manage-booking page use it.
ALTER TABLE appointments ADD COLUMN locale text NOT NULL DEFAULT 'en';
