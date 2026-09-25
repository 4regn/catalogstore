export type StoreReview = {
  id: string;
  image_url: string;
  quote: string | null;
};

// Fisher-Yates-style random sample, no replacement (returns fewer than
// `count` if the pool itself is smaller). The seller's full reviews
// gallery in the `store_reviews` table can grow well past what the
// homepage should ever render at once -- see FourRegnReviewsCarousel.tsx's
// own comment on why only a random subset renders there, not everything.
export function sampleReviews(reviews: StoreReview[], count: number): StoreReview[] {
  const pool = [...reviews];
  const picked: StoreReview[] = [];
  while (pool.length && picked.length < count) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}
