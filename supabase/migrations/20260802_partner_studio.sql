-- Partner Studio: partners get their own AI Studio inside their dashboard
-- (no watermark, own 3/day limit -- reserve_unik_generation() already keys
-- on (seller_id, auth_user_id), and a partner always has their own separate
-- auth.users row, so no new rate-limit function/table is needed) plus the
-- ability to place an order themselves on a WhatsApp customer's behalf.
--
-- owner_role distinguishes a partner's own generations from ordinary
-- storefront customer generations in unik_designs (both share the same
-- table/columns -- a partner design just skips the watermarking step and
-- is never shown on the public storefront).
--
-- channel distinguishes an order the partner placed directly (paying with
-- their own card, shipping to someone else) from a normal self-serve
-- storefront checkout, for order-management/reporting.
--
-- Run manually in Supabase SQL editor (repo convention).
alter table public.unik_designs
  add column if not exists owner_role text not null default 'customer'
  check (owner_role in ('customer', 'partner'));

alter table public.orders
  add column if not exists channel text not null default 'storefront'
  check (channel in ('storefront', 'partner_direct'));
