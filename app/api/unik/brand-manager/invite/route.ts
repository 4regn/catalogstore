import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { sendEmail } from "../../../../../lib/email";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { STORE_ROOT_DOMAIN } from "../../../../../lib/store-url";

/* Lets a seller invite a Brand Manager for their own store. Creates a real
   auth.users row (no password set), links it via brand_managers, then emails
   a Supabase password-recovery link so they land on the existing
   /reset-password page to set their own password -- reusing the platform's
   already-working email delivery path (lib/email.ts) rather than depending
   on Supabase Auth's separate, possibly-unconfigured invite-email service. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("brand-manager-invite:" + ip, 5, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { full_name, email, access_token } = await req.json();
    const cleanName = String(full_name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanName || !cleanEmail) return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${access_token}` } }, auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const admin = getAdmin();
    const { data: seller } = await admin.from("sellers").select("id, store_name, logo_url").eq("id", userData.user.id).maybeSingle();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

    const { data: existing } = await admin.from("brand_managers").select("id").eq("seller_id", seller.id).eq("email", cleanEmail).maybeSingle();
    if (existing) return NextResponse.json({ error: "This person already has Brand Manager access" }, { status: 409 });

    let authUserId: string;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      email_confirm: true,
      user_metadata: { role: "brand_manager", full_name: cleanName },
    });
    if (createErr || !created?.user) {
      // A Supabase auth user with this email may already exist (e.g. they're
      // also a customer somewhere, or -- while testing -- the seller's own
      // login) -- reuse that identity rather than fail.
      const message = createErr?.message || "";
      if (!/already.*(registered|exists)|already exists|email_exists/i.test(message)) {
        return NextResponse.json({ error: message || "Could not create account" }, { status: 500 });
      }
      if ((userData.user.email || "").toLowerCase() === cleanEmail) {
        authUserId = userData.user.id;
      } else {
        let match: { id: string } | undefined;
        for (let page = 1; page <= 20 && !match; page++) {
          const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (listErr || !list?.users?.length) break;
          match = list.users.find((u) => (u.email || "").toLowerCase() === cleanEmail);
          if (list.users.length < 1000) break;
        }
        if (!match) return NextResponse.json({ error: "Could not find or create that account" }, { status: 500 });
        authUserId = match.id;
      }
    } else {
      authUserId = created.user.id;
    }

    const { error: insertErr } = await admin.from("brand_managers").insert({
      seller_id: seller.id,
      auth_user_id: authUserId,
      full_name: cleanName,
      email: cleanEmail,
    });
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: cleanEmail,
      options: { redirectTo: `https://${STORE_ROOT_DOMAIN}/reset-password` },
    });
    if (linkErr || !link?.properties?.action_link) {
      console.error("Brand manager invite: generateLink failed", { email: cleanEmail, linkErr });
    } else {
      await sendEmail({
        to: cleanEmail,
        subject: `You've been added as a Brand Manager — ${seller.store_name}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
          ${seller.logo_url ? `<img src="${seller.logo_url}" alt="" style="height:40px;margin-bottom:16px" />` : `<h2 style="margin:0 0 12px">${seller.store_name}</h2>`}
          <p style="margin:0 0 12px">Hi ${cleanName.split(" ")[0]}, you've been added as a Brand Manager for ${seller.store_name}.</p>
          <p style="margin:0 0 20px">Set your password to get started:</p>
          <a href="${link.properties.action_link}" style="display:inline-block;padding:12px 24px;background:#f43d32;color:#fff;text-decoration:none;border-radius:100px;font-weight:700">Set your password</a>
        </div>`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Brand manager invite error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
