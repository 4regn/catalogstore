-- Seller-scoped storefront customer accounts, activation codes, sessions,
-- and wishlists. Imported public.customers rows remain the CRM identity;
-- this adds credentials without copying or exposing their personal data.

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  email text not null,
  password_hash text,
  activated_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, customer_id),
  unique (seller_id, email)
);

create table if not exists public.customer_account_codes (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_account_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_wishlist_items (
  account_id uuid not null references public.customer_accounts(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, product_id)
);

create index if not exists customer_account_codes_lookup_idx
  on public.customer_account_codes (seller_id, email, created_at desc);
create index if not exists customer_account_sessions_lookup_idx
  on public.customer_account_sessions (token_hash, expires_at);
create index if not exists customer_wishlist_account_idx
  on public.customer_wishlist_items (account_id, created_at desc);

alter table public.customer_accounts enable row level security;
alter table public.customer_account_codes enable row level security;
alter table public.customer_account_sessions enable row level security;
alter table public.customer_wishlist_items enable row level security;
-- No browser policies: all credential, order, and wishlist access goes
-- through service-role API routes after an HttpOnly session check.

