-- Per-order tracking history log -- the dashboard previously only stored a
-- single current `status` + a single `tracking_updated_at` timestamp per
-- order, so every status update overwrote the last one with no record of
-- what happened before it. This table is purely an additive audit trail
-- sellers can review and correct (fix a wrong date/status, or backfill an
-- update they forgot to log) alongside those existing fields -- it does
-- NOT replace them and does not drive what customers see on the tracking
-- page (lib/four-regn-tracking.ts and the customer-facing tracking route
-- are unchanged and still read orders.status/tracking_updated_at
-- directly).

create table if not exists public.order_tracking_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists order_tracking_history_order_idx on public.order_tracking_history(order_id, occurred_at desc);

alter table public.order_tracking_history enable row level security;

drop policy if exists "Seller manages own order tracking history" on public.order_tracking_history;
create policy "Seller manages own order tracking history" on public.order_tracking_history for all
  using (exists (select 1 from public.orders o where o.id = order_tracking_history.order_id and o.seller_id = auth.uid()))
  with check (exists (select 1 from public.orders o where o.id = order_tracking_history.order_id and o.seller_id = auth.uid()));
