-- Tenth batch: only 1 new review -- the other 4 images in this message
-- were repeats of testimonial-34, testimonial-13, testimonial-17 and
-- testimonial-25, and were skipped.
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-40.jpg', 'Got my order. Thank you so much 😍🔥❤️❤️')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
