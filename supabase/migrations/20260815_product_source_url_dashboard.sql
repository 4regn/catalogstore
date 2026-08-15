-- Admin-only supplier/source URL provenance for migrated products.
-- This is intentionally not selected by storefront/public product routes.
alter table public.products
  add column if not exists source_url text;
