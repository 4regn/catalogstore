-- Eleventh batch: 2 new reviews (the Chris Brown tee and the Riky Rick
-- tee + parcel bag in this message were repeats of testimonial-35 and
-- testimonial-14, and were skipped).
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-41.jpg', 'I received my parcel today morning, even though I''m not home but someone collected it. I am so happy because I know you never disappoint 😊❤️'),
    ('/4regn/testimonials/testimonial-42.jpg', 'We never die 💯 We multiply. Thanks 💯')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
