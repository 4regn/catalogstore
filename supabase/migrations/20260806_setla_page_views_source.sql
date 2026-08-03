-- Explicit traffic-source tag (from a ?utm_source= link param, e.g.
-- "whatsapp"), captured alongside the existing referrer/host columns.
-- Needed because document.referrer alone badly under-counts channels like
-- WhatsApp, whose in-app browser strips it on most devices.
alter table public.setla_page_views add column if not exists source text;
create index if not exists setla_page_views_source_idx on public.setla_page_views(source, created_at desc);
