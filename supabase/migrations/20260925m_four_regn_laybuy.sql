-- 4REGN Lay-Buy: a simpler, 4regn-only alternative to SETLA's own Laybuy
-- plan type -- same "pay a deposit, top up whenever, ship once fully
-- paid" shape, but no shared credit facility, no separate SETLA login,
-- no eligibility check. Customers use the storefront's own existing
-- account system (customer_accounts/customer_account_sessions, see
-- 20260815_customer_accounts_wishlists.sql) instead of a SETLA account.
--
-- A plan is only ever created once its deposit payment has actually
-- succeeded (see lib/four-regn-laybuy.ts's activateFourRegnLaybuyPlan),
-- same "never claim a payment that didn't happen" rule SETLA's own
-- activateSetlaPlanAfterPayment follows.
create table if not exists public.four_regn_laybuy_plans (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  total_amount numeric not null,
  paid_amount numeric not null default 0,
  status text not null default 'active', -- active | paid_off | cancelled
  created_at timestamptz not null default now(),
  paid_off_at timestamptz
);

-- Append-only ledger, no due dates -- mirrors setla_laybuy_payments'
-- shape (20260810_setla_laybuy_flexible.sql) exactly, minus the columns
-- that only make sense inside SETLA's own credit facility.
create table if not exists public.four_regn_laybuy_payments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.four_regn_laybuy_plans(id) on delete cascade,
  amount numeric not null,
  is_deposit boolean not null default false,
  status text not null default 'pending', -- pending | paid | failed
  yoco_checkout_id text,
  yoco_payment_id text,
  yoco_event_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists four_regn_laybuy_plans_customer_idx on public.four_regn_laybuy_plans(customer_id, created_at desc);
create index if not exists four_regn_laybuy_payments_plan_idx on public.four_regn_laybuy_payments(plan_id, created_at desc);

-- Same reasoning as orders.setla_pending_stitch_meta: the deposit Yoco
-- checkout is created before any plan row exists, so the order-status
-- self-heal path (checked when the customer lands back on the success
-- page, in case the webhook is late) needs somewhere to read back what
-- the expected deposit amount actually was. Kept as its own column
-- rather than reusing the SETLA one -- this is a separate, unrelated
-- system and the two should never be able to collide or be confused.
alter table public.orders add column if not exists four_regn_laybuy_pending_meta jsonb;

-- Same "enable, no policies" convention as customer_accounts and friends
-- (20260815_customer_accounts_wishlists.sql) -- customer sessions here
-- are a bespoke cookie system, not Supabase Auth, so there's no
-- meaningful auth.uid() to write a policy against. All access goes
-- through service-role API routes after an HttpOnly session check.
alter table public.four_regn_laybuy_plans enable row level security;
alter table public.four_regn_laybuy_payments enable row level security;
