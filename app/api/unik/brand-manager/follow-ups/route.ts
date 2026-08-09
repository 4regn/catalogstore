import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";
import { sweepAbandonedOrders } from "../../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

// Give someone real time to naturally come back and finish before a design
// counts as "worth nudging about" -- otherwise every design would show up
// here the instant it's generated, most of which are just mid-flow.
const GENERATION_STALE_MS = 2 * 60 * 60 * 1000;
const RAW_FETCH_CAP = 2000;

type GeneratedRow = {
  authUserId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  whatsappConsent: boolean;
  designId: string;
  designName: string | null;
  style: string | null;
  previewUrl: string | null;
  mockupUrl: string | null;
  generatedAt: string;
};

type AbandonedOrderRow = {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  createdAt: string;
};

/* Two genuinely different populations, both worth a WhatsApp nudge but
   for different reasons and with different consent requirements:
   - generatedNotPurchased: never even opened checkout, so any phone
     number on file only exists because they explicitly opted in on
     signup (unik_customer_profiles.whatsapp_consent) -- shown here ONLY
     when that consent is true.
   - abandonedCheckouts: already gave their phone at checkout for order
     fulfilment, so following up about that specific unfinished order is
     order-related, not a marketing message -- shown regardless of the
     separate marketing-consent flag. */
export async function GET(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  const admin = getAdmin();
  await sweepAbandonedOrders(admin, seller.id);

  const staleBefore = new Date(Date.now() - GENERATION_STALE_MS).toISOString();
  const [designsResult, ordersResult] = await Promise.all([
    admin
      .from("unik_designs")
      .select("id, auth_user_id, name, style, preview_url, mockup_url, created_at")
      .eq("seller_id", seller.id)
      .eq("owner_role", "customer")
      .in("status", ["generated", "saved"])
      .lt("created_at", staleBefore)
      .order("created_at", { ascending: false })
      .limit(RAW_FETCH_CAP),
    admin
      .from("orders")
      .select("id, order_number, customer_name, customer_phone, total, created_at")
      .eq("seller_id", seller.id)
      .eq("payment_status", "abandoned")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const rawDesigns = designsResult.data || [];
  const authUserIds = Array.from(new Set(rawDesigns.map((d) => d.auth_user_id).filter(Boolean)));

  const { data: profiles } = authUserIds.length
    ? await admin
        .from("unik_customer_profiles")
        .select("auth_user_id, full_name, email, phone, whatsapp_consent")
        .eq("seller_id", seller.id)
        .in("auth_user_id", authUserIds)
    : { data: [] };
  const profileByUser = new Map((profiles || []).map((p) => [p.auth_user_id, p]));

  // One row per customer -- their single most recent unconverted design,
  // not one row per design, so a customer who generated 3 things they
  // never bought doesn't show up 3 times.
  const seen = new Set<string>();
  const generatedNotPurchased: GeneratedRow[] = [];
  for (const d of rawDesigns) {
    if (!d.auth_user_id || seen.has(d.auth_user_id)) continue;
    const profile = profileByUser.get(d.auth_user_id);
    if (!profile?.phone || !profile.whatsapp_consent) continue; // no consent, no contact info -- skip, don't just hide the button
    seen.add(d.auth_user_id);
    generatedNotPurchased.push({
      authUserId: d.auth_user_id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      whatsappConsent: true,
      designId: d.id,
      designName: d.name,
      style: d.style,
      previewUrl: d.preview_url,
      mockupUrl: d.mockup_url,
      generatedAt: d.created_at,
    });
  }

  const abandonedCheckouts: AbandonedOrderRow[] = (ordersResult.data || [])
    .filter((o) => o.customer_phone)
    .map((o) => ({
      orderId: o.id,
      orderNumber: o.order_number,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      total: Number(o.total) || 0,
      createdAt: o.created_at,
    }));

  return NextResponse.json(
    { generatedNotPurchased, abandonedCheckouts },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
