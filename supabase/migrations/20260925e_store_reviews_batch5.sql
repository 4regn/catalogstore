-- Fifth batch: 5 new WhatsApp review screenshots. "Danko" (the PAXI/Nike
-- tee) had appeared in earlier messages but never actually made it into a
-- prior batch -- confirmed against every quote already inserted before
-- adding it here, so this is a genuine addition, not a duplicate.
insert into public.store_reviews (seller_id, image_url, quote)
select s.id, v.image_url, v.quote
from public.sellers s,
  (values
    ('/4regn/testimonials/testimonial-20.jpg', 'Package received 😊. I''m happy with them. 😻❤️'),
    ('/4regn/testimonials/testimonial-21.jpg', 'I got the T-shirt, bro, I love it. Danko 🙏'),
    ('/4regn/testimonials/testimonial-22.jpg', 'I am very very very super excited 🔥🔥🔥🔥🔥🔥🔥 I''m just waiting for another order now... 4REGN doing the most'),
    ('/4regn/testimonials/testimonial-23.jpg', 'Parcel 📦 received 🎉! Dankie san 👏'),
    ('/4regn/testimonials/testimonial-24.jpg', 'She God them thank you so much!')
  ) as v(image_url, quote)
where s.subdomain = '4regn';
