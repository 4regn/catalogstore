import { notFound, redirect } from "next/navigation";
import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../../lib/store-url";
import { resolveSellerTemplate } from "../../../../../lib/store-template-access";
import StoreUnavailable from "../../StoreUnavailable";

export const revalidate = 60;
// See app/store/[slug]/page.tsx's own comment on this same line for the
// full reasoning -- summary: without this, Vercel never registers a
// dynamic-segment route (no generateStaticParams possible here, sellers/
// policy keys are DB-driven) as ISR-eligible at all, so `revalidate = 60`
// alone silently does nothing; confirmed via a live x-vercel-cache MISS on
// a repeat request. force-static chosen over an empty-array
// generateStaticParams to avoid its documented dynamicParams/404 footgun.
export const dynamic = "force-static";

// 4regn-only route -- every other template still shows these as in-page
// modals, not dedicated pages.
const FourRegn = nextDynamic(() => import("../../FourRegnStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";

const POLICY_KEYS = ["shipping", "returns", "privacy", "terms", "contact"] as const;
type PolicyKey = (typeof POLICY_KEYS)[number];
const isPolicyKey = (v: string): v is PolicyKey => (POLICY_KEYS as readonly string[]).includes(v);

const POLICY_TITLES: Record<PolicyKey, string> = {
  shipping: "Shipping Policy",
  returns: "Returns & Refunds",
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  contact: "Contact",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; policy: string }>;
}): Promise<Metadata> {
  const { slug, policy } = await params;
  if (!isPolicyKey(policy)) return {};

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};

  const title = `${POLICY_TITLES[policy]} | ${seller.store_name}`;

  return {
    title,
    alternates: { canonical: canonicalStoreUrl(slug, `/policies/${policy}`) },
    openGraph: { title },
  };
}

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ slug: string; policy: string }>;
}) {
  const { slug, policy } = await params;

  if (!isPolicyKey(policy)) notFound();

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select(SELLER_COLUMNS)
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) notFound();

  // Frozen store -- same "unavailable" page as the main storefront.
  if (seller.subscription_status === "expired" || seller.subscription_status === "cancelled") {
    return <StoreUnavailable seller={seller} />;
  }

  const isSubdomain = await isStoreSubdomainRequest();

  // Resolve through the same private-template gate the main store page and
  // /c/<collection> use, so a raw `template` column value can't be used to
  // reach 4regn's private storefront from a seller who isn't allowed to
  // use it. This route is 4regn-only -- every other template sends the
  // visitor home.
  const tpl = resolveSellerTemplate(seller);
  if (tpl !== "4regn") {
    redirect(isSubdomain ? "/" : `/store/${slug}`);
  }

  // Content-only page -- no product list needed.
  return (
    <FourRegn
      initialSeller={seller}
      initialProducts={[]}
      initialDiscountCodes={[]}
      mode="policy"
      policyKey={policy}
      isSubdomain={isSubdomain}
    />
  );
}
