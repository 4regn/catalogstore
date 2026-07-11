-- Newsletter subscribers
-- Run this in your Supabase SQL editor.

-- Visitors on a storefront can subscribe with just an email address. Writes
-- go through /api/newsletter/subscribe (service role), never direct table
-- access, matching the support_conversations / affiliate pattern.
create table if not exists newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references sellers (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  unique (seller_id, email)
);

create index if not exists ns_seller_idx on newsletter_subscribers (seller_id, created_at desc);

alter table newsletter_subscribers enable row level security;
-- No policies = service-role only. All access goes through /api/newsletter/*.
