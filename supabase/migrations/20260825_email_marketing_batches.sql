-- Safe, resumable marketing batches. A recipient can only be reserved once for
-- a given template, which prevents duplicate sends across today's and
-- tomorrow's batches.
alter table public.marketing_email_campaigns
  add column if not exists resend_segment_id text,
  add column if not exists batch_number integer not null default 1;

alter table public.marketing_email_campaigns
  drop constraint if exists marketing_email_campaigns_status_check;

alter table public.marketing_email_campaigns
  add constraint marketing_email_campaigns_status_check
  check (status in ('preparing', 'draft', 'sending', 'sent', 'scheduled', 'failed'));

create table if not exists public.marketing_email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_email_campaigns(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  template_key text not null,
  email text not null,
  first_name text,
  last_name text,
  status text not null default 'queued'
    check (status in ('queued', 'synced', 'sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, template_key, email)
);

create index if not exists marketing_email_campaign_recipients_campaign_idx
  on public.marketing_email_campaign_recipients (campaign_id, status, created_at);

alter table public.marketing_email_campaign_recipients enable row level security;
