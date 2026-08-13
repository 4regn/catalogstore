import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../lib/rate-limit";
import { getAdmin } from "../../../lib/supabase-admin";
import { fetchActiveAutomaticBxgyDiscounts } from "../../../lib/automatic-discounts";

// Explicitly non-cacheable -- this endpoint's data (checkout_config,
// automatic_bxgy_discounts) can change at any time via the dashboard/SQL
// and must always reflect current DB state. Next.js Route Handlers can be
// statically optimized by default with no explicit dynamic/revalidate
// export, which risks serving a stale snapshot from whenever the route
// was first built/cached -- the exact same category of bug already found
// and fixed once this session for the storefront pages themselves (see
// commit 0a59bea, "stop calling headers() on every request").
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = rateLimit("seller-pub:" + ip, 30, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const { data: seller } = await getAdmin().from("sellers").select("*").eq("subdomain", slug).single();
  if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Public by nature -- these are marketing rules ("buy 2 get 1 free"),
  // not sensitive data, needed client-side so the cart/checkout can show
  // the automatic saving before the customer even reaches place-order
  // (see lib/automatic-discounts.ts's own comment: both sides must
  // compute the exact same thing from the same rules).
  const automaticBxgyDiscounts = await fetchActiveAutomaticBxgyDiscounts(getAdmin(), seller.id);

  // Strip sensitive keys before sending to client
  const cc = seller.checkout_config || {} as any;
  const safeCheckoutConfig = {
    eft_enabled: !!cc.eft_enabled,
    eft_bank_name: cc.eft_bank_name || "",
    eft_account_number: cc.eft_account_number || "",
    eft_account_name: cc.eft_account_name || "",
    eft_branch_code: cc.eft_branch_code || "",
    eft_account_type: cc.eft_account_type || "",
    eft_instructions: cc.eft_instructions || "",
    payfast_enabled: !!cc.payfast_enabled,
    // merchant_id and merchant_key are NEVER sent to client
    // yoco_enabled is safe to expose as-is -- unlike PayFast there's no
    // per-seller merchant_id/merchant_key pair to strip (see
    // /api/checkout/yoco-redirect's own comment: Yoco creds are one global
    // platform-wide credential pair, not per-seller).
    yoco_enabled: !!cc.yoco_enabled,
    // Same non-self-serve reasoning as yoco_enabled -- SETLA is a shared
    // credit facility across sellers, not something a seller can safely
    // self-enable via a generic toggle. See /api/checkout/setla-create's
    // own comment.
    setla_enabled: !!cc.setla_enabled,
    // Same non-self-serve reasoning as yoco_enabled -- STITCH_CLIENT_ID/
    // STITCH_CLIENT_SECRET (lib/stitch.ts) are one platform-wide
    // credential pair, not per-seller. See
    // /api/checkout/stitch-redirect's own comment.
    stitch_enabled: !!cc.stitch_enabled,
    // Float credentials are server-only and shared by the approved 4REGN
    // merchant integration. Only this harmless availability flag is public.
    // Do not advertise Float until both server-side credentials exist in
    // this deployment; this prevents a visible payment option that can
    // only fail while Vercel is still being configured.
    float_enabled: !!cc.float_enabled && !!process.env.FLOAT_CLIENT_SECRET && !!process.env.FLOAT_SIGNING_KEY,
    delivery_enabled: cc.delivery_enabled !== false,
    pickup_enabled: !!cc.pickup_enabled,
    pickup_address: cc.pickup_address || "",
    pickup_instructions: cc.pickup_instructions || "",
    shipping_options: cc.shipping_options || [],
  };

  return NextResponse.json({
    id: seller.id,
    store_name: seller.store_name,
    whatsapp_number: seller.whatsapp_number,
    subdomain: seller.subdomain,
    primary_color: seller.primary_color,
    logo_url: seller.logo_url,
    template: seller.template,
    subscription_status: seller.subscription_status || null,
    trial_ends_at: seller.trial_ends_at || null,
    checkout_config: safeCheckoutConfig,
    automatic_bxgy_discounts: automaticBxgyDiscounts,
    // Styling/content only (fonts, colors, copy) -- no secrets live here.
    store_config: seller.store_config || {},
    template_configs: seller.template_configs || {},
  });
}
