-- Which domain a page view actually came from (e.g. setla.4regn.com vs
-- the regular platform-hosted SETLA pages) -- needed to tell whether the
-- 4regn demand-validation landing page is actually driving traffic/
-- signups, not just how many views SETLA gets overall.
alter table public.setla_page_views add column if not exists host text;
create index if not exists setla_page_views_host_idx on public.setla_page_views(host, created_at desc);
