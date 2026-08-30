-- Dedup flag for the abandoned-CHECKOUT (not abandoned-cart-with-an-order)
-- recovery email -- someone who typed their details at checkout and left
-- without ever clicking "Place Order", so no orders row exists to stamp
-- abandoned_cart_email_sent_at on instead. One row per visitor per day, so
-- this lives on store_visitor_sessions rather than a new table.
alter table public.store_visitor_sessions
  add column if not exists abandoned_checkout_email_sent_at timestamptz;
