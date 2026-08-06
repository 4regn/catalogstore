-- Display-only promo badges shown on product cards/PDP (e.g. "BUY 2 GET 1
-- FREE"), separate from discount_codes (which is checkout-critical:
-- redemption codes, used_count/max_uses tracking, validated at
-- app/api/checkout/place-order/route.ts, type hard-constrained to
-- 'percentage'|'fixed'). A dedicated table keeps this unambiguously
-- display-only, both manually-created ones and ones imported from a
-- seller's real Shopify automatic discounts (see
-- scripts/import-4regn-discounts.ts) -- neither ever touches checkout
-- pricing.

create table if not exists public.product_promo_badges (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  label text not null,
  scope text not null check (scope in ('product', 'collection')),
  product_id uuid references public.products(id) on delete cascade,
  collection_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'shopify_import')),
  external_id text,
  created_at timestamptz not null default now(),
  unique (seller_id, external_id)
);

create index if not exists product_promo_badges_seller_idx on public.product_promo_badges(seller_id);

-- Same as products/discount_codes and every other storefront-facing table
-- in this schema: access-controlled at the app layer (dashboard API routes
-- + migration scripts use the service-role key; the storefront reads
-- directly with the anon key), not via RLS -- disable it here to match
-- rather than introduce a new, inconsistent auth model for this one table.
alter table public.product_promo_badges disable row level security;
