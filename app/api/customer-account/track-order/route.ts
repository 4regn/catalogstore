import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getClientIP, rateLimit } from "../../../../lib/rate-limit";
import {
  FOUR_REGN_LEGACY_TRACKING_URL,
  FOUR_REGN_NEW_TRACKING_FIRST_ORDER,
  fourRegnOrderReference,
  normalizeSouthAfricanPhone,
  parseFourRegnOrderNumber,
} from "../../../../lib/four-regn-orders";
import { buildFourRegnTracking, isFourRegnOrderTrackable } from "../../../../lib/four-regn-tracking";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "We could not match those details. Check your order number and the email address or mobile number used at checkout.";

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const limited = rateLimit(`four-regn-track:${ip}`, 10, 15 * 60);
  if (!limited.allowed) return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes and try again." }, { status: 429 });

  let body: { slug?: string; orderNumber?: string; contact?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 }); }

  const slug = String(body.slug || "").trim().toLowerCase();
  const number = parseFourRegnOrderNumber(body.orderNumber);
  const contact = String(body.contact || "").trim();
  if (slug !== "4regn" || number === null || !contact) return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });

  if (number < FOUR_REGN_NEW_TRACKING_FIRST_ORDER) {
    return NextResponse.json({ legacy: true, legacyUrl: FOUR_REGN_LEGACY_TRACKING_URL });
  }

  const admin = getAdmin();
  const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", slug).maybeSingle();
  if (!seller) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });

  // New references live in external_id so they do not interfere with the
  // platform-wide numeric order_number used by other sellers. The numeric
  // fallback covers an order placed just before this migration was applied.
  const candidates = [`#${number}D`, `${number}D`, `#${number}`, String(number)];
  const columns = "id, order_number, external_id, customer_email, customer_phone, customer_name, items, total, status, payment_status, shipping_option, created_at, tracking_updated_at";
  const [externalMatches, numericMatches] = await Promise.all([
    admin.from("orders").select(columns).eq("seller_id", seller.id).in("external_id", candidates).limit(5),
    admin.from("orders").select(columns).eq("seller_id", seller.id).eq("order_number", number).is("external_id", null).limit(5),
  ]);
  const byId = new Map<string, any>();
  for (const row of [...(externalMatches.data || []), ...(numericMatches.data || [])]) byId.set(row.id, row);
  const matches = [...byId.values()];

  const suppliedEmail = contact.toLowerCase();
  const suppliedPhone = normalizeSouthAfricanPhone(contact);
  const order = matches.find((row: any) => {
    const emailMatches = suppliedEmail.includes("@") && String(row.customer_email || "").trim().toLowerCase() === suppliedEmail;
    const phoneMatches = suppliedPhone.length >= 9 && normalizeSouthAfricanPhone(row.customer_phone) === suppliedPhone;
    return emailMatches || phoneMatches;
  });

  if (!order) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });

  // Match the customer-account rule: abandoned/unconfirmed rows are not
  // exposed as trackable orders.
  const confirmed = isFourRegnOrderTrackable(order);
  if (!confirmed) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });

  return NextResponse.json({
    order: {
      reference: fourRegnOrderReference(order),
      customer_name: order.customer_name,
      items: order.items || [],
      total: order.total,
      status: order.status,
      shipping_option: order.shipping_option,
      created_at: order.created_at,
      tracking_updated_at: order.tracking_updated_at,
      tracking: buildFourRegnTracking(order),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
