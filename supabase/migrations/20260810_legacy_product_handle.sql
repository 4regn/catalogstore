-- Stores the original Shopify product handle when a seller migrates via the
-- Shopify CSV export import, so old Shopify /products/{handle} links can
-- redirect to the matching CatalogStore product once the seller's domain
-- (e.g. Shopify freezes and 4regn.com now points at CatalogStore) switches
-- over. Run manually in Supabase SQL editor.

alter table products
  add column if not exists legacy_handle text;

create index if not exists products_legacy_handle_idx on products (seller_id, legacy_handle) where legacy_handle is not null;
