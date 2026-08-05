-- Legacy-URL redirect map. When a seller migrates their catalog onto this
-- platform from another e-commerce platform, every product's old URL
-- (e.g. /products/blue-hoodie on Shopify) breaks once DNS cuts over --
-- product pages here always live at /p/{uuid}. This table preserves
-- inbound Google rankings/backlinks/bookmarks by redirecting the old path
-- to its new /p/{uuid} equivalent. Generic across all sellers, not
-- specific to any one migration -- any seller moving from anywhere else
-- hits the exact same problem.
create table if not exists public.product_redirects (
  id                uuid primary key default gen_random_uuid(),
  seller_id         uuid not null references public.sellers(id) on delete cascade,
  -- Path only, no host/query string, always leading-slash (e.g.
  -- "/products/blue-hoodie"). Case-sensitive exact match by design --
  -- callers must normalize (lowercase, strip trailing slash) at write time.
  old_path          text not null,
  -- App-relative destination, e.g. "/p/93f2a1cc-...". Resolved once at
  -- write time rather than joined from products.id at request time, so a
  -- later product deletion can't break the redirect lookup itself (it'll
  -- just point at a since-removed product page, same failure mode a
  -- stale product_id FK would have -- a 404 on the new side is a much
  -- smaller problem than losing the redirect and 404ing on the old side).
  destination_path  text not null,
  -- Optional traceability back to the product row; set null on delete
  -- rather than cascading, since the redirect itself should keep working
  -- (or be intentionally cleaned up) independent of the product's lifecycle.
  product_id        uuid references public.products(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (seller_id, old_path)
);

create index if not exists product_redirects_lookup_idx
  on public.product_redirects (seller_id, old_path);

alter table public.product_redirects enable row level security;
-- No policies = service-role only. Reads happen from middleware (same
-- pattern as resolveCustomDomain's REST call); writes happen from
-- /api/csv-import or a one-off migration script, both service-role.
