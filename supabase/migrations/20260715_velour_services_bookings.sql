-- Services + Bookings for the Velour template (beauty/cosmetology services
-- storefronts). Mirrors the existing products/orders tables: no RLS, plain
-- client-side reads/writes gated at the app layer, same as every other
-- table in this schema.
-- Run this in your Supabase SQL editor.

create table if not exists services (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references sellers (id) on delete cascade,
  category    text not null default 'General',
  name        text not null,
  price       numeric not null default 0,
  media_url   text,
  media_type  text,                     -- 'video' | 'image' | null
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists services_seller_idx on services (seller_id, sort_order);

create table if not exists bookings (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null references sellers (id) on delete cascade,
  service_id    uuid references services (id) on delete set null,
  date          date not null,
  time_slot     text not null,
  booking_type  text not null default 'studio',  -- 'studio' | 'callout'
  status        text not null default 'pending', -- 'pending' | 'confirmed' | 'cancelled'
  client_name   text not null,
  client_phone  text not null,
  payment_method text,                     -- 'pay_later' | 'eft' | 'whatsapp'
  created_at    timestamptz not null default now()
);

create index if not exists bookings_seller_date_idx on bookings (seller_id, date);
