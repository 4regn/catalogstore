import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../lib/setla-admin";
import { sendEmail } from "../../../../../lib/email";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// Fixed, not derived from req.url -- see apply/finish/route.ts for why.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

export async function GET(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const { data, error } = await getAdmin().from("setla_admins").select("id, full_name, email, role, active, created_at").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ admins: data || [] });
}

/* Same existing-account-reuse pattern as brand-manager/invite/route.ts:
   create a real auth.users row (or reuse one that already exists for
   this email under some other role), link it via setla_admins, then
   email a Supabase recovery link so they set their own password rather
   than one we'd have to transmit. super_admin only -- inviting more
   reviewers is a trust decision, not something every reviewer can do
   for themselves. */
export async function POST(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  if (auth.admin.role !== "super_admin") return NextResponse.json({ error: "Only a super admin can invite new admins" }, { status: 403 });

  const ip = getClientIP(req);
  if (!rateLimit("setla-admin-invite:" + ip, 5, 60).allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const fullName = String(body.fullName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const role = body.role === "super_admin" ? "super_admin" : "reviewer";
  if (!fullName || !email) return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });

  const admin = getAdmin();
  const { data: existing } = await admin.from("setla_admins").select("id").eq("email", email).maybeSingle();
  if (existing) return NextResponse.json({ error: "This person already has SETLA Admin access" }, { status: 409 });

  let authUserId: string;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role: "setla_admin", full_name: fullName },
  });
  if (createErr || !created?.user) {
    const message = createErr?.message || "";
    if (!/already.*(registered|exists)|already exists|email_exists/i.test(message)) {
      return NextResponse.json({ error: message || "Could not create account" }, { status: 500 });
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
  } else {
    authUserId = created.user.id;
  }

  const { error: insertErr } = await admin.from("setla_admins").insert({
    auth_user_id: authUserId,
    full_name: fullName,
    email,
    role,
    invited_by: auth.user.id,
  });
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${APP_ORIGIN}/setla-admin/login` },
  });
  if (linkErr || !link?.properties?.action_link) {
    console.error("SETLA admin invite: generateLink failed", { email, linkErr });
  } else {
    await sendEmail({
      to: email,
      subject: "You've been added as a SETLA Payments admin",
      html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
        <p style="margin:0 0 12px">Hi ${fullName.split(" ")[0]}, you've been added as a SETLA Payments admin.</p>
        <p style="margin:0 0 20px">Set your password to get started:</p>
        <a href="${link.properties.action_link}" style="display:inline-block;padding:12px 24px;background:#007517;color:#fff;text-decoration:none;border-radius:100px;font-weight:700">Set your password</a>
      </div>`,
    });
  }

  return NextResponse.json({ success: true });
}
