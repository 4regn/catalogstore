-- Brand Manager accounts: a limited, seller-scoped team-member role.
-- The platform previously only had two kinds of auth.users rows -- seller
-- owners and storefront customers. A Brand Manager is neither: they sign in
-- with their own auth.users account but only ever act within one seller's
-- data (orders, support conversations, their own campaign code and payout
-- details), never the seller's own login or billing.

create table if not exists public.brand_managers (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  campaign_code text,
  campaign_discount_percent integer not null default 0
    check (campaign_discount_percent between 0 and 100),
  payout_account_holder text,
  payout_bank text,
  payout_account_type text,
  payout_branch_code text,
  payout_account_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, auth_user_id)
);

create index if not exists brand_managers_auth_idx
  on public.brand_managers (auth_user_id);
create index if not exists brand_managers_seller_idx
  on public.brand_managers (seller_id);

alter table public.brand_managers enable row level security;

drop policy if exists "Brand managers read own row" on public.brand_managers;
create policy "Brand managers read own row"
  on public.brand_managers for select
  using (auth.uid() = auth_user_id);

drop policy if exists "Brand managers update own row" on public.brand_managers;
create policy "Brand managers update own row"
  on public.brand_managers for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);
