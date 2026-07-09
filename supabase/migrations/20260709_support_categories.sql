-- Support inbox categories + seller-linked conversations
-- Run this in your Supabase SQL editor.

-- Lets the admin inbox split conversations into folders: 'general'
-- (marketing-site visitors), 'domain' (sellers asking about custom domain
-- setup), and seller-linked threads (identified by seller_id, grouped by
-- seller in the "Seller Inboxes" view regardless of category).
alter table support_conversations add column if not exists category text not null default 'general';
alter table support_conversations add column if not exists seller_id uuid references sellers (id) on delete set null;

create index if not exists sc_category_idx on support_conversations (category, last_message_at desc);
create index if not exists sc_seller_idx   on support_conversations (seller_id, last_message_at desc);
