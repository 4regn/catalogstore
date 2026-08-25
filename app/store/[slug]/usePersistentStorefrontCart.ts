"use client";

import { Dispatch, SetStateAction, useEffect, useState } from "react";

type PersistableCartItem = {
  product: { id: string };
  qty: number;
  selectedVariants: Record<string, string>;
};

const cartKey = (slug: string) => `catalogstore-cart-v1:${slug.trim().toLowerCase()}`;

function safeCart(value: unknown): PersistableCartItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item: any) => item?.product?.id && Number(item?.qty) > 0)
    .slice(0, 100)
    .map((item: any) => ({
      product: item.product,
      qty: Math.min(999, Math.max(1, Math.floor(Number(item.qty)))),
      selectedVariants: item.selectedVariants && typeof item.selectedVariants === "object" ? item.selectedVariants : {},
    }));
}

export function usePersistentStorefrontCart<T extends PersistableCartItem>(
  slug: string,
  cart: T[],
  setCart: Dispatch<SetStateAction<T[]>>,
  enabled = true,
) {
  const [hydratedSlug, setHydratedSlug] = useState("");

  useEffect(() => {
    if (!enabled || !slug) return;
    try {
      const stored = window.localStorage.getItem(cartKey(slug));
      if (stored) setCart(safeCart(JSON.parse(stored)) as T[]);
    } catch {
      // A malformed or blocked localStorage value must never break checkout.
    } finally {
      setHydratedSlug(slug);
    }

    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key !== cartKey(slug) || !event.newValue) return;
      try { setCart(safeCart(JSON.parse(event.newValue)) as T[]); } catch { /* ignore */ }
    };
    window.addEventListener("storage", syncAcrossTabs);
    return () => window.removeEventListener("storage", syncAcrossTabs);
  }, [enabled, setCart, slug]);

  useEffect(() => {
    if (!enabled || !slug || hydratedSlug !== slug) return;
    try { window.localStorage.setItem(cartKey(slug), JSON.stringify(cart)); } catch { /* storage can be unavailable */ }
  }, [cart, enabled, hydratedSlug, slug]);
}
