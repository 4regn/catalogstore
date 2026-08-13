-- Speeds the narrow catalog snapshot shared by 4regn collection and search
-- routes. The query always scopes to one seller + published status and then
-- returns rows in merchant-defined sort order.
create index if not exists products_storefront_catalog_idx
  on public.products (seller_id, status, sort_order);

-- Product pages already have a seller+handle index. These two small tables
-- are read alongside the catalog snapshot and filtered by seller/active.
create index if not exists discount_codes_storefront_active_idx
  on public.discount_codes (seller_id, active);

create index if not exists product_promo_badges_storefront_active_idx
  on public.product_promo_badges (seller_id, active);
