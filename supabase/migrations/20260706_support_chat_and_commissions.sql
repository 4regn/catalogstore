-- Live chat support + affiliate commission ledger
-- Run this in your Supabase SQL editor.

-- ─── 1. AFFILIATE COMMISSION EVENTS ─────────────────────────────
-- Idempotency ledger for affiliate commission accrual. The PayFast ITN
-- webhook inserts one row per payment (unique pf_payment_id); a retried
-- ITN conflicts on insert and the accrual is skipped, so an affiliate is
-- never paid twice for the same charge.
create table if not exists affiliate_commission_events (
  id                 uuid primary key default gen_random_uuid(),
  affiliate_id       uuid not null,
  referral_id        uuid not null,
  seller_id          uuid not null,
  pf_payment_id      text not null unique,
  amount_gross_cents integer not null,
  commission_cents   integer not null,
  created_at         timestamptz not null default now()
);

create index if not exists ace_affiliate_idx on affiliate_commission_events (affiliate_id, created_at desc);
create index if not exists ace_seller_idx    on affiliate_commission_events (seller_id, created_at desc);

alter table affiliate_commission_events enable row level security;
-- No policies = service-role only. All access goes through API routes.

-- ─── 2. SUPPORT CHAT ────────────────────────────────────────────
-- Visitor live-chat conversations, attended from the admin dashboard.
-- Visitors are identified by an anonymous visitor_id kept in their
-- browser's localStorage; no account needed.
create table if not exists support_conversations (
  id                   uuid primary key default gen_random_uuid(),
  visitor_id           text not null,
  name                 text,
  email                text,
  status               text not null default 'open',   -- 'open' | 'closed'
  admin_unread         integer not null default 0,     -- messages the admin hasn't seen yet
  last_message_at      timestamptz not null default now(),
  last_message_preview text,
  created_at           timestamptz not null default now()
);

create index if not exists sc_visitor_idx on support_conversations (visitor_id, created_at desc);
create index if not exists sc_status_idx  on support_conversations (status, last_message_at desc);

create table if not exists support_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references support_conversations (id) on delete cascade,
  sender          text not null,   -- 'visitor' | 'admin'
  body            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists sm_conversation_idx on support_messages (conversation_id, created_at asc);

alter table support_conversations enable row level security;
alter table support_messages      enable row level security;
-- No policies = service-role only. Visitors and admin both go through
-- API routes (/api/support/*, /api/admin/support/*), never direct table access.
