import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import UnikLabsIframePage from "../_unik/UnikLabsIframePage";
import StoreUnavailable from "../StoreUnavailable";

export const metadata: Metadata = { title: "AI Design Studio — UNIK Labs" };

export default async function StudioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, whatsapp_number, social_links, logo_url, subscription_status")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) notFound();
  if (seller.subscription_status === "expired" || seller.subscription_status === "cancelled") {
    return <StoreUnavailable seller={seller} />;
  }

  return <UnikLabsIframePage file="studio.html" title="AI Design Studio — UNIK Labs" />;
}
