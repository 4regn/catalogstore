-- orders.discount_code / orders.discount_amount are written by
-- /api/unik/checkout/create and /api/setla/checkout/create (see
-- lib/unik-cart-resolve.ts's discount-code handling) but were never
-- actually added to the table by any prior migration -- discount_code_id
-- attribution on discount_codes/unik_partners predates this, but the order
-- itself never got a matching column. Confirmed missing live via a real
-- checkout failure: "Could not find the 'discount_amount' column of
-- 'orders' in the schema cache".
--
-- Run manually in Supabase SQL editor (repo convention).
alter table public.orders
  add column if not exists discount_code text,
  add column if not exists discount_amount numeric(12,2) not null default 0;
