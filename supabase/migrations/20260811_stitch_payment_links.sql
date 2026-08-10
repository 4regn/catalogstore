-- The generic-storefront Stitch integration switched from Card Consent to
-- Payment Links (see lib/stitch.ts's own comment) -- Card Consent needs a
-- scope Stitch hasn't approved for this account's LIVE client yet, and
-- isn't actually needed just to take a one-off payment. Payment Links only
-- needs the default scope, which already works.
--
-- stitch_consent_id was added in 20260810_stitch_checkout.sql but never
-- populated by any real order (nothing completed a Stitch checkout before
-- this switch) -- safe to rename in place rather than add a new column and
-- leave a dead one behind. Same role as before, just renamed to match what
-- it actually stores now: the Payment Link's id, used by the webhook to
-- look the order back up via its `linkId` field.
alter table public.orders
  rename column stitch_consent_id to stitch_link_id;

alter index if exists orders_stitch_consent_id_uidx
  rename to orders_stitch_link_id_uidx;
