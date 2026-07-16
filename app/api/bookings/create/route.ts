import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { getAdmin } from "../../../../lib/supabase-admin";
import { sendEmail } from "../../../../lib/email";

/* Bookings are created server-side (not via a direct client insert) so we
   can: re-check slot availability against a race, gate PayFast to studio
   bookings server-side too (not just in the UI), and send confirmation
   emails -- none of which a client-side insert can do. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    if (!rateLimit("booking-create:" + ip, 10, 60).allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { sellerId, serviceId, date, timeSlot, bookingType, clientName, clientPhone, clientEmail, clientAddress, paymentMethod } = await req.json();
    if (!sellerId || !date || !timeSlot) return NextResponse.json({ error: "Missing data" }, { status: 400 });
    const name = typeof clientName === "string" ? clientName.trim().slice(0, 120) : "";
    const phone = typeof clientPhone === "string" ? clientPhone.trim().slice(0, 40) : "";
    const email = typeof clientEmail === "string" ? clientEmail.trim().slice(0, 160) : "";
    const address = typeof clientAddress === "string" ? clientAddress.trim().slice(0, 400) : "";
    const type = bookingType === "callout" ? "callout" : "studio";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (phone.replace(/\D/g, "").length < 9) return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    if (type === "callout" && !address) return NextResponse.json({ error: "Please enter the address for your callout" }, { status: 400 });

    const admin = getAdmin();
    const { data: seller } = await admin.from("sellers").select("id, store_name, email, whatsapp_number, logo_url, primary_color, subdomain, checkout_config").eq("id", sellerId).single();
    if (!seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    let service: { id: string; name: string; price: number } | null = null;
    if (serviceId) {
      const { data: svc } = await admin.from("services").select("id, name, price").eq("id", serviceId).eq("seller_id", sellerId).maybeSingle();
      service = svc || null;
    }

    // Re-check the slot hasn't been taken since the storefront last loaded availability.
    const { data: clash } = await admin.from("bookings").select("id").eq("seller_id", sellerId).eq("date", date).eq("time_slot", timeSlot).neq("status", "cancelled").maybeSingle();
    if (clash) return NextResponse.json({ error: "That time slot was just booked. Please pick another." }, { status: 409 });

    const cc = seller.checkout_config as any;
    const wantsPayfast = paymentMethod === "payfast";
    // Distance-based callout pricing means we don't have a fixed amount to
    // charge online for callouts -- PayFast is studio-only, enforced here
    // too (not just hidden in the UI).
    if (wantsPayfast && (type !== "studio" || !service || !cc?.payfast_enabled)) {
      return NextResponse.json({ error: "Online payment isn't available for this booking" }, { status: 400 });
    }

    const status = wantsPayfast ? "awaiting_payment" : "pending";
    const { data: booking, error: insertErr } = await admin.from("bookings").insert({
      seller_id: sellerId,
      service_id: serviceId || null,
      date, time_slot: timeSlot,
      booking_type: type,
      status,
      client_name: name,
      client_phone: phone,
      client_email: email,
      client_address: type === "callout" ? address : null,
      payment_method: wantsPayfast ? "payfast" : (paymentMethod === "eft" ? "eft" : paymentMethod === "whatsapp" ? "whatsapp" : "pay_later"),
    }).select("id").single();
    if (insertErr || !booking) return NextResponse.json({ error: "Could not create booking" }, { status: 500 });

    if (wantsPayfast) {
      return NextResponse.json({ ok: true, bookingId: booking.id, payfastUrl: `/api/payfast-booking-redirect?bookingId=${booking.id}` });
    }

    // Non-PayFast bookings are confirmed pending manual/EFT/WhatsApp
    // follow-up -- notify both sides immediately by email.
    const accent = seller.primary_color || "#7A5C47";
    const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const svcLine = service ? `${service.name} — R${Math.round(service.price)}` : "Service";
    const typeLine = type === "studio" ? "Studio Visit" : "Callout (additional distance-based fee applies)";

    if (seller.email) {
      await sendEmail({
        to: seller.email,
        subject: `New booking request — ${name}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#2A1F18">
          <h2 style="margin:0 0 12px">New Booking Request</h2>
          <p style="margin:0 0 4px"><strong>${name}</strong> (${phone}${email ? ", " + email : ""})</p>
          <p style="margin:0 0 4px">${svcLine}</p>
          <p style="margin:0 0 4px">${dateLabel} at ${timeSlot}</p>
          <p style="margin:0 0 4px">${typeLine}</p>
          ${address ? `<p style="margin:0 0 4px">Address: ${address}</p>` : ""}
          <p style="margin:16px 0 0;font-size:13px;color:#6B5141">Confirm or manage this booking from your CatalogStore dashboard.</p>
        </div>`,
      });
    }
    if (email) {
      await sendEmail({
        to: email,
        from: `${seller.store_name} <orders@catalogstore.co.za>`,
        subject: `Booking received — ${seller.store_name}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#2A1F18">
          ${seller.logo_url ? `<img src="${seller.logo_url}" alt="${seller.store_name}" style="height:40px;margin-bottom:16px" />` : `<h2 style="margin:0 0 12px">${seller.store_name}</h2>`}
          <p style="margin:0 0 12px">Thanks ${name}, we've received your booking request:</p>
          <div style="background:#F5EDE3;border-radius:10px;padding:16px 18px;margin-bottom:16px">
            <p style="margin:0 0 4px">${svcLine}</p>
            <p style="margin:0 0 4px">${dateLabel} at ${timeSlot}</p>
            <p style="margin:0">${typeLine}</p>
          </div>
          <p style="margin:0;font-size:13px;color:#6B5141">${seller.store_name} will confirm your appointment shortly.${seller.whatsapp_number ? " You can also reach out on WhatsApp if you have any questions." : ""}</p>
        </div>`,
      });
    }

    return NextResponse.json({ ok: true, bookingId: booking.id });
  } catch (err) {
    console.error("Booking create error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
