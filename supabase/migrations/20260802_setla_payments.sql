-- SETLA Payments customer, application, payment-plan and support records.
-- Sensitive decisions and financial state are written only by trusted APIs
-- using the service role. Customers can read only records linked to auth.uid().

create table if not exists public.setla_customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  address jsonb not null default '{}'::jsonb,
  application_status text not null default 'not_applied'
    check (application_status in ('not_applied','draft','pending','approved','declined','suspended')),
  identity_status text not null default 'not_started'
    check (identity_status in ('not_started','pending','verified','failed','manual_review')),
  approved_limit numeric(12,2) not null default 0 check (approved_limit >= 0),
  available_limit numeric(12,2) not null default 0 check (available_limit >= 0),
  payment_status text not null default 'no_active_plan'
    check (payment_status in ('no_active_plan','on_track','payment_due','overdue','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.setla_applications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.setla_customers(id) on delete cascade,
  monthly_income numeric(12,2) not null check (monthly_income >= 0),
  monthly_expenses numeric(12,2) not null check (monthly_expenses >= 0),
  status text not null default 'pending'
    check (status in ('draft','pending','approved','declined','manual_review','withdrawn')),
  decision_reason text,
  proposed_limit numeric(12,2) check (proposed_limit >= 0),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  retry_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.setla_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.setla_customers(id) on delete cascade,
  application_id uuid references public.setla_applications(id) on delete cascade,
  document_type text not null
    check (document_type in ('id_document','live_selfie','bank_statement','proof_of_address','proof_of_banking')),
  storage_path text not null,
  review_status text not null default 'pending'
    check (review_status in ('pending','verified','rejected','manual_review')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.setla_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.setla_customers(id) on delete cascade,
  bank_name text not null,
  account_holder_name text not null,
  account_type text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  provider_reference text not null,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected','manual_review')),
  is_refund_account boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists setla_one_refund_account_idx
  on public.setla_bank_accounts(customer_id) where is_refund_account;

create table if not exists public.setla_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.setla_customers(id) on delete restrict,
  -- orders.id is uuid (every PK in this schema is), not text -- a real FK
  -- here (instead of a loose unvalidated string) is what lets a SETLA order
  -- and its UNIK order stay provably in sync, and matches how every other
  -- cross-table link in this schema is done (e.g. orders.partner_id).
  unik_order_id uuid not null unique references public.orders(id) on delete restrict,
  payment_method text not null check (payment_method in ('pay_later','laybuy')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_amount numeric(12,2) not null default 0 check (delivery_amount >= 0),
  total numeric(12,2) not null check (total >= 0),
  order_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'payment_pending'
    check (status in ('payment_pending','partially_paid','paid','production','dispatched','delivered','cancelled','refunded')),
  production_locked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.setla_payment_plans (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.setla_customers(id) on delete restrict,
  order_id uuid not null unique references public.setla_orders(id) on delete restrict,
  plan_type text not null check (plan_type in ('pay_later','laybuy')),
  principal_amount numeric(12,2) not null check (principal_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'active'
    check (status in ('active','completed','overdue','cancelled','refunded')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.setla_instalments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.setla_payment_plans(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  amount numeric(12,2) not null check (amount > 0),
  due_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','processing','paid','failed','overdue','waived','refunded')),
  payment_provider_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, sequence_number)
);

create table if not exists public.setla_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.setla_customers(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.setla_appeals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.setla_customers(id) on delete cascade,
  application_id uuid references public.setla_applications(id) on delete set null,
  message text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','declined','withdrawn')),
  approved_limit numeric(12,2) check (approved_limit >= 0),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.setla_support_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.setla_customers(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','support','system')),
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists setla_applications_customer_idx on public.setla_applications(customer_id, created_at desc);
create index if not exists setla_orders_customer_idx on public.setla_orders(customer_id, created_at desc);
create index if not exists setla_plans_customer_idx on public.setla_payment_plans(customer_id, created_at desc);
create index if not exists setla_notifications_customer_idx on public.setla_notifications(customer_id, created_at desc);
create index if not exists setla_support_customer_idx on public.setla_support_messages(customer_id, created_at);

create or replace function public.setla_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists setla_customers_touch on public.setla_customers;
create trigger setla_customers_touch before update on public.setla_customers for each row execute function public.setla_touch_updated_at();
drop trigger if exists setla_applications_touch on public.setla_applications;
create trigger setla_applications_touch before update on public.setla_applications for each row execute function public.setla_touch_updated_at();
drop trigger if exists setla_bank_accounts_touch on public.setla_bank_accounts;
create trigger setla_bank_accounts_touch before update on public.setla_bank_accounts for each row execute function public.setla_touch_updated_at();
drop trigger if exists setla_orders_touch on public.setla_orders;
create trigger setla_orders_touch before update on public.setla_orders for each row execute function public.setla_touch_updated_at();
drop trigger if exists setla_plans_touch on public.setla_payment_plans;
create trigger setla_plans_touch before update on public.setla_payment_plans for each row execute function public.setla_touch_updated_at();

alter table public.setla_customers enable row level security;
alter table public.setla_applications enable row level security;
alter table public.setla_documents enable row level security;
alter table public.setla_bank_accounts enable row level security;
alter table public.setla_orders enable row level security;
alter table public.setla_payment_plans enable row level security;
alter table public.setla_instalments enable row level security;
alter table public.setla_notifications enable row level security;
alter table public.setla_appeals enable row level security;
alter table public.setla_support_messages enable row level security;

create or replace function public.is_own_setla_customer(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.setla_customers c where c.id = p_customer_id and c.auth_user_id = auth.uid());
$$;

revoke all on function public.is_own_setla_customer(uuid) from public, anon;
grant execute on function public.is_own_setla_customer(uuid) to authenticated;

drop policy if exists "SETLA customers read own profile" on public.setla_customers;
create policy "SETLA customers read own profile" on public.setla_customers for select using (auth.uid() = auth_user_id);
drop policy if exists "SETLA customers read own applications" on public.setla_applications;
create policy "SETLA customers read own applications" on public.setla_applications for select using (public.is_own_setla_customer(customer_id));
drop policy if exists "SETLA customers read own documents" on public.setla_documents;
create policy "SETLA customers read own documents" on public.setla_documents for select using (public.is_own_setla_customer(customer_id));
drop policy if exists "SETLA customers read own banks" on public.setla_bank_accounts;
create policy "SETLA customers read own banks" on public.setla_bank_accounts for select using (public.is_own_setla_customer(customer_id));
drop policy if exists "SETLA customers read own orders" on public.setla_orders;
create policy "SETLA customers read own orders" on public.setla_orders for select using (public.is_own_setla_customer(customer_id));
drop policy if exists "SETLA customers read own plans" on public.setla_payment_plans;
create policy "SETLA customers read own plans" on public.setla_payment_plans for select using (public.is_own_setla_customer(customer_id));
drop policy if exists "SETLA customers read own instalments" on public.setla_instalments;
create policy "SETLA customers read own instalments" on public.setla_instalments for select using (exists(select 1 from public.setla_payment_plans p where p.id = plan_id and public.is_own_setla_customer(p.customer_id)));
drop policy if exists "SETLA customers read own notifications" on public.setla_notifications;
create policy "SETLA customers read own notifications" on public.setla_notifications for select using (public.is_own_setla_customer(customer_id));
drop policy if exists "SETLA customers read own appeals" on public.setla_appeals;
create policy "SETLA customers read own appeals" on public.setla_appeals for select using (public.is_own_setla_customer(customer_id));
drop policy if exists "SETLA customers submit own appeals" on public.setla_appeals;
create policy "SETLA customers submit own appeals" on public.setla_appeals for insert with check (public.is_own_setla_customer(customer_id) and status = 'pending');
drop policy if exists "SETLA customers read own support" on public.setla_support_messages;
create policy "SETLA customers read own support" on public.setla_support_messages for select using (public.is_own_setla_customer(customer_id));
drop policy if exists "SETLA customers send support messages" on public.setla_support_messages;
create policy "SETLA customers send support messages" on public.setla_support_messages for insert with check (public.is_own_setla_customer(customer_id) and sender_type = 'customer');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('setla-private-documents','setla-private-documents',false,15728640,array['image/png','image/jpeg','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

