-- Historical, one-row-per-visitor-per-day session log -- store_live_sessions
-- (the earlier migration) only ever holds the *current* state of a visitor
-- and gets overwritten on every heartbeat, so it can't answer "sessions by
-- day" or "where are visitors from" once someone leaves. This table is
-- insert-once-per-(seller, visitor, day): the first heartbeat of a given
-- visitor on a given day writes a row and every later heartbeat that same
-- day is a no-op, so a visitor who reloads the page 50 times still only
-- counts as one session that day. session_date is the seller's local
-- (Africa/Johannesburg, UTC+2 year-round -- South Africa observes no DST)
-- calendar day, computed by the API route at write time, not derived from
-- created_at later, so day-bucketing is never ambiguous.
create table if not exists public.store_visitor_sessions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  visitor_id text not null,
  session_date date not null,
  country text,
  region text,
  city text,
  first_seen_at timestamptz not null default now(),
  unique (seller_id, visitor_id, session_date)
);

create index if not exists store_visitor_sessions_seller_date_idx
  on public.store_visitor_sessions (seller_id, session_date desc);

alter table public.store_visitor_sessions enable row level security;
