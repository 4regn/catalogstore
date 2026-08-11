-- The partial unique index from 20260811_automatic_bxgy_discounts.sql
-- (`where external_id is not null`) isn't usable as an ON CONFLICT target
-- by Supabase's plain upsert(..., { onConflict: "seller_id,external_id" })
-- -- Postgres only matches ON CONFLICT (col, col) against a full
-- constraint/index with no WHERE clause, confirmed by the real
-- "no unique or exclusion constraint matching the ON CONFLICT
-- specification" error scripts/import-4regn-bxgy-discounts.ts hit.
--
-- The partial-ness was never actually needed: Postgres already treats
-- NULL <> NULL in a plain unique constraint (multiple manually-created
-- rows with no external_id can coexist without conflicting), so a real
-- constraint works exactly the same as the partial index did, just also
-- usable for ON CONFLICT.
drop index if exists public.automatic_bxgy_discounts_external_id_uidx;

alter table public.automatic_bxgy_discounts
  add constraint automatic_bxgy_discounts_seller_external_uidx
  unique (seller_id, external_id);
