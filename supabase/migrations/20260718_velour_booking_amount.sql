-- Snapshot the service price on the booking at creation time, so a later
-- price change doesn't retroactively change what a deposit/EFT amount was
-- supposed to be for an existing booking.
-- Run this in your Supabase SQL editor.

alter table bookings add column if not exists amount numeric;
