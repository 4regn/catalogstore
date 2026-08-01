-- Server-owned Yoco references for the private UNIK Labs storefront.
-- These fields are deliberately outside sellers.checkout_config so the Yoco
-- secret keys remain Vercel environment variables and never enter the browser.

alter table public.orders
  add column if not exists customer_auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists yoco_checkout_id text,
  add column if not exists yoco_payment_id text,
  add column if not exists yoco_event_id text;

create unique index if not exists orders_yoco_checkout_id_uidx
  on public.orders (yoco_checkout_id)
  where yoco_checkout_id is not null;

create unique index if not exists orders_yoco_event_id_uidx
  on public.orders (yoco_event_id)
  where yoco_event_id is not null;

create index if not exists orders_unik_customer_history_idx
  on public.orders (seller_id, customer_auth_user_id, created_at desc)
  where customer_auth_user_id is not null;
