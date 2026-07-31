-- Brand Manager Studio: the seller's own team gets the same no-watermark AI
-- Studio already built for partners (see 20260802_partner_studio.sql), so
-- they can generate and save designs for their own use (gifting/seeding
-- merch, etc.) without it ever touching partner commission logic.
--
-- owner_role gets a third value alongside 'customer' and 'partner' --
-- reserve_unik_generation() already keys purely on (seller_id,
-- auth_user_id), and a brand manager always has their own separate
-- auth.users row (see 20260724_brand_managers.sql), so this reuses the same
-- rate-limit function and unik_designs table with zero other schema change.
--
-- Run manually in Supabase SQL editor (repo convention).
alter table public.unik_designs
  drop constraint if exists unik_designs_owner_role_check;

alter table public.unik_designs
  add constraint unik_designs_owner_role_check
  check (owner_role in ('customer', 'partner', 'brand_manager'));
