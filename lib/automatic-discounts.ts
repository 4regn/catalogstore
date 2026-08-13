import { SupabaseClient } from "@supabase/supabase-js";

export type AutomaticBxgyDiscount = {
  id: string;
  title: string;
  buy_quantity: number;
  buy_collection_names: string[];
  get_quantity: number;
  get_collection_names: string[];
  effect_type: "fixed_amount" | "percentage";
  effect_value: number;
};

type PricedLineItem = { name: string; price: number; qty: number; category?: string | null };

// Same comma-list collection-matching convention used everywhere else on
// this platform (see FourRegnStore.tsx's own category-token splitting).
// Normalized (lowercased/trimmed) on both sides -- the rule's
// buy_collection_names/get_collection_names come from Shopify's own
// collection title casing via the import script, which isn't guaranteed to
// byte-for-byte match products.category's casing (backfilled separately,
// by hand in places), even when both plainly refer to the same collection.
// A silent case mismatch here would fail matchesAnyCollection with no error
// anywhere -- exactly the failure mode this platform's other collection
// matching (pInCat in FourRegnStore.tsx) doesn't have, since that comparison
// runs case-sensitively today, only reads from products.category, and has
// never needed to reconcile against a second, independently-sourced list.
function normalizeCollectionName(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase();
}

function categoryTokens(category: string | null | undefined): string[] {
  return (category || "").split(",").map((c) => normalizeCollectionName(c)).filter(Boolean);
}

function matchesAnyCollection(category: string | null | undefined, names: string[]): boolean {
  if (!names.length) return false;
  const tokens = categoryTokens(category);
  return names.some((n) => tokens.includes(normalizeCollectionName(n)));
}

// Expands qty into individual priced units, cheapest first -- Shopify's own
// real behavior for BXGY: when items tie for "cheapest", the discount goes
// to the lowest-priced eligible units, not an arbitrary/undefined order.
type PricedUnit = { price: number; lineIndex: number; unitIndex: number };

function expandUnits(items: { item: PricedLineItem; lineIndex: number }[]): PricedUnit[] {
  const units: PricedUnit[] = [];
  for (const { item, lineIndex } of items) {
    for (let n = 0; n < item.qty; n++) units.push({ price: item.price, lineIndex, unitIndex: n });
  }
  return units.sort((a, b) => a.price - b.price || a.lineIndex - b.lineIndex || a.unitIndex - b.unitIndex);
}

export type AutomaticDiscountResult = {
  totalDiscount: number;
  applied: { title: string; amount: number }[];
  lineDiscounts: { lineIndex: number; amount: number; titles: string[] }[];
};

/* Computes automatic Buy X Get Y savings for a cart, mirroring exactly how
   these worked as DiscountAutomaticBxgy on Shopify (see
   scripts/inspect-4regn-bxgy-discounts.ts) -- applies the moment enough
   qualifying items are present, no code needed. Pure/stateless: takes
   already-loaded discount rules and line items (each item's product
   category attached) and returns the total reduction plus a per-rule
   breakdown for display. Called from both /api/checkout/place-order (the
   real charge) and the storefront's own cart -- both must compute the
   exact same thing, so this is the one implementation either side calls,
   never reimplemented separately. */
export function computeAutomaticBxgyDiscount(
  rules: AutomaticBxgyDiscount[],
  lineItems: PricedLineItem[]
): AutomaticDiscountResult {
  const applied: { title: string; amount: number }[] = [];
  const lineAllocations = new Map<number, { amount: number; titles: Set<string> }>();
  let totalDiscount = 0;

  for (const rule of rules) {
    const indexedItems = lineItems.map((item, lineIndex) => ({ item, lineIndex }));
    const buyEligible = indexedItems.filter(({ item }) => matchesAnyCollection(item.category, rule.buy_collection_names));
    const getEligible = indexedItems.filter(({ item }) => matchesAnyCollection(item.category, rule.get_collection_names));
    if (!buyEligible.length || !getEligible.length) continue;

    // Every real 4regn rule has an IDENTICAL buy/get collection (buy 1
    // hoodie, get another hoodie from the same collection discounted) --
    // handled by pooling all eligible units together and slicing whole
    // groups, so a unit can never be double-counted as both a "buy" and a
    // "get" item. Genuinely distinct buy/get sets (allowed by Shopify's
    // schema, not currently used by any real 4regn rule) fall through to
    // the simpler branch below, which assumes no overlap between the two
    // sets -- a partially-overlapping pair of collections isn't handled
    // precisely, since nothing real needs it yet.
    const sameSet = rule.buy_collection_names.length === rule.get_collection_names.length &&
      rule.buy_collection_names.every((n) => rule.get_collection_names.includes(n));

    const groupSize = rule.buy_quantity + rule.get_quantity;
    let ruleDiscount = 0;
    const allocate = (unit: PricedUnit) => {
      const amount = rule.effect_type === "percentage" ? unit.price * (rule.effect_value / 100) : Math.min(rule.effect_value, unit.price);
      ruleDiscount += amount;
      const allocation = lineAllocations.get(unit.lineIndex) || { amount: 0, titles: new Set<string>() };
      allocation.amount += amount;
      allocation.titles.add(rule.title);
      lineAllocations.set(unit.lineIndex, allocation);
    };

    if (sameSet) {
      const units = expandUnits(buyEligible);
      const groups = Math.floor(units.length / groupSize);
      for (let g = 0; g < groups; g++) {
        const groupUnits = units.slice(g * groupSize, (g + 1) * groupSize);
        const getUnits = groupUnits.slice(0, rule.get_quantity);
        for (const unit of getUnits) allocate(unit);
      }
    } else {
      const buyUnits = expandUnits(buyEligible);
      const getUnits = expandUnits(getEligible);
      const groups = Math.min(Math.floor(buyUnits.length / rule.buy_quantity), Math.floor(getUnits.length / rule.get_quantity));
      for (let g = 0; g < groups; g++) {
        const slice = getUnits.slice(g * rule.get_quantity, (g + 1) * rule.get_quantity);
        for (const unit of slice) allocate(unit);
      }
    }

    if (ruleDiscount > 0) {
      applied.push({ title: rule.title, amount: Math.round(ruleDiscount * 100) / 100 });
      totalDiscount += ruleDiscount;
    }
  }

  return {
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    applied,
    lineDiscounts: [...lineAllocations.entries()].map(([lineIndex, allocation]) => ({
      lineIndex,
      amount: Math.round(allocation.amount * 100) / 100,
      titles: [...allocation.titles],
    })),
  };
}

export async function fetchActiveAutomaticBxgyDiscounts(admin: SupabaseClient, sellerId: string): Promise<AutomaticBxgyDiscount[]> {
  const now = new Date().toISOString();
  const { data } = await admin
    .from("automatic_bxgy_discounts")
    .select("id, title, buy_quantity, buy_collection_names, get_quantity, get_collection_names, effect_type, effect_value, starts_at, ends_at")
    .eq("seller_id", sellerId)
    .eq("active", true);
  return (data || []).filter((r: any) => (!r.starts_at || r.starts_at <= now) && (!r.ends_at || r.ends_at >= now));
}
