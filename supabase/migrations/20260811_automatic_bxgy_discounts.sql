-- Automatic "Buy X Get Y" discounts -- a genuinely different pricing
-- mechanic from discount_codes' percentage/fixed-off-a-total model (see
-- that table's own applies_to branches in
-- app/api/checkout/place-order/route.ts): this applies automatically the
-- moment enough qualifying items are in the cart, no code needed, mirrors
-- exactly how these worked as DiscountAutomaticBxgy on Shopify (confirmed
-- via scripts/inspect-4regn-bxgy-discounts.ts against the real store).
--
-- buy_collection_names / get_collection_names match products.category the
-- same comma-list way collection matching already works everywhere else on
-- this platform (see FourRegnStore.tsx's own category-token splitting) --
-- usually the same collection on both sides (buy 1 hoodie, get another
-- hoodie discounted), but modeled as two separate arrays since Shopify's
-- own schema allows them to differ.
create table if not exists public.automatic_bxgy_discounts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  title text not null,
  buy_quantity integer not null check (buy_quantity > 0),
  buy_collection_names text[] not null default '{}',
  get_quantity integer not null check (get_quantity > 0),
  get_collection_names text[] not null default '{}',
  -- 'fixed_amount' -- a flat amount off EACH get_quantity item (e.g. R101
  --   off the 2nd hoodie in every qualifying pair).
  -- 'percentage' -- a percentage off EACH get_quantity item (100 = fully
  --   free, matching "buy 2 get a 3rd free").
  effect_type text not null check (effect_type in ('fixed_amount', 'percentage')),
  effect_value numeric(12,2) not null check (effect_value >= 0),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  source text not null default 'shopify_import',
  external_id text,
  created_at timestamptz not null default now()
);

create index if not exists automatic_bxgy_discounts_seller_idx
  on public.automatic_bxgy_discounts (seller_id) where active;

create unique index if not exists automatic_bxgy_discounts_external_id_uidx
  on public.automatic_bxgy_discounts (seller_id, external_id)
  where external_id is not null;

-- Recorded on the order for the same audit reasons discount_codes'
-- discount_amount/discount_code columns already are (20260804_orders_discount_columns.sql)
-- -- automatic_discount_title lets the seller see WHICH promo applied
-- without joining back to a table row that could later be edited/deleted.
alter table public.orders
  add column if not exists automatic_discount_amount numeric(12,2) not null default 0,
  add column if not exists automatic_discount_title text;

-- Same app-layer-only access control as every other seller-owned table in
-- this schema (products, orders, discount_codes, etc.) -- see
-- 20260716_velour_disable_rls.sql's own comment. Supabase auto-enables RLS
-- on new tables in this project, which would otherwise block this table
-- with no policies defined.
alter table public.automatic_bxgy_discounts disable row level security;
