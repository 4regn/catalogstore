-- Server-owned Stitch references for the private UNIK Labs storefront,
-- mirroring the Yoco columns added in 20260722_unik_yoco_checkout.sql.
-- Stitch secret keys stay Vercel environment variables, never checkout_config.

alter table public.orders
  add column if not exists stitch_payment_request_id text,
  add column if not exists stitch_payment_id text;

create unique index if not exists orders_stitch_payment_request_id_uidx
  on public.orders (stitch_payment_request_id)
  where stitch_payment_request_id is not null;

create unique index if not exists orders_stitch_payment_id_uidx
  on public.orders (stitch_payment_id)
  where stitch_payment_id is not null;
