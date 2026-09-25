-- Ninth batch: 5 new reviews (Chris Brown tee, a screenshot from a
-- different WhatsApp conversation thanking for a portrait tee, a second
-- Chris Brown tee + Tupac/DMX tee, a second Riky Rick tee from a
-- different customer, and the Billie Eilish hoodie).
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-35.jpg', 'Hey, I got my order. Thank you very much, I love it. ❤️🔥'),
    ('/4regn/testimonials/testimonial-36.jpg', 'Got it, bro, thanks so much ❤️🙏🔥'),
    ('/4regn/testimonials/testimonial-37.jpg', 'Received the parcel again, thank you 😊👍'),
    ('/4regn/testimonials/testimonial-38.jpg', 'Received it! 💕🙏 Thank you!'),
    ('/4regn/testimonials/testimonial-39.jpg', 'I love it, the quality is a 11/10 🔥')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
