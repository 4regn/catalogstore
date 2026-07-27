-- Custom Upload deliberately doesn't require sign-in until checkout (unlike
-- AI Studio, which needs an account earlier to enforce the daily generation
-- limit). Uploading artwork the moment it's added to cart -- rather than
-- carrying the raw image bytes all the way to checkout, which was making
-- "Pay with Yoco" slow to redirect -- means a unik_designs row can exist
-- before there's a customer account to own it. auth_user_id starts null and
-- is set when the design is claimed at checkout.
alter table public.unik_designs alter column auth_user_id drop not null;

-- Find and drop whatever the existing status check constraint is actually
-- named (rather than assuming Postgres's default auto-generated name),
-- then replace it with one that also allows 'draft'.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.unik_designs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.unik_designs drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.unik_designs add constraint unik_designs_status_check
  check (status in ('draft', 'processing', 'generated', 'saved', 'in_cart', 'checkout_started', 'paid', 'failed', 'expired'));
