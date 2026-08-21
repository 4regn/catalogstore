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
