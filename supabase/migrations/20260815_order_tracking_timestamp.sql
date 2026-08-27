-- Allows admins to choose the exact date/time shown for the latest order
-- tracking update on customer-facing tracking pages.
alter table public.orders
  add column if not exists tracking_updated_at timestamptz;

comment on column public.orders.tracking_updated_at is
  'Admin-selected timestamp for the latest customer-facing tracking/status update.';
