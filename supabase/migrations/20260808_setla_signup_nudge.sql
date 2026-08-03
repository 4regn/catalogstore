-- Tracks whether the "complete your application" nudge email has already
-- gone out to this customer, so the daily cron never sends it twice.
alter table public.setla_customers add column if not exists signup_nudge_sent_at timestamptz;
