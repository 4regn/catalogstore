-- products had no updated_at column at all -- app/sitemap.ts's lastModified
-- field (Google's freshness signal for when to recrawl a page) was reading
-- created_at, which never changes no matter how many times a product's
-- price/description/name is edited after it's first added. A product
-- edited today to add a brand-new design/album reference looked, from
-- Google's point of view, identical to one untouched since it was first
-- imported -- no signal at all to prioritize recrawling it over an older,
-- unrelated page. This is that column, plus a trigger that keeps it
-- current automatically (same pattern as touch_production_updated_at in
-- 20260821_4regn_production_batches.sql) so no application code needs to
-- remember to set it on every edit path.

alter table public.products
  add column if not exists updated_at timestamptz not null default now();

-- Backfilled to created_at, not now() -- a product nobody has touched
-- since it was added genuinely hasn't changed, and claiming otherwise
-- would tell Google every single product changed today, which is both
-- inaccurate and wastes crawl budget on pages that are actually unchanged.
update public.products set updated_at = created_at where updated_at is distinct from created_at;

create or replace function public.touch_products_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_products_updated_at();

create index if not exists products_seller_updated_idx on public.products(seller_id, updated_at desc);
