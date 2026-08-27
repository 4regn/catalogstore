-- A seller-authored message for the customer-facing order tracking view.
-- Kept separate from orders.notes, which holds the customer's own checkout
-- instructions and must never be overwritten by merchant updates.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_tracking_note text;
