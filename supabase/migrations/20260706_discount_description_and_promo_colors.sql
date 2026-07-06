-- Adds a seller-facing description field to discount codes (shown in the
-- storefront promo banner alongside the code) so "Welcome10" can carry a
-- line like "New customers get 10% off their first order".
-- Run this in your Supabase SQL editor.

alter table discount_codes add column if not exists description text;
