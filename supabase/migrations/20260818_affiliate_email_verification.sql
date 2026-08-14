-- Affiliate signup already writes email_verified=false (app/api/affiliate/signup/route.ts)
-- and gates withdrawals on it, but nothing ever set it to true -- there was
-- no verification email/route to do so, just a "// TODO: send verification
-- email + welcome email via Resend" left in place. This adds the one thing
-- that was actually missing: a token to verify against. email_verified
-- itself already exists live (queried successfully by the working /me
-- route), just not captured in any migration file here, so it's not
-- recreated.
alter table public.affiliates
  add column if not exists email_verification_token text,
  add column if not exists email_verification_sent_at timestamptz;

create unique index if not exists affiliates_email_verification_token_idx
  on public.affiliates (email_verification_token)
  where email_verification_token is not null;
