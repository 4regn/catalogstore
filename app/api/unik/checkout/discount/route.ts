import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikCustomer } from "../../../../../lib/unik-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

/* Live-preview validation of a discount code while the customer is still
   filling in the checkout form -- computes the discount amount against
   their current cart subtotal so the UI can show it before they pay.
   Not authoritative: /api/unik/checkout/create re-validates and
   re-computes this from scratch at order-creation time (min_order,
   expiry and max_uses can all change between "Apply" and "Pay"), and
   that's the only place used_count actually increments. UNIK codes are
   always applies_to:'cart' in practice (that's all the Partner Program
   creates), so that's the only scope handled here. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("unik-checkout-discount:" + ip, 20, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const auth = await requireUnikCustomer(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  let body: { code?: string; ref?: string; subtotal?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const subtotal = Math.max(0, Number(body.subtotal) || 0);
  let code = String(body.code || "").trim().toUpperCase();
  const refCode = String(body.ref || "").trim().toLowerCase();
  if (!code && !refCode) return NextResponse.json({ error: "Enter a discount code" }, { status: 400 });

  const admin = getAdmin();

  // ref (a partner's referral_code, e.g. from ?pref= on the storefront --
  // see capturePartnerRef() in store.js) isn't itself a discount code, it's
  // the partner's identity: resolve it to the actual discount_codes row
  // their referral link is meant to auto-apply. Not an error condition when
  // this comes up empty (a stale/suspended partner's cookie shouldn't look
  // like the shopper typed something wrong) -- checkout.html calls this
  // with { silent: true } for the ref path specifically because of that.
  if (!code && refCode) {
    const { data: partner } = await admin
      .from("unik_partners")
      .select("discount_code_id")
      .eq("seller_id", seller.id)
      .eq("referral_code", refCode)
      .eq("status", "active")
      .maybeSingle();
    const discountCodeId = partner?.discount_code_id;
    const { data: dc } = discountCodeId
      ? await admin.from("discount_codes").select("code").eq("id", discountCodeId).maybeSingle()
      : { data: null };
    if (!dc) return NextResponse.json({ error: "Invalid discount code" }, { status: 404 });
    code = dc.code;
  }

  const { data: row } = await admin
    .from("discount_codes")
    .select("code, type, value, applies_to, active, expires_at, max_uses, used_count, min_order")
    .eq("seller_id", seller.id)
    .eq("code", code)
    .maybeSingle();

  if (!row || !row.active) return NextResponse.json({ error: "Invalid discount code" }, { status: 404 });
  if (row.expires_at && new Date(row.expires_at) < new Date()) return NextResponse.json({ error: "This code has expired" }, { status: 400 });
  if (row.max_uses && row.used_count >= row.max_uses) return NextResponse.json({ error: "This code has reached its usage limit" }, { status: 400 });
  if (row.min_order > 0 && subtotal < row.min_order) return NextResponse.json({ error: `Minimum order of R${row.min_order} required` }, { status: 400 });
  if (row.applies_to !== "cart") return NextResponse.json({ error: "This code can't be used here" }, { status: 400 });

  const amount = row.type === "percentage" ? Math.round(subtotal * (row.value / 100) * 100) / 100 : Math.min(row.value, subtotal);

  return NextResponse.json({ code: row.code, type: row.type, value: row.value, amount });
}
