-- Live-visitor tracking: a lightweight heartbeat row per anonymous browser
-- session, upserted every ~20s from the storefront (all templates) and from
-- the UNIK Labs static pages separately (they run outside the React tree,
-- inside an iframe). Read by the seller dashboard and the UNIK Brand
-- Manager dashboard to show who's currently browsing / has an active cart /
-- is at checkout. No RLS policies -- all access goes through service-role
-- API routes (a public heartbeat writer, and two seller-authenticated
-- readers), matching the pattern already used for newsletter_subscribers.
create table if not exists public.store_live_sessions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  visitor_id text not null,
  status text not null default 'browsing' check (status in ('browsing', 'active_cart', 'checkout')),
  path text,
  cart_item_count integer not null default 0,
  cart_value numeric not null default 0,
  customer_name text,
  customer_email text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (seller_id, visitor_id)
);

create index if not exists store_live_sessions_seller_idx
  on public.store_live_sessions (seller_id, last_seen_at desc);

alter table public.store_live_sessions enable row level security;
