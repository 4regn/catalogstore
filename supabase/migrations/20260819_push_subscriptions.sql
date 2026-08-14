-- Browser Web Push subscriptions for the seller dashboard's real-time "new
-- order" toast (see the orders-<sellerId> Supabase Realtime channel in
-- app/dashboard/page.tsx) -- that toast only fires while the dashboard tab
-- is open and focused, same gap Shopify's mobile app push notification
-- fills. One seller can have several subscriptions (desktop browser, phone
-- home-screen PWA, etc), each is its own row so any of them can go stale
-- (browser push subscriptions expire/rotate) and get individually cleaned
-- up without touching the others -- see lib/push-notify.ts, which deletes
-- a row here the moment its endpoint 404s/410s on send.
--
-- RLS is intentionally left disabled, matching this platform's established
-- convention for seller-owned tables (app-layer access control only, via
-- the access_token -> admin.auth.getUser() pattern every other
-- /api/dashboard/* route already uses) -- not an oversight.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_seller_id_idx on public.push_subscriptions (seller_id);

alter table public.push_subscriptions disable row level security;
