-- Customers with no email (phone-only Shopify contacts) were plain-inserted
-- with no dedupe key, since the table's only unique constraint is
-- (seller_id, email). In practice every Shopify customer row -- including
-- phone-only ones -- carries a real Customer ID, so that can serve as the
-- dedupe key instead, letting a partially-failed phone-only batch resume
-- safely (upsert) rather than requiring the operator to avoid ever
-- re-running the import.
create unique index if not exists customers_seller_external_unique_idx
  on public.customers (seller_id, external_id) where external_id is not null;
