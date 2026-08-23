import { minimumProductPrice } from "./product-pricing";

export const FOUR_REGN_CART_BOOSTER_THRESHOLD = 449;
export const FOUR_REGN_STANDARD_DELIVERY_PRICE = 60;
export const CART_BOOSTER_RELATIONSHIP_KEY = "cart_booster_product_ids";

export type CartBoosterProduct = {
  id: string;
  name: string;
  price: number;
  old_price?: number | null;
  category?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  handle?: string | null;
  tags?: string[] | null;
  variants?: unknown;
  in_stock?: boolean | null;
  status?: string | null;
  sort_order?: number | null;
  metafields?: Record<string, unknown> | null;
};

export type RankedCartBoosterProduct = CartBoosterProduct & {
  recommendationPrice: number;
  resultingSubtotal: number;
  unlocksFreeDelivery: boolean;
  effectiveUpgradeCost: number | null;
  thresholdOverage: number;
  lowFriction: boolean;
  reason: "manual" | "theme" | "collection" | "gap" | "accessory" | "popular";
};

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return [];
}

export function cartBoosterRelationshipIds(product: CartBoosterProduct): string[] {
  return list(product.metafields?.[CART_BOOSTER_RELATIONSHIP_KEY]);
}

const COMMON_WORDS = new Set(["the", "and", "for", "with", "new", "mens", "men", "womens", "women", "unisex", "graphic", "premium", "standard", "printed", "oversized", "tee", "tees", "hoodie", "hoodies", "shirt", "shirts", "collection"]);
function tokens(product: CartBoosterProduct): Set<string> {
  const raw = [product.name, product.category || "", ...(product.tags || [])].join(" ").toLowerCase();
  return new Set(raw.split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !COMMON_WORDS.has(token)));
}

function categories(product: CartBoosterProduct): Set<string> {
  return new Set((product.category || "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean));
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

function isAccessory(product: CartBoosterProduct): boolean {
  return /cap|beanie|accessor|bag|sock|belt|wallet|jewel|hat/i.test([product.name, product.category, ...(product.tags || [])].join(" "));
}

function marginRatio(product: CartBoosterProduct, price: number): number {
  const raw = product.metafields?.cost_price ?? product.metafields?.supplier_cost ?? product.metafields?.cost;
  const cost = Number(raw);
  return Number.isFinite(cost) && cost >= 0 && price > 0 ? Math.max(0, (price - cost) / price) : 0;
}

export function rankCartBoosterProducts(args: {
  cartProducts: CartBoosterProduct[];
  candidates: CartBoosterProduct[];
  payableSubtotal: number;
  threshold?: number;
  limit?: number;
  projectedSubtotal?: (candidate: CartBoosterProduct, recommendationPrice: number) => number;
}): RankedCartBoosterProduct[] {
  const threshold = args.threshold ?? FOUR_REGN_CART_BOOSTER_THRESHOLD;
  const gap = Math.max(0, threshold - args.payableSubtotal);
  if (gap <= 0) return [];

  const cartIds = new Set(args.cartProducts.map((product) => product.id));
  const manualIds = new Set(args.cartProducts.flatMap(cartBoosterRelationshipIds));
  const cartTokens = args.cartProducts.map(tokens);
  const cartCategories = args.cartProducts.map(categories);
  return args.candidates
    .filter((candidate) => !cartIds.has(candidate.id) && candidate.in_stock !== false && candidate.status !== "draft")
    .map((candidate) => {
      const price = minimumProductPrice(candidate.price, candidate.variants);
      const candidateTokens = tokens(candidate);
      const candidateCategories = categories(candidate);
      const sharedTheme = Math.max(0, ...cartTokens.map((set) => sharedCount(set, candidateTokens)));
      const sharedCollection = Math.max(0, ...cartCategories.map((set) => sharedCount(set, candidateCategories)));
      const manual = manualIds.has(candidate.id);
      const accessory = isAccessory(candidate);
      const resultingSubtotal = Math.max(0, args.projectedSubtotal?.(candidate, price) ?? (args.payableSubtotal + price));
      const unlocks = resultingSubtotal >= threshold;
      const thresholdOverage = Math.max(0, resultingSubtotal - threshold);
      const preferredFit = unlocks && price >= gap && price <= gap + 100;
      const variantGroups = Array.isArray(candidate.variants) ? candidate.variants : [];
      const lowFriction = variantGroups.length === 0;
      const reason: RankedCartBoosterProduct["reason"] = manual ? "manual" : sharedTheme > 0 ? "theme" : sharedCollection > 0 ? "collection" : unlocks ? "gap" : accessory ? "accessory" : "popular";
      // The cheapest legitimate way to unlock free delivery must always win.
      // Relationship, category and margin are only tie-breakers after a
      // product reaches the threshold. This prevents a related R349 hoodie
      // from displacing a R99 accessory when the customer is R99 away.
      const fitGroup = preferredFit ? 0 : unlocks ? 1 : 2;
      const relationshipScore = (manual ? 3 : 0) + sharedTheme * 2 + sharedCollection + (accessory ? 0.25 : 0) + marginRatio(candidate, price) * 0.01;
      return { candidate, price, resultingSubtotal, unlocks, thresholdOverage, lowFriction, fitGroup, relationshipScore, reason };
    })
    // The primary upsell must actually unlock delivery. A non-unlocking
    // option is never useful in this flow and would leave the shopper short.
    .filter((entry) => entry.price > 0 && entry.unlocks)
    .sort((a, b) =>
      a.fitGroup - b.fitGroup ||
      a.thresholdOverage - b.thresholdOverage ||
      a.price - b.price ||
      Number(b.lowFriction) - Number(a.lowFriction) ||
      b.relationshipScore - a.relationshipScore ||
      a.candidate.name.localeCompare(b.candidate.name)
    )
    .slice(0, args.limit ?? 36)
    .map(({ candidate, price, resultingSubtotal, unlocks, thresholdOverage, lowFriction, reason }) => ({
      ...candidate,
      recommendationPrice: price,
      resultingSubtotal: Math.round(resultingSubtotal * 100) / 100,
      unlocksFreeDelivery: unlocks,
      effectiveUpgradeCost: unlocks && price > FOUR_REGN_STANDARD_DELIVERY_PRICE ? price - FOUR_REGN_STANDARD_DELIVERY_PRICE : null,
      thresholdOverage: Math.round(thresholdOverage * 100) / 100,
      lowFriction,
      reason,
    }));
}
