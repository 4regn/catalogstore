-- Dedup flag so the once-daily abandoned-cart recovery cron never emails
-- the same order twice across multiple runs.
alter table public.orders
  add column if not exists abandoned_cart_email_sent_at timestamptz;

-- A minimal, seller-scoped opt-out list for cart-recovery emails (and any
-- future non-Broadcasts marketing-adjacent send) -- these go out through
-- the plain transactional Resend API, which has no built-in unsubscribe
-- handling of its own (unlike Broadcasts/Audiences), so a real one has to
-- exist for compliance and just to respect a "no thanks".
create table if not exists public.marketing_email_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (seller_id, email)
);

alter table public.marketing_email_unsubscribes enable row level security;
-- No browser policies: only service-role API routes read/write this.
