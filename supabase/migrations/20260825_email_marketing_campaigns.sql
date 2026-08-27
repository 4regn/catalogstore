-- Consent-safe Resend Broadcast campaigns. Both tables are service-role
-- only: dashboard access goes through authenticated API routes, never direct
-- browser queries.
create table if not exists public.marketing_email_settings (
  seller_id uuid primary key references public.sellers(id) on delete cascade,
  resend_segment_id text,
  segment_name text not null default 'Email Subscribers',
  synced_contact_count integer not null default 0,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  name text not null,
  subject text not null,
  preview_text text,
  template_key text not null,
  html_snapshot text not null,
  resend_broadcast_id text,
  recipient_count integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'scheduled', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_email_campaigns_seller_idx
  on public.marketing_email_campaigns (seller_id, created_at desc);
create unique index if not exists marketing_email_campaigns_resend_idx
  on public.marketing_email_campaigns (resend_broadcast_id)
  where resend_broadcast_id is not null;

alter table public.marketing_email_settings enable row level security;
alter table public.marketing_email_campaigns enable row level security;
