alter table public.products
  add column if not exists size_chart_html text;

comment on column public.products.size_chart_html is
  'Admin-managed product size chart table HTML. Storefronts parse and render only table text; scripts and arbitrary markup are never executed.';
