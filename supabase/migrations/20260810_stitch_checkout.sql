-- Stitch Express Card Consent checkout, as a third generic-storefront
-- payment option alongside EFT/PayFast/Yoco (see
-- app/api/checkout/stitch-redirect/route.ts). Same shape as the existing
-- yoco_checkout_id/yoco_payment_id/yoco_event_id columns
-- (20260722_unik_yoco_customer_accounts.sql) -- this platform's `orders`
-- table tracks each gateway with its own dedicated columns rather than one
-- shared "provider reference" field, so this follows that same convention
-- instead of introducing a new pattern.
--
-- stitch_consent_id is the Card Consent request id, set at checkout-start
-- time and used by the webhook to look the order back up (same role
-- yoco_checkout_id plays for Yoco). stitch_payment_id/stitch_event_id are
-- populated once payment.paid actually confirms.
alter table public.orders
  add column if not exists stitch_consent_id text,
  add column if not exists stitch_payment_id text,
  add column if not exists stitch_event_id text;

create unique index if not exists orders_stitch_consent_id_uidx
  on public.orders (stitch_consent_id)
  where stitch_consent_id is not null;
