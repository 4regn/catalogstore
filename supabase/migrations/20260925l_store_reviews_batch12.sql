-- Twelfth batch: only 1 new review -- the other 4 images in this message
-- were repeats of testimonial-34, testimonial-41, testimonial-31 and
-- testimonial-17, and were skipped.
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-43.jpg', 'Thanks, I got the Tee''s I am happy ❤️😥')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
