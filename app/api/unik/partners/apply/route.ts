import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { getUnikSeller } from "../../../../../lib/unik-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { canonicalStoreUrl } from "../../../../../lib/store-url";

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

    let authUserId: string;
    let reusedExistingAccount = false;
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "unik_partner" },
    });
    if (authErr || !created?.user) {
      // A person can already have an auth.users row for a completely
      // different reason -- they're a seller, a storefront customer, a
      // Brand Manager, an affiliate. That's fine; a partner application is
      // just another role linked to the same identity, not a fresh signup.
      // Reuse the existing row instead of hard-failing (same fallback
      // brand-manager/invite/route.ts uses), rather than forcing the
      // person to apply with a second email address. Their real password
      // stays whatever it already was -- the one just typed above isn't
      // silently applied to that existing identity (this endpoint is public
      // and unauthenticated, so trusting a typed password here would let
      // anyone hijack an arbitrary email's account by "applying" with it).
      // Instead, a real password-reset email goes out below, so they can
      // set the password they just typed through Supabase's own
      // ownership-verified flow.
      const message = authErr?.message || "";
      if (!/already.*(registered|exists)|already exists|email_exists/i.test(message)) {
        return NextResponse.json({ error: message || "Could not create your account" }, { status: 500 });
      }
      let match: { id: string } | undefined;
      for (let page = 1; page <= 20 && !match; page++) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr || !list?.users?.length) break;
        match = list.users.find((u) => (u.email || "").toLowerCase() === email);
        if (list.users.length < 1000) break;
      }
      if (!match) return NextResponse.json({ error: "Could not find or create that account" }, { status: 500 });
      authUserId = match.id;
      reusedExistingAccount = true;
      // Best-effort -- a failure here shouldn't fail the whole application,
      // the person can still request a reset themselves from the login page.
      await admin.auth.resetPasswordForEmail(email, { redirectTo: canonicalStoreUrl(seller.subdomain, "/partners/login") }).catch(() => {});
    } else {
      authUserId = created.user.id;
    }

    const { data: alreadyPartner } = await admin.from("unik_partners").select("id").eq("seller_id", seller.id).eq("auth_user_id", authUserId).maybeSingle();
    if (alreadyPartner) return NextResponse.json({ error: "This account has already applied" }, { status: 409 });

    const { error: insertErr } = await admin.from("unik_partners").insert({
      seller_id: seller.id,
      auth_user_id: authUserId,
      full_name: fullName,
      email,
      phone,
      status: "pending",
    });
    if (insertErr) {
      if (!reusedExistingAccount) await admin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ error: insertErr.message || "Could not submit your application" }, { status: 500 });
    }

    return NextResponse.json({ success: true, reusedExistingAccount });
  } catch (err) {
    console.error("Partner apply error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
