export type FourRegnTestimonial = {
  src: string;
  width: number;
  height: number;
  quote: string;
};

// Real WhatsApp messages from 4REGN customers -- screenshots of parcels
// arriving and people wearing what they ordered, sent to the brand
// directly. Quotes below are the customers' own words, only lightly
// cleaned up for spelling/punctuation, never rewritten -- the screenshot
// next to the quote is the proof, so the text has to still sound like the
// real message in it, not a marketing paraphrase of it.
export const FOUR_REGN_TESTIMONIALS: FourRegnTestimonial[] = [
  { src: "/4regn/testimonials/testimonial-1.jpg", width: 918, height: 960, quote: "Thank you 4REGN worldwide ❤️" },
  { src: "/4regn/testimonials/testimonial-2.jpg", width: 840, height: 960, quote: "I didn't even get a chance to update you — I received these and they were perfect. Thank you so so much, you really did the most. 🌈" },
  { src: "/4regn/testimonials/testimonial-3.jpg", width: 636, height: 960, quote: "Thanks a lot for pulling through — they fit just the way I wanted them to 🔥" },
  { src: "/4regn/testimonials/testimonial-4.jpg", width: 632, height: 960, quote: "Hey, I got my parcel! I'm so excited, can't wait to open it 📦❤️" },
  { src: "/4regn/testimonials/testimonial-5.jpg", width: 888, height: 960, quote: "I'm happy! ❤️" },
];
