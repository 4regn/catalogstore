-- Tracks how much of an order was actually refunded, since a refund can be
-- partial (e.g. just the delivery fee, or a single item) rather than the
-- full order total. payment_status = 'refunded' alone doesn't capture that.

alter table public.orders add column if not exists refund_amount numeric;
