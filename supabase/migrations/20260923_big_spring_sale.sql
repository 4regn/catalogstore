-- BIG SPRING SALE: three 4regn collections, each a lower unit price PLUS a
-- cheaper "buy 2" bundle, through 2 October 2026 23:59 SAST
-- (2026-10-02T21:59:00Z):
--   OVERSIZED PREMIUM TEES        R350 -> R229, buy 2 for R399 (was R449)
--   BACK & FRONT PRINTED HOODIES  R479 -> R329, buy 2 for R599 (was R699)
--   STANDARD GRAPHIC HOODIES      R350 -> R299, buy 2 for R549 (was R599)
-- Same shape as the prior oversized-tees-only flash sales (see
-- 20260830_oversized_tees_flash_sale.sql / 20260910_..._r229.sql): a
-- one-time data update recorded as a migration, reverted automatically by
-- app/api/cron/end-oversized-tees-sale/route.ts (now generalized to all
-- three tiers here, not tees-only) once the cutoff passes. Matches BOTH
-- spellings of the printed-hoodies tag actually used across this codebase
-- (FourRegnStore.tsx's own getProductPromoBadge checks both) so this can't
-- silently miss real products over a naming inconsistency.

update public.products
set price = 229, old_price = 350
where seller_id = (select id from public.sellers where subdomain = '4regn')
  and exists (
    select 1 from unnest(string_to_array(products.category, ',')) as tag
    where trim(tag) = 'OVERSIZED PREMIUM TEES'
  );

update public.products
set price = 329, old_price = 479
where seller_id = (select id from public.sellers where subdomain = '4regn')
  and exists (
    select 1 from unnest(string_to_array(products.category, ',')) as tag
    where trim(tag) in ('BACK & FRONT PRINTED HOODIES', 'FRONT & BACK PRINTED HOODIES')
  );

update public.products
set price = 299, old_price = 350
where seller_id = (select id from public.sellers where subdomain = '4regn')
  and exists (
    select 1 from unnest(string_to_array(products.category, ',')) as tag
    where trim(tag) = 'STANDARD GRAPHIC HOODIES'
  );

-- Bundle math: "2 for R399"/"R599"/"R549" implemented the same way every
-- real 4regn BXGY rule is (see computeAutomaticBxgyDiscount's own
-- comment) -- buy 1, get 1 from the same collection at a flat amount off,
-- pooled so a unit is never double-counted:
--   tees:            2*229 - 399 = 59  off the 2nd unit
--   printed hoodies: 2*329 - 599 = 59  off the 2nd unit
--   standard hoodies:2*299 - 549 = 49  off the 2nd unit
insert into public.automatic_bxgy_discounts (
  seller_id, title, buy_quantity, buy_collection_names, get_quantity, get_collection_names,
  effect_type, effect_value, active, starts_at, ends_at
)
select id, 'BIG SPRING SALE -- Oversized Premium Tees, Buy 2 for R399', 1, array['OVERSIZED PREMIUM TEES'], 1, array['OVERSIZED PREMIUM TEES'],
  'fixed_amount', 59, true, now(), '2026-10-02T21:59:00Z'
from public.sellers where subdomain = '4regn';

insert into public.automatic_bxgy_discounts (
  seller_id, title, buy_quantity, buy_collection_names, get_quantity, get_collection_names,
  effect_type, effect_value, active, starts_at, ends_at
)
select id, 'BIG SPRING SALE -- Back & Front Printed Hoodies, Buy 2 for R599', 1,
  array['BACK & FRONT PRINTED HOODIES', 'FRONT & BACK PRINTED HOODIES'], 1,
  array['BACK & FRONT PRINTED HOODIES', 'FRONT & BACK PRINTED HOODIES'],
  'fixed_amount', 59, true, now(), '2026-10-02T21:59:00Z'
from public.sellers where subdomain = '4regn';

insert into public.automatic_bxgy_discounts (
  seller_id, title, buy_quantity, buy_collection_names, get_quantity, get_collection_names,
  effect_type, effect_value, active, starts_at, ends_at
)
select id, 'BIG SPRING SALE -- Standard Graphic Hoodies, Buy 2 for R549', 1, array['STANDARD GRAPHIC HOODIES'], 1, array['STANDARD GRAPHIC HOODIES'],
  'fixed_amount', 49, true, now(), '2026-10-02T21:59:00Z'
from public.sellers where subdomain = '4regn';
