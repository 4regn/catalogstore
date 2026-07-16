-- Velour: booking contact details, PayFast payment tracking, and the
-- seller-facing customer inbox (storefront live chat).
-- Run this in your Supabase SQL editor.

alter table bookings add column if not exists client_email text;
alter table bookings add column if not exists client_address text;
alter table bookings add column if not exists payfast_payment_id text;

-- 'pending' | 'awaiting_payment' | 'confirmed' | 'cancelled' -- status
-- already existed as free text, awaiting_payment is new (booking created,
-- redirected to PayFast, not yet paid).

-- Seller-facing unread counter for customer storefront-chat conversations,
-- separate from admin_unread (the platform admin's own inbox counter).
alter table support_conversations add column if not exists seller_unread integer not null default 0;
