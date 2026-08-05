-- 20260813 created a PARTIAL unique index (`where external_id is not null`)
-- for the customers upsert-on-external_id path. That was wrong: Postgres's
-- ON CONFLICT (col1, col2) inference only matches a partial index if the
-- conflict clause repeats the exact same WHERE predicate, which a plain
-- column-list ON CONFLICT target -- all Supabase's .upsert() JS API can
-- express -- never does. Confirmed against the real migration run: every
-- upsert attempt failed with "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification". Same failure class as the
-- document-confirm route's partial-index bug fixed earlier.
--
-- Fix: a plain (non-partial) unique index instead. This is NOT weaker --
-- Postgres never treats two NULLs as equal for uniqueness purposes, so rows
-- with a null external_id still never collide with each other or with
-- anything else; only genuinely-matching non-null (seller_id, external_id)
-- pairs conflict, identical in practice to the partial version, just
-- actually usable as an ON CONFLICT target.
drop index if exists public.customers_seller_external_unique_idx;
create unique index if not exists customers_seller_external_unique_idx
  on public.customers (seller_id, external_id);

-- orders_seller_external_idx (from 20260812_migration_import_support.sql)
-- has the exact same partial-index bug and is used as an ON CONFLICT
-- target by migrate-4regn-orders.ts -- fixing it now too, before the
-- orders import hits the identical failure.
drop index if exists public.orders_seller_external_idx;
create unique index if not exists orders_seller_external_idx
  on public.orders (seller_id, external_id);
