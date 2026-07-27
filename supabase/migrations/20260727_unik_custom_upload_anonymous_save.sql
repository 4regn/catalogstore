-- Custom Upload deliberately doesn't require sign-in until checkout (unlike
-- AI Studio, which needs an account earlier to enforce the daily generation
-- limit). Uploading artwork the moment it's added to cart -- rather than
-- carrying the raw image bytes all the way to checkout, which was making
-- "Pay with Yoco" slow to redirect -- means a unik_designs row can exist
-- before there's a customer account to own it. auth_user_id starts null and
-- is set when the design is claimed at checkout.
alter table public.unik_designs alter column auth_user_id drop not null;

alter table public.unik_designs drop constraint if exists unik_designs_status_check;
alter table public.unik_designs add constraint unik_designs_status_check
  check (status in ('draft', 'processing', 'generated', 'saved', 'in_cart', 'checkout_started', 'paid', 'failed', 'expired'));
