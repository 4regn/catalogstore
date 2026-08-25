import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getClientIP, rateLimit } from "../../../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`newsletter-subscribe:${getClientIP(req)}`, 8, 3600).allowed) {
      return NextResponse.json({ error: "Too many subscription attempts. Please try again later." }, { status: 429 });
    }
    const { sellerId, email, firstName } = await req.json();

    if (!sellerId || !email)
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedFirstName = typeof firstName === "string" ? firstName.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254)
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });

    const admin = getAdmin();
    const { data: seller, error: sellerError } = await admin.from("sellers").select("id, subdomain").eq("id", sellerId).maybeSingle();
    if (sellerError || !seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    if (seller.subdomain === "4regn" && !normalizedFirstName) {
      return NextResponse.json({ error: "Please enter your first name" }, { status: 400 });
    }

    const consentedAt = new Date().toISOString();
    const { data: existingCustomer, error: existingCustomerError } = await admin.from("customers")
      .select("id, first_name, tags").eq("seller_id", seller.id).ilike("email", normalizedEmail).limit(1).maybeSingle();
    if (existingCustomerError) throw existingCustomerError;

    const tags = Array.from(new Set([...(existingCustomer?.tags || []), "storefront-newsletter"]));
    const customerPayload = {
      accepts_email_marketing: true,
      marketing_consent_updated_at: consentedAt,
      tags,
      updated_at: consentedAt,
      ...(!existingCustomer?.first_name?.trim() && normalizedFirstName ? { first_name: normalizedFirstName } : {}),
    };
    const { error: customerError } = existingCustomer
      ? await admin.from("customers").update(customerPayload).eq("id", existingCustomer.id)
      : await admin.from("customers").insert({
          seller_id: seller.id,
          email: normalizedEmail,
          first_name: normalizedFirstName || null,
          accepts_email_marketing: true,
          marketing_consent_updated_at: consentedAt,
          tags,
          source: "manual",
          updated_at: consentedAt,
        });
    if (customerError) throw customerError;

    const { error } = await admin
      .from("newsletter_subscribers")
      .upsert(
        { seller_id: seller.id, email: normalizedEmail, ...(normalizedFirstName ? { first_name: normalizedFirstName } : {}), consented_at: consentedAt },
        { onConflict: "seller_id,email" }
      );

    if (error) {
      console.error("Newsletter subscribe error:", error);
      return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Welcome to the family" });
  } catch (e: any) {
    console.error("Newsletter subscribe error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
