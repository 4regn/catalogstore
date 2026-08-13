-- Float hosted checkout references and 4REGN-only enablement. Float uses
-- one merchant credential pair stored in Vercel, so this flag is not a
-- seller-facing dashboard toggle.
alter table public.orders
  add column if not exists float_checkout_id text;

create unique index if not exists orders_float_checkout_id_uidx
  on public.orders (float_checkout_id)
  where float_checkout_id is not null;
