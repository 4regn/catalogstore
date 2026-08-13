import { NextRequest, NextResponse } from "next/server";
import { createCustomerSession, hashAccountCode, hashCustomerPassword, setCustomerSessionCookie } from "../../../../lib/customer-account";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getClientIP, rateLimit } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!rateLimit(`customer-activate:${getClientIP(req)}`, 10, 600).allowed) return NextResponse.json({ error: "Too many attempts. Request a new code." }, { status: 429 });
  let body: { slug?: string; email?: string; code?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const slug = String(body.slug || "").trim().toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  const code = String(body.code || "").trim();
  const password = String(body.password || "");
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the 6-digit confirmation code" }, { status: 400 });
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return NextResponse.json({ error: "Use at least 8 characters with a letter and a number" }, { status: 400 });

  const admin = getAdmin();
  const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", slug).maybeSingle();
  if (!seller) return NextResponse.json({ error: "Invalid confirmation code" }, { status: 400 });
  const { data: row } = await admin.from("customer_account_codes").select("id, customer_id, code_hash, attempts, expires_at").eq("seller_id", seller.id).eq("email", email).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || row.attempts >= 6 || new Date(row.expires_at) <= new Date() || row.code_hash !== hashAccountCode(code, seller.id, email)) {
    if (row) await admin.from("customer_account_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return NextResponse.json({ error: "That code is incorrect or has expired" }, { status: 400 });
  }

  const passwordHash = await hashCustomerPassword(password);
  const { data: account, error } = await admin.from("customer_accounts").upsert({ seller_id: seller.id, customer_id: row.customer_id, email, password_hash: passwordHash, activated_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "seller_id,customer_id" }).select("id").single();
  if (error || !account) return NextResponse.json({ error: "Could not activate account" }, { status: 500 });
  await admin.from("customer_account_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
  const session = await createCustomerSession(account.id, seller.id);
  const response = NextResponse.json({ ok: true });
  setCustomerSessionCookie(response, session.token, session.expiresAt);
  return response;
}
