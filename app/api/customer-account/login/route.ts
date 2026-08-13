import { NextRequest, NextResponse } from "next/server";
import { createCustomerSession, setCustomerSessionCookie, verifyCustomerPassword } from "../../../../lib/customer-account";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getClientIP, rateLimit } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!rateLimit(`customer-login:${getClientIP(req)}`, 10, 600).allowed) return NextResponse.json({ error: "Too many sign-in attempts. Please wait and try again." }, { status: 429 });
  let body: { slug?: string; email?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const slug = String(body.slug || "").trim().toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const admin = getAdmin();
  const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", slug).maybeSingle();
  const { data: account } = seller ? await admin.from("customer_accounts").select("id, password_hash, activated_at").eq("seller_id", seller.id).ilike("email", email).maybeSingle() : { data: null } as any;
  const valid = account?.activated_at && account.password_hash ? await verifyCustomerPassword(password, account.password_hash) : false;
  if (!seller || !account || !valid) return NextResponse.json({ error: "Incorrect email or password. If this is your first visit, activate your account." }, { status: 401 });
  await admin.from("customer_accounts").update({ last_login_at: new Date().toISOString() }).eq("id", account.id);
  const session = await createCustomerSession(account.id, seller.id);
  const response = NextResponse.json({ ok: true });
  setCustomerSessionCookie(response, session.token, session.expiresAt);
  return response;
}
