import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../lib/rate-limit";
import { getAdmin } from "../../../lib/supabase-admin";
import { storePath } from "../../../lib/store-url";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

function escAttr(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeOrigin(raw: string | null): string {
  if (!raw) return APP_ORIGIN;
  try {
    const u = new URL(raw);
    const host = u.host.toLowerCase();
    const allowed = new URL(APP_ORIGIN).host.toLowerCase();
    if (host === allowed || host.endsWith("." + allowed)) return u.origin;
    if (host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1")) return u.origin;
    return APP_ORIGIN;
  } catch {
    return APP_ORIGIN;
  }
}

/* GET, not POST -- the browser navigates here directly (window.location)
   right after /api/bookings/create returns a bookingId, so there's no
   client-held form data to submit; everything needed is already persisted
   on the booking row. Mirrors /api/payfast-redirect's auto-submit-form
   pattern for the order-checkout flow. */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    if (!rateLimit("pf-booking-redirect:" + ip, 10, 60).allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const bookingId = req.nextUrl.searchParams.get("bookingId");
    if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

    const admin = getAdmin();
    const { data: booking } = await admin.from("bookings").select("id, seller_id, service_id, status, client_name, client_phone, client_email, date, time_slot").eq("id", bookingId).single();
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (booking.status !== "awaiting_payment") return NextResponse.json({ error: "Booking is not awaiting payment" }, { status: 409 });

    const { data: seller } = await admin.from("sellers").select("id, store_name, subdomain, checkout_config").eq("id", booking.seller_id).single();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });
    const cc = seller.checkout_config as any;
    if (!cc?.payfast_enabled || !cc?.payfast_merchant_id || !cc?.payfast_merchant_key) {
      return NextResponse.json({ error: "PayFast not configured" }, { status: 400 });
    }

    const { data: service } = booking.service_id
      ? await admin.from("services").select("name, price").eq("id", booking.service_id).single()
      : { data: null as any };
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    const origin = safeOrigin(req.nextUrl.searchParams.get("returnOrigin"));
    const [firstName, ...rest] = (booking.client_name || "").split(" ");

    const fields: Record<string, string> = {
      merchant_id: cc.payfast_merchant_id,
      merchant_key: cc.payfast_merchant_key,
      amount: Number(service.price).toFixed(2),
      item_name: `${service.name} — ${seller.store_name}`,
      name_first: firstName || "",
      name_last: rest.join(" ") || "",
      email_address: booking.client_email || "",
      cell_number: booking.client_phone || "",
      return_url: origin + storePath(origin, seller.subdomain, "/?bookingPaid=" + booking.id),
      cancel_url: origin + storePath(origin, seller.subdomain, "/?bookingCancelled=" + booking.id),
      notify_url: APP_ORIGIN + "/api/payfast-booking/notify",
      custom_str1: booking.id,
    };

    const formHtml = `<!DOCTYPE html>
<html>
  <head><title>Redirecting to PayFast...</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#2A1F18;font-family:sans-serif;color:#fff;margin:0">
    <div style="text-align:center">
      <p style="font-size:16px;margin-bottom:12px">Redirecting to PayFast...</p>
      <p style="font-size:13px;color:rgba(255,255,255,0.4)">Please wait</p>
    </div>
    <form id="pf" method="POST" action="https://www.payfast.co.za/eng/process">
      ${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${escAttr(k)}" value="${escAttr(v)}" />`).join("\n      ")}
    </form>
    <script>document.getElementById("pf").submit();</script>
  </body>
</html>`;

    return new NextResponse(formHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    console.error("PayFast booking redirect error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
