-- Seller-uploaded storefront review screenshots (4REGN's WhatsApp customer
-- reviews page + homepage carousel -- see app/store/[slug]/reviews/page.tsx
-- and FourRegnReviewsCarousel.tsx). Previously hardcoded as 5 fixed images
-- in app/store/[slug]/fourRegnReviews.ts; moved here so the seller can add
-- or remove their own reviews from the dashboard (My Store -> Reviews)
-- instead of needing a code change + redeploy for every new screenshot.
--
-- RLS follows the same pattern as order_tracking_history (see that
-- migration): the dashboard writes to this table directly from the
-- browser using the seller's own Supabase Auth session, and sellers.id IS
-- the auth.uid() for that session, so a straightforward seller_id =
-- auth.uid() policy is what actually scopes writes to the seller's own
-- rows. The storefront reads through supabaseAdmin (service role, server
-- side), which bypasses RLS entirely, so no separate public-read policy
-- is needed.
create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  image_url text not null,
  quote text,
  created_at timestamptz not null default now()
);

create index if not exists store_reviews_seller_idx on public.store_reviews(seller_id, created_at desc);

alter table public.store_reviews enable row level security;

drop policy if exists "Seller manages own store reviews" on public.store_reviews;
create policy "Seller manages own store reviews" on public.store_reviews for all
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

-- Seed with the 5 reviews already shipped as static files (see
-- public/4regn/testimonials/) so the homepage section and /reviews page
-- don't go blank the moment this table replaces that hardcoded list --
-- everything from here on is added by the seller via the dashboard.
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-1.jpg', 'Thank you 4REGN worldwide ❤️'),
    ('/4regn/testimonials/testimonial-2.jpg', 'I didn''t even get a chance to update you — I received these and they were perfect. Thank you so so much, you really did the most. 🌈'),
    ('/4regn/testimonials/testimonial-3.jpg', 'Thanks a lot for pulling through — they fit just the way I wanted them to 🔥'),
    ('/4regn/testimonials/testimonial-4.jpg', 'Hey, I got my parcel! I''m so excited, can''t wait to open it 📦❤️'),
    ('/4regn/testimonials/testimonial-5.jpg', 'I''m happy! ❤️')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
