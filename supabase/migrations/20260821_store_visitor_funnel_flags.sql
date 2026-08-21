-- Daily visitor-funnel flags for dashboard analytics.
-- One row still represents one visitor per seller per SAST day, but now it
-- can also remember whether that visitor ever had a cart or reached checkout
-- during that day.

alter table public.store_visitor_sessions
  add column if not exists last_status text,
  add column if not exists last_path text,
  add column if not exists had_cart boolean not null default false,
  add column if not exists reached_checkout boolean not null default false,
  add column if not exists cart_started_at timestamptz,
  add column if not exists checkout_started_at timestamptz,
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists store_visitor_sessions_seller_funnel_idx
  on public.store_visitor_sessions (seller_id, session_date, had_cart, reached_checkout);

create table if not exists public.store_visitor_events (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  visitor_id text not null,
  event_type text not null check (event_type in ('page_view', 'add_to_cart', 'reached_checkout', 'purchase')),
  path text,
  customer_name text,
  customer_email text,
  cart_item_count integer not null default 0,
  cart_value numeric not null default 0,
  cart_items jsonb not null default '[]'::jsonb,
  country text,
  region text,
  city text,
  created_at timestamptz not null default now()
);

create index if not exists store_visitor_events_seller_type_time_idx
  on public.store_visitor_events (seller_id, event_type, created_at desc);

create index if not exists store_visitor_events_seller_visitor_time_idx
  on public.store_visitor_events (seller_id, visitor_id, created_at desc);

alter table public.store_visitor_events enable row level security;
