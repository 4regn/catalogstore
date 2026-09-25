-- Sixth batch: only 2 new reviews -- the other 3 images in this message
-- were repeats of ones added in batch 5 (Kanye/Tupac package, "Danko",
-- "Girls need" hoodie) and were skipped.
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-25.jpg', 'Thank you very much ❤️ I got my parcel today ❤️ I can''t wait to order again 😄'),
    ('/4regn/testimonials/testimonial-26.jpg', 'Got it, thank you very much, I love it!! 🥹💚')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
