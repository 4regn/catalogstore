"use server";

import { revalidatePath } from "next/cache";

export async function revalidateStore(slug: string) {
  if (!slug) return;
  revalidatePath(`/store/${slug}`);
  revalidatePath(`/store/${slug}/p/[productId]`, "page");
  revalidatePath(`/store/${slug}/c/[collection]`, "page");
  // Previously missing -- these are real, live storefront routes (4regn's
  // actual SEO-slug product URLs, its collections index, and every
  // template's policy pages) that an editor save never refreshed, leaving
  // them to go stale for up to a full `revalidate` window instead of
  // updating immediately like the routes above already did.
  revalidatePath(`/store/${slug}/products/[handle]`, "page");
  revalidatePath(`/store/${slug}/collections`);
  revalidatePath(`/store/${slug}/policies/[policy]`, "page");
}
