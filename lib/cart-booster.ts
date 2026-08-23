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
  const ordinaryCeiling = Math.min(399, Math.max(149, gap + 100, gap * 2.5));
  const strongRelationCeiling = Math.min(699, Math.max(349, gap + 250));

  return args.candidates
    .filter((candidate) => !cartIds.has(candidate.id) && candidate.in_stock !== false)
    .map((candidate) => {
      const price = minimumProductPrice(candidate.price, candidate.variants);
      const candidateTokens = tokens(candidate);
      const candidateCategories = categories(candidate);
      const sharedTheme = Math.max(0, ...cartTokens.map((set) => sharedCount(set, candidateTokens)));
      const sharedCollection = Math.max(0, ...cartCategories.map((set) => sharedCount(set, candidateCategories)));
      const manual = manualIds.has(candidate.id);
      const accessory = isAccessory(candidate);
      const stronglyRelated = manual || sharedTheme > 0 || sharedCollection > 0;
      const withinCeiling = price <= (stronglyRelated ? strongRelationCeiling : ordinaryCeiling);
      const resultingSubtotal = Math.max(0, args.projectedSubtotal?.(candidate, price) ?? (args.payableSubtotal + price));
      const unlocks = resultingSubtotal >= threshold;
      const overshoot = Math.max(0, price - gap);
      const shortfall = Math.max(0, gap - price);
      const reason: RankedCartBoosterProduct["reason"] = manual ? "manual" : sharedTheme > 0 ? "theme" : sharedCollection > 0 ? "collection" : unlocks ? "gap" : accessory ? "accessory" : "popular";
      const score =
        (manual ? 1_000_000 : 0) +
        sharedTheme * 50_000 + sharedCollection * 25_000 +
        (unlocks ? 10_000 : 0) +
        (accessory ? 2_000 : 0) +
        marginRatio(candidate, price) * 500 -
        overshoot * 12 - shortfall * 18 -
        Math.max(0, Number(candidate.sort_order) || 0) * 0.01;
      return { candidate, price, resultingSubtotal, score, unlocks, withinCeiling, reason };
    })
    .filter((entry) => entry.price > 0 && (entry.withinCeiling || entry.reason === "manual"))
    .sort((a, b) => b.score - a.score || a.price - b.price || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, args.limit ?? 3)
    .map(({ candidate, price, resultingSubtotal, unlocks, reason }) => ({
      ...candidate,
      recommendationPrice: price,
      resultingSubtotal: Math.round(resultingSubtotal * 100) / 100,
      unlocksFreeDelivery: unlocks,
      effectiveUpgradeCost: unlocks && price > FOUR_REGN_STANDARD_DELIVERY_PRICE ? price - FOUR_REGN_STANDARD_DELIVERY_PRICE : null,
      reason,
    }));
}
