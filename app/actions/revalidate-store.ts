"use server";

import { revalidatePath } from "next/cache";

export async function revalidateStore(slug: string) {
  if (!slug) return;
  revalidatePath(`/store/${slug}`);
  revalidatePath(`/store/${slug}/p/[productId]`, "page");
  revalidatePath(`/store/${slug}/c/[collection]`, "page");
}
