-- UNIK Partner accounts: an external, seller-scoped affiliate/reseller role,
-- distinct from both Brand Manager (internal ops/support, brand_managers
-- table) and the platform-wide Affiliate program (app/affiliate/*, which
-- pays out of subscription revenue for referring new sellers). A Partner
-- promotes UNIK's products specifically and earns a commission on sales
-- they drive, either via their own discount code or their referral link.
--
-- Run manually in Supabase SQL editor (repo convention -- no automated
-- migration runner here).
create table if not exists public.unik_partners (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  -- Referral link code, e.g. uniklabs.co.za/?pref=<referral_code>. Assigned
  -- on approval, not at application time.
  referral_code text unique,
  -- The partner's own discount code, a real row in discount_codes (linked
  -- via discount_codes.partner_id) so it works at checkout like any other
  -- code -- created automatically on approval.
  discount_code_id uuid references public.discount_codes(id) on delete set null,
  -- Null = use the platform-wide default rate. Present = this partner's own
  -- negotiated rate. Keeping this column from day one means a later
  -- per-partner override doesn't need a migration.
  commission_percent numeric,
  payout_account_holder text,
  payout_bank text,
  payout_account_type text,
  payout_branch_code text,
  payout_account_last4 text,
  available_balance_cents integer not null default 0,
  pending_balance_cents integer not null default 0,
  total_earned_cents integer not null default 0,
  total_paid_out_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, auth_user_id)
);

create index if not exists unik_partners_auth_idx on public.unik_partners (auth_user_id);
create index if not exists unik_partners_seller_idx on public.unik_partners (seller_id);
create index if not exists unik_partners_status_idx on public.unik_partners (seller_id, status);

alter table public.unik_partners enable row level security;

drop policy if exists "Partners read own row" on public.unik_partners;
create policy "Partners read own row"
  on public.unik_partners for select
  using (auth.uid() = auth_user_id);

drop policy if exists "Partners update own row" on public.unik_partners;
create policy "Partners update own row"
  on public.unik_partners for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- Links a discount_codes row to the partner who owns it, so using that code
-- at checkout can attribute the sale automatically (wired in a later phase).
alter table public.discount_codes
  add column if not exists partner_id uuid references public.unik_partners(id) on delete set null;
