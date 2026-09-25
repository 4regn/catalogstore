-- Fourth batch: 4 new WhatsApp review screenshots (one duplicate of an
-- already-added review -- the Riky Rick tee + parcel bag also sent in
-- batch 3 -- was skipped rather than inserted twice).
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-16.jpg', 'I got my tees, thank you so much. I love them. ❤️'),
    ('/4regn/testimonials/testimonial-17.jpg', 'I''ve received my parcel ❤️👌🔥'),
    ('/4regn/testimonials/testimonial-18.jpg', 'Hey, I got them today, thank you so much ❤️🙏🙏🙏🙏'),
    ('/4regn/testimonials/testimonial-19.jpg', 'I hope you''re doing good — I only tried on the black one and they both fit me perfectly. Thank you, looking forward to order more ❤️')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
