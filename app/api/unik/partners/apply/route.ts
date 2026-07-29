import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { getUnikSeller } from "../../../../../lib/unik-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

/* Public application flow for a UNIK Partner. Creates a real auth.users
   row (email+password, so they can sign in immediately) plus a
   unik_partners row with status='pending' -- Brand Manager approves or
   rejects from their dashboard's Partners tab (see
   app/api/unik/brand-manager/partners/route.ts). Referral code and
   discount code aren't assigned until approval, since granting a working
   discount code is the trust decision the approval step exists for. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("unik-partner-apply:" + ip, 5, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!fullName || !email || !phone || !password) {
      return NextResponse.json({ error: "Name, email, phone and password are required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (!/^(\+27|0)[6-8][0-9]{8}$/.test(phone)) {
      return NextResponse.json({ error: "Enter a valid South African phone number" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords don't match" }, { status: 400 });
    }

    const seller = await getUnikSeller();
    if (!seller) return NextResponse.json({ error: "UNIK Labs is unavailable" }, { status: 404 });

    const admin = getAdmin();
    const { data: existing } = await admin.from("unik_partners").select("id").eq("seller_id", seller.id).eq("email", email).maybeSingle();
    if (existing) return NextResponse.json({ error: "An application with this email already exists" }, { status: 409 });

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "unik_partner" },
    });
    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message || "Could not create your account" }, { status: 500 });
    }

    const { error: insertErr } = await admin.from("unik_partners").insert({
      seller_id: seller.id,
      auth_user_id: authData.user.id,
      full_name: fullName,
      email,
      phone,
      status: "pending",
    });
    if (insertErr) {
      await admin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: insertErr.message || "Could not submit your application" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Partner apply error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
