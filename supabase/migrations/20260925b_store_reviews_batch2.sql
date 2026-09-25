-- Second batch of 5 WhatsApp review screenshots the seller shared directly
-- (Cactus Jack/Astroworld tanks, J. Cole hoodies x2, Rocky/fire sweatpants,
-- A-Reece tee). Two of the five had no caption text in the screenshot, so
-- their quote is left null -- the reviews page/carousel already handle a
-- missing quote (image-only card, see app/store/[slug]/reviews/page.tsx).
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-6.jpg', 'Thanks thanks thanks 😊❤️😊'),
    ('/4regn/testimonials/testimonial-7.jpg', null),
    ('/4regn/testimonials/testimonial-8.jpg', 'Thanks bro. 👊👍🔥'),
    ('/4regn/testimonials/testimonial-9.jpg', 'I have received my parcel 🤫🧡 I''m so happpyyyy ✨ I love my hoodie so much'),
    ('/4regn/testimonials/testimonial-10.jpg', null)
  ) as v(image_url, quote)
where s.subdomain = '4regn';
