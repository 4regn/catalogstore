import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { resolveSellerTemplate, UNIK_TEMPLATE_ID } from "../../../../lib/store-template-access";
import StoreUnavailable from "../StoreUnavailable";
import UnikLabsIframePage from "../_unik/UnikLabsIframePage";
import CheckoutPageClient from "./CheckoutPageClient";
import { fetchActiveAutomaticBxgyDiscounts } from "../../../../lib/automatic-discounts";

// Checkout is store configuration, not customer-specific server data (the
// cart itself is decoded by CheckoutPageClient from ?cart= in the browser).
// Cache the shared shell/config so moving from cart to checkout normally
// avoids two live database round trips. Dashboard saves explicitly
// revalidate this path and tag, so payment/shipping changes still appear
// immediately instead of waiting for this fallback window.
export const revalidate = 3600;
export const dynamic = "force-static";

const CHECKOUT_SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, primary_color, logo_url, template, subscription_status, trial_ends_at, store_config, template_configs, checkout_config";

function getCachedCheckoutSeller(slug: string) {
  return unstable_cache(
    async () => {
      const { data } = await supabaseAdmin
        .from("sellers")
        .select(CHECKOUT_SELLER_COLUMNS)
        .eq("subdomain", slug)
        .maybeSingle();
      return data;
    },
    ["checkout-seller-v1", slug],
    { revalidate: 3600, tags: [`storefront:${slug}`] }
  )();
}

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const seller = await getCachedCheckoutSeller(slug);

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

  const cc = seller.checkout_config || {};
  const initialSeller = {
    id: seller.id,
    store_name: seller.store_name,
    whatsapp_number: seller.whatsapp_number,
    subdomain: seller.subdomain,
    primary_color: seller.primary_color,
    logo_url: seller.logo_url,
    template: seller.template,
    subscription_status: seller.subscription_status || null,
    trial_ends_at: seller.trial_ends_at || null,
    store_config: seller.store_config || {},
    template_configs: seller.template_configs || {},
    automatic_bxgy_discounts: await fetchActiveAutomaticBxgyDiscounts(supabaseAdmin, seller.id),
    checkout_config: {
      eft_enabled: !!cc.eft_enabled,
      eft_bank_name: cc.eft_bank_name || "",
      eft_account_number: cc.eft_account_number || "",
      eft_account_name: cc.eft_account_name || "",
      eft_branch_code: cc.eft_branch_code || "",
      eft_account_type: cc.eft_account_type || "",
      eft_instructions: cc.eft_instructions || "",
      payfast_enabled: !!cc.payfast_enabled,
      yoco_enabled: !!cc.yoco_enabled,
      setla_enabled: !!cc.setla_enabled,
      stitch_enabled: !!cc.stitch_enabled,
      float_enabled: !!cc.float_enabled && !!process.env.FLOAT_CLIENT_SECRET && !!process.env.FLOAT_SIGNING_KEY,
      delivery_enabled: cc.delivery_enabled !== false,
      pickup_enabled: !!cc.pickup_enabled,
      pickup_address: cc.pickup_address || "",
      pickup_instructions: cc.pickup_instructions || "",
      shipping_options: cc.shipping_options || [],
    },
  };

  return <CheckoutPageClient initialSeller={initialSeller} />;
}
