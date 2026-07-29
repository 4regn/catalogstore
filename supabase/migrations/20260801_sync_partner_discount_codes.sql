-- One-off backfill: partner discount codes are meant to always mirror
-- their partner's current referral_code and the program's current
-- percentage-based default, but existing rows are stale snapshots from
-- before /api/unik/partners/profile started keeping them in sync (some
-- are still the old fixed-rand default, e.g. "R25 off", and/or carry a
-- code string from before the partner last edited their referral code).
-- Run manually in Supabase SQL editor (repo convention).
update public.discount_codes dc
set type = 'percentage',
    value = 10,
    code = upper(up.referral_code)
from public.unik_partners up
where up.discount_code_id = dc.id;
