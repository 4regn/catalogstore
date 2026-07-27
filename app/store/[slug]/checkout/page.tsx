import { notFound } from "next/navigation";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { resolveSellerTemplate, UNIK_TEMPLATE_ID } from "../../../../lib/store-template-access";
import StoreUnavailable from "../StoreUnavailable";
import UnikLabsIframePage from "../_unik/UnikLabsIframePage";
import CheckoutPageClient from "./CheckoutPageClient";

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, whatsapp_number, social_links, logo_url, template, subdomain, subscription_status")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) notFound();
  if (seller.subscription_status === "expired" || seller.subscription_status === "cancelled") {
    return <StoreUnavailable seller={seller} />;
  }

  // UNIK's checkout is its own static-HTML flow (cart, address, Yoco) served
  // through the same iframe pattern as the rest of its "pages" -- everyone
  // else keeps the shared, template-themed checkout below.
  if (resolveSellerTemplate(seller) === UNIK_TEMPLATE_ID) {
    return <UnikLabsIframePage file="checkout.html" title="Checkout — UNIK Labs" />;
  }

  return <CheckoutPageClient />;
}
