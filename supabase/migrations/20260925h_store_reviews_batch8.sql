-- Eighth batch: 4 new reviews (the La Flame hoodie in this message was a
-- repeat of testimonial-26 and was skipped).
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-31.jpg', 'Hello, I received my order and thank you so much'),
    ('/4regn/testimonials/testimonial-32.jpg', 'I received the parcel, thank you so much 😊'),
    ('/4regn/testimonials/testimonial-33.jpg', 'I have received my parcel, thank you so much 🙏❤️'),
    ('/4regn/testimonials/testimonial-34.jpg', 'Just received, thank you')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
