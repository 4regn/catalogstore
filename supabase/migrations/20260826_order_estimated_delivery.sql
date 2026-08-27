-- Existing orders remain NULL, so customers never receive a guessed date.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz;

COMMENT ON COLUMN public.orders.estimated_delivery_at IS
  'Optional customer-facing delivery estimate, set manually by the merchant until automatic rules are enabled.';
