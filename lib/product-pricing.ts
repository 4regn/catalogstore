export type PriceVariantGroup = {
  name?: string;
  options?: string[];
  priceDelta?: Record<string, number>;
};

export function variantPriceDelta(
  productVariants: unknown,
  selectedVariants: Record<string, string> | undefined
): number {
  if (!selectedVariants || !Array.isArray(productVariants)) return 0;
  return (productVariants as PriceVariantGroup[]).reduce((sum, group) => {
    const chosen = group?.name ? selectedVariants[group.name] : undefined;
    const delta = chosen ? group?.priceDelta?.[chosen] : undefined;
    return sum + (typeof delta === "number" && Number.isFinite(delta) ? delta : 0);
  }, 0);
}

export function effectiveProductPrice(
  basePrice: unknown,
  productVariants: unknown,
  selectedVariants?: Record<string, string>
): number {
  return Math.max(0, (Number(basePrice) || 0) + variantPriceDelta(productVariants, selectedVariants));
}

export function minimumProductPrice(basePrice: unknown, productVariants: unknown): number {
  if (!Array.isArray(productVariants)) return Math.max(0, Number(basePrice) || 0);
  const minimumDelta = (productVariants as PriceVariantGroup[]).reduce((sum, group) => {
    const options = Array.isArray(group.options) ? group.options : [];
    if (!options.length) return sum;
    const deltas = options.map((option) => Number(group.priceDelta?.[option]) || 0);
    return sum + Math.min(...deltas);
  }, 0);
  return Math.max(0, (Number(basePrice) || 0) + minimumDelta);
}

export function hasPurchasableVariantPath(productVariants: unknown): boolean {
  if (!Array.isArray(productVariants) || productVariants.length === 0) return true;
  return (productVariants as PriceVariantGroup[]).every((group) =>
    typeof group?.name === "string" && group.name.trim().length > 0 &&
    Array.isArray(group.options) && group.options.some((option) => typeof option === "string" && option.trim().length > 0)
  );
}
