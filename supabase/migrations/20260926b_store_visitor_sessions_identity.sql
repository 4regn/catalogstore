-- store_visitor_sessions has been missing customer_name/customer_email
-- this whole time -- no earlier migration ever added them, even though
-- app/api/storefront/heartbeat/route.ts, the abandoned-checkout-email
-- cron, getSessionAnalytics, and getCheckoutFunnelAnalytics (lib/store-analytics.ts)
-- all assume they exist.
--
-- Real, live impact: the heartbeat route writes had_cart/reached_checkout
-- and customer_name/customer_email in ONE update statement. Postgres
-- updates are all-or-nothing -- the instant a checkout visitor types their
-- name or email, that same update tries to also write customer_email,
-- hits this missing column, and the WHOLE statement fails silently
-- (caught only by a console.error nobody was watching), including the
-- reached_checkout=true part. Browsing pages before checkout never hit
-- this (no identity involved), so the flag only broke for the one
-- moment it mattered most: someone actually reaching checkout and typing
-- their details. Confirmed live via a direct query returning
-- "column customer_email does not exist".
alter table public.store_visitor_sessions
  add column if not exists customer_name text,
  add column if not exists customer_email text;
