-- SEO-friendly product URLs for 4regn specifically. Every seller's product
-- page lives at /p/{uuid} today; 4regn's real Shopify storefront (what
-- Google already has indexed) used /products/{handle}, so this column lets
-- 4regn's storefront match that exact format while every other seller keeps
-- /p/{uuid} unchanged (a null handle just means "no dedicated /products/
-- route for this product yet").
alter table public.products add column if not exists handle text;

-- Partial unique index, not a full unique constraint -- most sellers never
-- populate this column at all, and a plain nullable-safe unique index (not
-- deduping nulls) would still work, but restricting it to `where handle is
-- not null` keeps it smaller and makes the intent explicit: uniqueness only
-- matters once a seller actually has handles. Scoped per-seller (not
-- globally) since two different sellers could plausibly land on the same
-- Shopify handle. This is populated via a plain `UPDATE` in the backfill
-- script below, not an `upsert`/`ON CONFLICT`, so the partial-index-vs-
-- ON CONFLICT bug that bit this codebase earlier doesn't apply here.
create unique index if not exists products_seller_handle_idx on public.products(seller_id, handle) where handle is not null;
