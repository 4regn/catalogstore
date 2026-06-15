-- Admin assistance audit log
-- Run this in your Supabase SQL editor before using admin impersonation in production.
-- Every action the admin takes while assisting a seller is written here.

create table if not exists admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  admin_email  text not null,
  action       text not null,             -- 'impersonate_start' | 'impersonate_end' | 'edit_seller' | 'edit_product' | 'edit_checkout_config' | etc
  target_seller_id uuid,                  -- the seller being acted on
  fields       text[],                    -- list of field names that were written, when applicable
  details      jsonb,                     -- free-form blob for action-specific metadata
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_log_seller_idx on admin_audit_log (target_seller_id, created_at desc);
create index if not exists admin_audit_log_admin_idx  on admin_audit_log (admin_email, created_at desc);
create index if not exists admin_audit_log_action_idx on admin_audit_log (action, created_at desc);

-- RLS: nobody can read this from the client. Only the service role (used by
-- the /api/admin/* routes) can write or read.
alter table admin_audit_log enable row level security;
-- No policies = no anon/authenticated access. Service role bypasses RLS so
-- the API routes can still log and read freely.
