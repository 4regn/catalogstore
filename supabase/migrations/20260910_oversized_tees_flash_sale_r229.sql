-- Oversized Premium Tees Flash Sale (round 2): R229 (was R350), buy 2 for
-- R449, through 12 September 2026 23:59 SAST (2026-09-12T21:59:00Z). Same
-- shape as supabase/migrations/20260830_oversized_tees_flash_sale.sql's
-- first run of this campaign -- a one-time data update recorded as a
-- migration, reverted automatically by
-- app/api/cron/end-oversized-tees-sale/route.ts (SALE_PRICE/CUTOFF bumped
-- to match this run) once the new cutoff passes.

update public.products
set price = 229, old_price = 350
where seller_id = (select id from public.sellers where subdomain = '4regn')
  and exists (
    select 1 from unnest(string_to_array(products.category, ',')) as tag
    where trim(tag) = 'OVERSIZED PREMIUM TEES'
  );

-- "Buy 1 get 1 R9 off" -- combined with the R229 unit price above, two
-- tees total 2*229 - 9 = R449, matching "buy 2 for R449" exactly (same
-- pattern as the first run, just a different discount amount since the
-- unit price moved). A fresh row, not a reuse/update of the first run's
-- row -- that one already auto-expired via its own ends_at and needs no
-- cleanup.
insert into public.automatic_bxgy_discounts (
  seller_id, title, buy_quantity, buy_collection_names, get_quantity, get_collection_names,
  effect_type, effect_value, active, starts_at, ends_at
)
select id, 'Oversized Premium Tees Flash Sale (Sept) -- Buy 2 for R449', 1, array['OVERSIZED PREMIUM TEES'], 1, array['OVERSIZED PREMIUM TEES'],
  'fixed_amount', 9, true, now(), '2026-09-12T21:59:00Z'
from public.sellers where subdomain = '4regn';
