-- Delivery/pickup special instructions, entered by the customer at
-- checkout (e.g. gate codes, collection times) -- free text, seller-facing
-- only, shown alongside the shipping address on order detail views.
alter table public.orders add column if not exists notes text;
