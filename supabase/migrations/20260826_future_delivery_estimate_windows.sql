-- Keep an auditable range for future automatically estimated deliveries.
-- Existing orders remain NULL and therefore stay hidden on the storefront.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS estimated_delivery_from_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_delivery_manual_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.estimated_delivery_from_at IS
  'Start of the customer-facing estimated delivery window.';
COMMENT ON COLUMN public.orders.estimated_delivery_manual_override IS
  'True when an admin manually changed the delivery estimate.';
