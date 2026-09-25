-- Seventh batch: 4 new reviews (one image in this message, the "Girls
-- need" tweet hoodie, was a repeat of testimonial-15 and was skipped).
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-27.jpg', 'I''m very much happy, thank you very much 😌🥰😙 they fit me perfectly well'),
    ('/4regn/testimonials/testimonial-28.jpg', 'I got my order, thank you so much ❤️'),
    ('/4regn/testimonials/testimonial-29.jpg', 'Received my parcel yesterday 😊 they fit the way I wanted them to 🔥 thank you!❤️'),
    ('/4regn/testimonials/testimonial-30.jpg', 'Just got the package, love the hoodies 🤝 Thank you once more')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
