import type { Metadata } from "next";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export const revalidate = 60;

// Per-seller browser tab branding. Title + description; the favicon itself
// is handled by the file-based dynamic icon at ./icon.tsx (which Next.js wires
// up automatically and which overrides the root /app/favicon.ico).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, tagline")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};

  return {
    title: seller.store_name,
    description: seller.tagline || `Shop ${seller.store_name} online`,
  };
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
