-- Adds phone + WhatsApp follow-up consent to UNIK customer profiles.
-- Previously a phone number was only ever captured at checkout, so a
-- customer who generated a design in AI Studio and never opened checkout
-- had no contact info anywhere in the system -- nothing for the Brand
-- Manager "Follow-ups" panel to reach them on. Consent is tracked
-- explicitly and separately from the phone number itself, since providing
-- a phone number is not the same as agreeing to be messaged about it.
--
-- Run manually in Supabase SQL editor.
alter table public.unik_customer_profiles
  add column if not exists phone text,
  add column if not exists whatsapp_consent boolean not null default false,
  add column if not exists whatsapp_consent_at timestamptz;
