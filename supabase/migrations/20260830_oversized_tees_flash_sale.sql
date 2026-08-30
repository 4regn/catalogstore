-- Oversized Premium Tees Flash Sale: R249 (was R350), buy 2 for R449,
-- through 31 August 2026 23:59 SAST (2026-08-31T21:59:00Z). The price
-- change itself is a one-time data update, not a schema change, but it's
-- recorded here as a migration so there's a single place to see what this
-- sale actually did. Reverted automatically by
-- app/api/cron/end-oversized-tees-sale/route.ts once the cutoff passes --
-- this file only turns the sale ON.

-- category is a comma-separated free-text list (e.g. "OVERSIZED PREMIUM
-- TEES,MENS TOPS") -- unnest + trim mirrors the app's own comma-split
-- matching (pInCat in FourRegnStore.tsx) rather than a plain LIKE, which
-- could false-match a different collection whose name happens to contain
-- this one as a substring.
update public.products
set price = 249, old_price = 350
where seller_id = (select id from public.sellers where subdomain = '4regn')
  and exists (
    select 1 from unnest(string_to_array(products.category, ',')) as tag
    where trim(tag) = 'OVERSIZED PREMIUM TEES'
  );

-- "Buy 1 get 1 R49 off" from the same collection -- combined with the R249
-- unit price above, two tees total 2*249 - 49 = R449, matching "buy 2 for
-- R449" exactly. Mirrors the only pattern real 4regn BXGY rules actually
-- use (see computeAutomaticBxgyDiscount's own comment): identical buy/get
-- collection, same effect applied to whichever unit(s) fall in the "get"
-- slice. Auto-expires via ends_at -- no cron needed to turn this part off.
insert into public.automatic_bxgy_discounts (
  seller_id, title, buy_quantity, buy_collection_names, get_quantity, get_collection_names,
  effect_type, effect_value, active, starts_at, ends_at
)
select id, 'Oversized Premium Tees Flash Sale -- Buy 2 for R449', 1, array['OVERSIZED PREMIUM TEES'], 1, array['OVERSIZED PREMIUM TEES'],
  'fixed_amount', 49, true, now(), '2026-08-31T21:59:00Z'
from public.sellers where subdomain = '4regn';
