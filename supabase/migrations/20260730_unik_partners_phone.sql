-- Captures a partner's phone number at signup, alongside their existing
-- name/email -- run manually in the Supabase SQL editor (repo convention).
alter table public.unik_partners
  add column if not exists phone text;
