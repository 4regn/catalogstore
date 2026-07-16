import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { getAdmin } from "../../../../lib/supabase-admin";
import { sendEmail } from "../../../../lib/email";

/* Bookings are created server-side (not via a direct client insert) so we
   can: re-check slot availability against a race, gate PayFast to studio
   bookings server-side too (not just in the UI), and send confirmation
   emails -- none of which a client-side insert can do.

   Only "confirmed" bookings block a slot -- a pending EFT booking (awaiting
   proof of payment) does NOT reserve the slot until the seller manually
   confirms it from their dashboard. This is a deliberate business choice
   (first customer to actually pay and get confirmed wins the slot, not
   first to submit the form) -- see the seller's own booking terms. */
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

    const { data: clash } = await admin.from("bookings").select("id").eq("seller_id", sellerId).eq("date", date).eq("time_slot", timeSlot).eq("status", "confirmed").maybeSingle();
    if (clash) return NextResponse.json({ error: "That time slot was just booked. Please pick another." }, { status: 409 });

    const cc = seller.checkout_config as any;
    const wantsPayfast = paymentMethod === "payfast";
    // Distance-based callout pricing means we don't have a fixed amount to
    // charge online for callouts -- PayFast is studio-only, enforced here
    // too (not just hidden in the UI).
    if (wantsPayfast && (type !== "studio" || !service || !cc?.payfast_enabled)) {
      return NextResponse.json({ error: "Online payment isn't available for this booking" }, { status: 400 });
    }
    if (!wantsPayfast && !cc?.eft_enabled) {
      return NextResponse.json({ error: "This store hasn't set up a payment method for bookings yet" }, { status: 400 });
    }

    const amount = service ? Number(service.price) : null;
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
      payment_method: wantsPayfast ? "payfast" : "eft",
      amount,
    }).select("id").single();
    if (insertErr || !booking) return NextResponse.json({ error: "Could not create booking" }, { status: 500 });

    if (wantsPayfast) {
      return NextResponse.json({ ok: true, bookingId: booking.id, payfastUrl: `/api/payfast-booking-redirect?bookingId=${booking.id}` });
    }

    // EFT booking: awaiting a deposit + proof of payment -- notify both
    // sides immediately by email.
    const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const svcLine = service ? `${service.name} — R${Math.round(service.price)}` : "Service";
    const typeLine = type === "studio" ? "Studio Visit" : "Callout (additional distance-based fee applies)";
    const deposit = amount !== null ? Math.round(amount * 0.5) : null;
    const proofContact = [seller.whatsapp_number ? `WhatsApp: ${seller.whatsapp_number}` : "", seller.email ? `Email: ${seller.email}` : ""].filter(Boolean).join(" or ");

    if (seller.email) {
      await sendEmail({
        to: seller.email,
        subject: `New booking pending — ${name}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#2A1F18">
          <h2 style="margin:0 0 12px">New Booking — Pending Payment</h2>
          <p style="margin:0 0 4px"><strong>${name}</strong> (${phone}, ${email})</p>
          <p style="margin:0 0 4px">${svcLine}</p>
          <p style="margin:0 0 4px">${dateLabel} at ${timeSlot}</p>
          <p style="margin:0 0 4px">${typeLine}</p>
          ${address ? `<p style="margin:0 0 4px">Address: ${address}</p>` : ""}
          ${deposit !== null ? `<p style="margin:0 0 4px">Deposit due: R${deposit}</p>` : ""}
          <p style="margin:16px 0 0;font-size:13px;color:#6B5141">This slot is NOT reserved yet -- once you receive proof of payment, confirm the booking from your dashboard's Bookings page to lock in the slot.</p>
        </div>`,
      });
    }
    if (email) {
      await sendEmail({
        to: email,
        from: `${seller.store_name} <orders@catalogstore.co.za>`,
        subject: `Booking received — payment instructions — ${seller.store_name}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#2A1F18">
          ${seller.logo_url ? `<img src="${seller.logo_url}" alt="${seller.store_name}" style="height:40px;margin-bottom:16px" />` : `<h2 style="margin:0 0 12px">${seller.store_name}</h2>`}
          <p style="margin:0 0 12px">Thanks ${name}, we've received your booking request:</p>
          <div style="background:#F5EDE3;border-radius:10px;padding:16px 18px;margin-bottom:16px">
            <p style="margin:0 0 4px">${svcLine}</p>
            <p style="margin:0 0 4px">${dateLabel} at ${timeSlot}</p>
            <p style="margin:0">${typeLine}</p>
          </div>
          <div style="background:#fff;border:1px solid #eee;border-radius:10px;padding:18px 20px;margin-bottom:16px">
            <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#7A5C47;margin:0 0 10px">Secure Your Booking</h3>
            ${deposit !== null ? `<p style="margin:0 0 10px;font-size:15px;font-weight:600">Deposit due: R${deposit}</p>` : ""}
            ${cc.eft_bank_name ? `<p style="margin:0 0 4px;font-size:13px">Bank: ${cc.eft_bank_name}</p>` : ""}
            ${cc.eft_account_name ? `<p style="margin:0 0 4px;font-size:13px">Account Name: ${cc.eft_account_name}</p>` : ""}
            ${cc.eft_account_number ? `<p style="margin:0 0 4px;font-size:13px">Account Number: ${cc.eft_account_number}</p>` : ""}
            ${cc.eft_branch_code ? `<p style="margin:0 0 4px;font-size:13px">Branch Code: ${cc.eft_branch_code}</p>` : ""}
            ${cc.eft_account_type ? `<p style="margin:0 0 4px;font-size:13px">Account Type: ${cc.eft_account_type}</p>` : ""}
            ${cc.eft_instructions ? `<p style="margin:10px 0 0;font-size:13px;color:#6B5141;white-space:pre-line">${cc.eft_instructions}</p>` : ""}
            ${proofContact ? `<p style="margin:12px 0 0;font-size:13px;font-weight:600">Please send your proof of payment to: ${proofContact}</p>` : ""}
          </div>
          <p style="margin:0;font-size:13px;color:#6B5141">Your appointment will be confirmed once ${seller.store_name} receives your proof of payment.</p>
        </div>`,
      });
    }

    return NextResponse.json({ ok: true, bookingId: booking.id });
  } catch (err) {
    console.error("Booking create error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
