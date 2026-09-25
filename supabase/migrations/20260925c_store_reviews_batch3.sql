-- Third batch of 5 WhatsApp review screenshots the seller shared directly
-- (Frank Ocean hoodie, Yeezus hoodie, Riky Rick tee x2 from the same
-- conversation, and a tweet-print hoodie).
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-11.jpg', 'Hi, got it, thank you 😍'),
    ('/4regn/testimonials/testimonial-12.jpg', 'Bro I got my items 👏 perfectly fit, am happy'),
    ('/4regn/testimonials/testimonial-13.jpg', 'I received the parcel 🔥 thank you so much 🙏 & it was a pleasure doing business with you & I''m looking forward to work with you guys. Thank you so much 🔥 love the quality also 👌👌👌💯'),
    ('/4regn/testimonials/testimonial-14.jpg', 'Thank you, I have received my order'),
    ('/4regn/testimonials/testimonial-15.jpg', 'I got my parcel, thanks ❤️')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
