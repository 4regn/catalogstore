-- Custom domain support for the Domains page. Run manually in Supabase SQL editor.

alter table sellers
  add column if not exists custom_domain text unique,
  add column if not exists custom_domain_status text; -- 'pending' | 'verified' | 'misconfigured' | null

create index if not exists sellers_custom_domain_idx on sellers (custom_domain) where custom_domain is not null;
