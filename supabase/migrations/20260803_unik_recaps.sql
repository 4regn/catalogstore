-- Lets a saved recap be reloaded later into recap.html/recap-custom.html
-- instead of redoing the whole setup (re-picking photos, re-typing name/
-- tagline, re-selecting style) whenever a Brand Manager or Partner
-- forgets to export/screen-record it the first time. Shared by both
-- roles -- either can browse and reload anything saved for this seller.
--
-- Run manually in Supabase SQL editor (repo convention).
create table if not exists public.unik_recaps (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  flavor text not null check (flavor in ('ai-studio', 'custom-upload')),
  garment text not null,
  colour text not null,
  size text not null,
  name text,
  tagline text,
  style_id text,
  photo_urls jsonb not null default '[]',
  design_url text,
  design_back_url text,
  mockup_url text,
  created_by_role text not null check (created_by_role in ('brand-manager', 'partner')),
  created_by_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists unik_recaps_seller_idx on public.unik_recaps (seller_id, created_at desc);

alter table public.unik_recaps enable row level security;
-- No policies: every read/write goes through the service-role admin
-- client in app/api/unik/recaps/*, which bypasses RLS -- this just
-- locks the table down from any direct anon/authenticated access.
