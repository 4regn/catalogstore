-- Supabase auto-enables RLS on new tables in this project, which blocked
-- services/bookings writes with no policies defined. Every other table in
-- this schema (products, orders, discount_codes, etc.) is access-controlled
-- at the app layer, not via RLS -- disable it here to match.
-- Run this in your Supabase SQL editor.

alter table services disable row level security;
alter table bookings disable row level security;
