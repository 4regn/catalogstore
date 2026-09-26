-- 4REGN Lay-Buy now has a firm 6-month deadline to clear the balance from
-- the day the deposit lands -- previously open-ended ("pay anytime"),
-- which risked a deposit sitting unpaid for years with an order neither
-- shipped nor resolved. See lib/four-regn-laybuy.ts's
-- expireOverdueFourRegnLaybuyPlans (run daily via the new
-- app/api/cron/expire-four-regn-laybuy) for what happens once a plan
-- passes its deadline still unpaid.
alter table public.four_regn_laybuy_plans add column if not exists expires_at timestamptz;

-- Backfill: any plan already active before this migration gets the same
-- 6-month window, counted from when its deposit actually landed (created_at),
-- not from today -- a customer who deposited 5 months ago has 1 month left,
-- not a fresh 6.
update public.four_regn_laybuy_plans
set expires_at = created_at + interval '6 months'
where status = 'active' and expires_at is null;
