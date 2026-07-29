// Shared between /api/unik/checkout/create and /api/unik/partners/checkout/create
// -- an AI Studio design's `garment` value maps to a real seller product by
// name, whose price is the single source of truth for what a design costs
// at checkout (never trust a client-supplied price).
export const PRODUCT_BY_GARMENT: Record<string, string> = {
  tee: "AI Tee",
  hoodie: "AI Hoodie",
  "tee-budget": "AI Tee — Budget (A4)",
};
