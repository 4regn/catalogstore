-- SETLA Laybuy is a flexible deposit + pay-anytime product, not a fixed
-- instalment schedule -- a customer pays a minimum 30% deposit at
-- checkout, then tops up the remaining balance with whatever amount they
-- choose, whenever they choose, over up to 3 months. setla_instalments
-- (due_at NOT NULL, sequence_number, "overdue" status) models a fixed
-- schedule and stays exactly as-is for Pay Later, which genuinely has
-- one; Laybuy gets its own append-only payment ledger instead, since
-- there's no schedule to model. If the balance isn't fully paid within
-- the 3-month window, production simply stays locked -- no automatic
-- cancellation, no refund logic (explicit product decision).

create table if not exists public.setla_laybuy_payments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.setla_payment_plans(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  is_deposit boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  payment_provider_reference text,
  yoco_checkout_id text,
  yoco_event_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists setla_laybuy_payments_plan_idx on public.setla_laybuy_payments(plan_id);

-- Recorded at plan creation for admin visibility/audit (what the minimum
-- deposit actually was for this order, since the 30% rate could change
-- for future orders without this historical record changing retroactively).
alter table public.setla_payment_plans
  add column if not exists min_deposit_amount numeric(12,2);
