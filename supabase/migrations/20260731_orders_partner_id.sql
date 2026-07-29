-- Records which partner's discount code (if any) was used on an order, so
-- a sale can be attributed to them -- commission calculation itself is a
-- later phase, this just captures the fact at the moment the order is
-- placed, in /api/unik/checkout/create.
--
-- Run manually in Supabase SQL editor (repo convention).
alter table public.orders
  add column if not exists partner_id uuid references public.unik_partners(id) on delete set null;

create index if not exists orders_partner_idx on public.orders (partner_id);
