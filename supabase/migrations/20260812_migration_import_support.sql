-- Support for importing a full external catalog/customer base (e.g. a
-- Shopify export) beyond just products: product tags/metafields/source
-- URL, a real customers table (marketing-consent/CRM data, deliberately
-- NOT a login/auth system -- see note below), and enough on `orders` to
-- link a historical imported order back to its customer.

alter table public.products
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists metafields jsonb not null default '{}'::jsonb,
  -- The product's original URL on whatever platform it's migrating from
  -- (e.g. https://4regn.com/products/blue-hoodie). Distinct from
  -- product_redirects: that table exists to *redirect visitor traffic*,
  -- this column is just data provenance kept on the product record itself.
  add column if not exists source_url text;

-- A seller's customer contact list -- name, email, phone, marketing
-- consent -- for CRM/marketing-list purposes (order history, email/SMS
-- campaigns). This is deliberately NOT the same thing as a customer LOGIN
-- system: unik_customer_profiles (see 20260722_unik_customer_accounts.sql)
-- requires a real auth.users row per customer and is specific to the
-- private UNIK Labs storefront. A regular seller migrating a customer
-- list from another platform has thousands of contacts who never signed
-- up for an account here and shouldn't need one just to be on a mailing
-- list -- building real storefront customer login is tracked separately
-- as its own, larger feature.
create table if not exists public.customers (
  id                            uuid primary key default gen_random_uuid(),
  seller_id                     uuid not null references public.sellers(id) on delete cascade,
  -- The old platform's own customer id, kept only for traceability/dedup
  -- on re-import -- never used for anything auth-related.
  external_id                   text,
  first_name                    text,
  last_name                     text,
  email                         text,
  phone                         text,
  accepts_email_marketing       boolean not null default false,
  accepts_sms_marketing         boolean not null default false,
  marketing_consent_updated_at  timestamptz,
  tags                          text[] not null default '{}'::text[],
  note                          text,
  total_spent                   numeric(12,2),
  total_orders                  integer,
  source                        text not null default 'manual'
    check (source in ('manual', 'import', 'checkout')),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (seller_id, email)
);

create index if not exists customers_seller_idx on public.customers (seller_id, created_at desc);
create index if not exists customers_seller_external_idx on public.customers (seller_id, external_id) where external_id is not null;

alter table public.customers enable row level security;
-- No policies = service-role only, same as newsletter_subscribers -- all
-- access goes through service-role API routes / import scripts, never a
-- direct client-side query.

-- Historical orders being imported need to (a) link to the customer they
-- belong to and (b) be safely re-runnable without creating duplicates on a
-- second import attempt -- neither of which the live checkout path
-- (app/api/checkout/place-order/route.ts) needs, so both are nullable and
-- have zero effect on it.
alter table public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists external_id text,
  add column if not exists imported_at timestamptz;

create unique index if not exists orders_seller_external_idx
  on public.orders (seller_id, external_id) where external_id is not null;
create index if not exists orders_customer_idx on public.orders (customer_id) where customer_id is not null;
