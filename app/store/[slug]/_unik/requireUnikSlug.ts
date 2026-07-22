import { notFound } from "next/navigation";

// These informational/legal pages carry hardcoded UNIK Labs copy -- they
// must not render for any other seller's [slug], the same way the private
// unik-labs template itself is gated in lib/store-template-access.ts.
export function requireUnikSlug(slug: string) {
  if (slug !== "unik") notFound();
}
