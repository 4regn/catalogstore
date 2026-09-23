-- Hourly rollup of store_visitor_events, one row per (seller, hour,
-- event_type). store_visitor_events itself has no retention/cleanup --
-- it grows forever -- so "hour by hour" analysis directly against raw
-- events would only stay fast for recent data and get slower every month
-- as the table grows. This table is what actually stays fast: small
-- (one row per seller/hour/event_type, not one per raw event), and never
-- needs pruning since it's already a summary.
--
-- Deliberately generic (keyed on whatever event_type shows up, not a
-- fixed checkout-only list) -- the same table already answers "how many
-- checkout_pay_clicked in hour X" and "how many flash_cap_unlocked in
-- hour Y" with no schema change between them, and covers whatever new
-- event types get added later too.
--
-- Day/week/month numbers are NOT separately stored -- date_trunc('day'
-- or 'week' or 'month', hour_bucket) on this same table answers those by
-- summing the hourly rows, so there's exactly one rollup mechanism to
-- keep correct, not four.
create table if not exists public.storefront_funnel_hourly (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  hour_bucket timestamptz not null, -- truncated to the top of the hour (UTC)
  event_type text not null,
  event_count integer not null default 0,
  distinct_visitor_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (seller_id, hour_bucket, event_type)
);

create index if not exists storefront_funnel_hourly_seller_hour_idx
  on public.storefront_funnel_hourly (seller_id, hour_bucket desc);

-- Same app-layer access control as every other storefront-analytics table
-- in this schema (store_visitor_events, store_visitor_sessions, etc.) --
-- service-role key writes it (the rollup cron), the dashboard reads it
-- with the same key server-side. Disabled here to match rather than
-- introduce a new, inconsistent auth model for this one table.
alter table public.storefront_funnel_hourly disable row level security;
