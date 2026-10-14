-- FS-30: where a session came from. Desktop runs keep the default; runs imported from DeckChek Mobile
-- (a phone) are stored with origin = 'phone' and the phone's description in source_device.
ALTER TABLE session ADD COLUMN origin TEXT NOT NULL DEFAULT 'desktop';
ALTER TABLE session ADD COLUMN source_device TEXT;
