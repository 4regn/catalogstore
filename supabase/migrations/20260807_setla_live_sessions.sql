-- Live-visitor presence, separate from setla_page_views (a historical log
-- of every view). One row per visitor_id, upserted by a recurring
-- heartbeat while their tab is open and visible -- "online now" is just
-- "last_seen within the last ~90 seconds", not a stored fact.
create table if not exists public.setla_live_sessions (
  visitor_id text primary key,
  customer_id uuid references public.setla_customers(id) on delete set null,
  path text,
  host text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

alter table public.setla_live_sessions enable row level security;
-- No policies = service-role only, same shape as setla_page_views.

create index if not exists setla_live_sessions_last_seen_idx on public.setla_live_sessions(last_seen desc);
