-- First-touch traffic attribution -- where a visitor actually came from
-- (Google, WhatsApp, Instagram, direct URL entry, etc.), captured once per
-- visitor and never overwritten by later internal navigation, so it
-- reflects the original source that brought them to the store, not
-- whatever page they happened to be on last.
--
-- Written by the storefront heartbeat (app/api/storefront/heartbeat/route.ts)
-- the first time a given visitor is ever seen -- ignoreDuplicates on the
-- (seller_id, visitor_id) unique constraint means every later heartbeat
-- from that same visitor is a no-op here, exactly the "first touch wins"
-- semantics this needs. Same app-layer-only access pattern as
-- store_visitor_sessions/store_visitor_events (RLS disabled, service-role
-- reads/writes only).
create table if not exists public.store_visitor_attribution (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  visitor_id text not null,
  source text not null, -- normalized bucket: google, whatsapp, instagram, facebook, tiktok, youtube, bing, direct, referral, or a raw utm_source value
  referrer text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  landing_path text,
  first_seen_at timestamptz not null default now(),
  unique (seller_id, visitor_id)
);

create index if not exists store_visitor_attribution_seller_time_idx
  on public.store_visitor_attribution (seller_id, first_seen_at desc);
create index if not exists store_visitor_attribution_seller_source_idx
  on public.store_visitor_attribution (seller_id, source);

alter table public.store_visitor_attribution disable row level security;

-- Denormalized onto the order itself (not just joined from the table
-- above at read time) so an order's attribution is a permanent fact about
-- that order, immune to a visitor's attribution row somehow changing or
-- this table being pruned later -- and so it works even for a visitor_id
-- the client never got a chance to send a heartbeat for before checking
-- out (place-order reads the client's own cached attribution directly,
-- see CheckoutPageClient.tsx, not this table).
alter table public.orders
  add column if not exists traffic_source text,
  add column if not exists traffic_attribution jsonb;
