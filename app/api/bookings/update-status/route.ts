import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { sendEmail } from "../../../../lib/email";

const VALID_STATUSES = ["pending", "confirmed", "cancelled"];

/* Seller confirms/cancels a booking from their dashboard. Goes through an
   API route (rather than a direct client-side update, like the rest of
   this app's dashboard writes) purely so we can email the customer on
   confirm -- that needs a server-side Resend call. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    if (!rateLimit("booking-status:" + ip, 30, 60).allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const { bookingId, status, accessToken } = await req.json();
    if (!bookingId || !VALID_STATUSES.includes(status) || !accessToken) {
      return NextResponse.json({ error: "Missing or invalid data" }, { status: 400 });
    }

    const authed = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } }
    );
    const { data: userData } = await authed.auth.getUser();
    if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdmin();
    const { data: booking } = await admin.from("bookings").select("id, seller_id, service_id, status, client_name, client_email, date, time_slot").eq("id", bookingId).single();
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (booking.seller_id !== userData.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { error } = await admin.from("bookings").update({ status }).eq("id", bookingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (status === "confirmed" && booking.status !== "confirmed" && booking.client_email) {
      const { data: seller } = await admin.from("sellers").select("store_name, logo_url").eq("id", booking.seller_id).single();
      const { data: service } = booking.service_id ? await admin.from("services").select("name, price").eq("id", booking.service_id).single() : { data: null as any };
      const dateLabel = new Date(booking.date + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      await sendEmail({
        to: booking.client_email,
        from: seller ? `${seller.store_name} <orders@catalogstore.co.za>` : undefined,
        subject: `Booking confirmed — ${seller?.store_name || "Your appointment"}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#2A1F18">
          ${seller?.logo_url ? `<img src="${seller.logo_url}" alt="" style="height:40px;margin-bottom:16px" />` : ""}
          <p style="margin:0 0 12px">Hi ${booking.client_name}, your appointment has been confirmed:</p>
          <div style="background:#F5EDE3;border-radius:10px;padding:16px 18px">
            ${service ? `<p style="margin:0 0 4px">${service.name} — R${Math.round(service.price)}</p>` : ""}
            <p style="margin:0">${dateLabel} at ${booking.time_slot}</p>
          </div>
        </div>`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Booking status update error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
