-- Follow-up to 20260802_setla_payments.sql, applied before that migration
-- is ever run against a live database -- these are fixes to gaps found
-- while designing the real (non-mocked) backend, not a later patch to
-- already-live data.

-- 1. SETLA admin/reviewer identity. Cross-store (4regn x UNIK), so unlike
-- brand_managers/unik_partners this is NOT scoped to a seller_id. Multiple
-- reviewers, individually identifiable for the audit trail -- a single
-- shared admin email (lib/require-admin.ts's pattern) can't support an
-- actual review team or per-person revocation.
create table if not exists public.setla_admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'reviewer' check (role in ('reviewer','super_admin')),
  invited_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.setla_admins enable row level security;
-- No policies = service-role only, matching admin_audit_log / brand_managers'
-- own precedent for tables only ever touched through trusted API routes.

-- 2. apply.html collects a 13-digit SA ID number but setla_customers never
-- had anywhere to store it -- and without it there's no real fraud-relevant
-- duplicate-application check (email alone is trivially bypassed with a
-- second address).
alter table public.setla_customers add column if not exists id_number text;
create unique index if not exists setla_customers_id_number_uidx
  on public.setla_customers(id_number) where id_number is not null;

-- 3. provider_reference was NOT NULL but nothing generates one -- that's a
-- bank-verification vendor integration that doesn't exist yet. Phase 1 is
-- manual document review only.
alter table public.setla_bank_accounts alter column provider_reference drop not null;

-- 4. Audit-trail parity: setla_applications already has reviewed_by +
-- reviewed_at; give the other three review tables the same shape so "who
-- reviewed what and when" is answerable everywhere, not just for applications.
alter table public.setla_documents add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.setla_bank_accounts add column if not exists reviewed_at timestamptz;
alter table public.setla_bank_accounts add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.setla_appeals add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

-- 5. Per-instalment Yoco tracking -- lib/yoco.ts has no recurring/tokenized
-- billing, so each instalment is its own one-off checkout. Mirrors orders'
-- own yoco_checkout_id/yoco_payment_id shape. payment_provider_reference
-- (already on setla_instalments) is repurposed as the final Yoco paymentId
-- once paid, or 'manual:<admin email>' for the admin mark-paid fallback --
-- documented here rather than renamed, to avoid touching the staged column.
alter table public.setla_instalments add column if not exists yoco_checkout_id text;
alter table public.setla_instalments add column if not exists yoco_event_id text;
create unique index if not exists setla_instalments_yoco_checkout_uidx
  on public.setla_instalments(yoco_checkout_id) where yoco_checkout_id is not null;
create unique index if not exists setla_instalments_yoco_event_uidx
  on public.setla_instalments(yoco_event_id) where yoco_event_id is not null;

-- 6. Basic fraud signal for the admin's manual judgement -- which IP an
-- application was submitted from, not an automated block.
alter table public.setla_applications add column if not exists submitted_ip text;

-- 7. Admin-queue indexes -- the staged migration only indexed customer-scoped
-- reads (one customer's own rows). Admin review queues filter by status
-- across ALL customers, which needs its own indexes.
create index if not exists setla_applications_status_idx on public.setla_applications(status, submitted_at desc);
create index if not exists setla_documents_review_status_idx on public.setla_documents(review_status, created_at desc);
create index if not exists setla_bank_accounts_review_status_idx on public.setla_bank_accounts(review_status, created_at desc);
create index if not exists setla_instalments_status_due_idx on public.setla_instalments(status, due_at);
create index if not exists setla_appeals_status_idx on public.setla_appeals(status, submitted_at desc);

-- 8. setla_support_messages (from the staged migration) is intentionally
-- left unused -- the platform already has a generic, working support-chat
-- system (support_conversations/support_messages, category is free text,
-- see 20260709_support_categories.sql) that SETLA reuses with
-- category:'setla' instead of a redundant parallel table. Not dropped here
-- since it's harmless and already committed; just never written to.
