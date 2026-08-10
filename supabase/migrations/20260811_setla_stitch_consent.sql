-- Stitch Card Consent for SETLA Pay Later: the first instalment is charged
-- via a saved-card consent instead of a plain Yoco checkout, so instalments
-- #2+ can be auto-collected later without the customer manually returning
-- to pay each one (see lib/setla-instalments.ts and
-- app/api/cron/setla-collect-instalments/route.ts). Laybuy is untouched --
-- it has no fixed schedule to automate, stays on Yoco.
--
-- This is a SEPARATE Stitch reference from orders.stitch_link_id (the
-- generic-storefront Payment Links checkout, 20260811_stitch_payment_links.sql)
-- -- Card Consent and Payment Links are different Stitch products with
-- different webhook identifiers (consentId vs linkId), so this platform
-- tracks them in separate columns rather than overloading one.
alter table public.orders
  add column if not exists stitch_consent_id text,
  -- Snapshot of the exact SETLA plan math (financedAmount/excessUpfront/
  -- scheduleVariant/etc -- the same shape buildSetlaFirstChargeMetadata
  -- already produces for Yoco's checkout metadata) computed the moment the
  -- consent request is created. Stitch's webhook payload carries no custom
  -- metadata field at all (unlike Yoco's), so this is the only way
  -- activateSetlaPlanAfterPayment can reconstruct the plan once
  -- payment.paid actually confirms -- read once, never cleared (harmless
  -- leftover once the order is resolved, same as any other orders column).
  add column if not exists setla_pending_stitch_meta jsonb;

create unique index if not exists orders_stitch_consent_id_uidx
  on public.orders (stitch_consent_id)
  where stitch_consent_id is not null;

-- Stored on the plan once activated so instalments #2+ can be charged
-- against the SAME saved card via initiateStitchConsentPayment, with no
-- customer action. stitch_consent_status tracks Stitch's own
-- reauthorisation_required signal (e.g. a 3DS step-up the cardholder must
-- redo) -- once set, the daily collection cron stops auto-attempting that
-- plan and leaves its instalments for the customer's existing manual "pay
-- this instalment" button instead (still Yoco, unaffected by any of this).
alter table public.setla_payment_plans
  add column if not exists stitch_consent_id text,
  add column if not exists stitch_consent_status text
    check (stitch_consent_status is null or stitch_consent_status in ('active', 'reauth_required'));

-- Bounded retry count so a genuinely declining card doesn't get
-- auto-charged forever -- the daily cron gives up after a small fixed
-- number of failed attempts (see MAX_AUTO_RETRY_ATTEMPTS in the cron
-- route) and leaves the instalment "overdue" for manual payment instead
-- of continuing to hit Stitch's API with a doomed charge every day.
alter table public.setla_instalments
  add column if not exists stitch_auto_retry_count integer not null default 0;
