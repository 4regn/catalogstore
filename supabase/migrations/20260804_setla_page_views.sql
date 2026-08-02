-- Lightweight page-view analytics for the SETLA static pages
-- (public/setla/*.html). Insert-only from an unauthenticated client (most
-- visitors haven't signed up yet), read-only from the admin dashboard --
-- same service-role-only RLS shape as admin_audit_log/setla_admins.
create table if not exists public.setla_page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  visitor_id text not null,
  customer_id uuid references public.setla_customers(id) on delete set null,
  referrer text,
  created_at timestamptz not null default now()
);

alter table public.setla_page_views enable row level security;
-- No policies = service-role only. The tracking route runs with the admin
-- client, same as every other SETLA write path.

create index if not exists setla_page_views_created_at_idx on public.setla_page_views(created_at desc);
create index if not exists setla_page_views_path_idx on public.setla_page_views(path, created_at desc);
