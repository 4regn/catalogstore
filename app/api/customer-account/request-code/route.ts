import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { hashAccountCode } from "../../../../lib/customer-account";
import { sendEmail } from "../../../../lib/email";
import { getClientIP, rateLimit } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!rateLimit(`customer-code:${getClientIP(req)}`, 5, 600).allowed) return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  let body: { slug?: string; email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const slug = String(body.slug || "").trim().toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  if (!slug || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });

  const admin = getAdmin();
  const { data: seller } = await admin.from("sellers").select("id, store_name, template").eq("subdomain", slug).maybeSingle();
  if (!seller || seller.template !== "4regn") return NextResponse.json({ error: "Store not found" }, { status: 404 });
  const { data: customer } = await admin.from("customers").select("id, first_name").eq("seller_id", seller.id).ilike("email", email).maybeSingle();

  // Do not reveal whether an address exists in the imported customer list.
  if (!customer) return NextResponse.json({ ok: true, message: "If that email is linked to a customer, a confirmation code is on its way." });

  const code = String(randomInt(100000, 1000000));
  await admin.from("customer_account_codes").update({ consumed_at: new Date().toISOString() }).eq("seller_id", seller.id).eq("email", email).is("consumed_at", null);
  const { error } = await admin.from("customer_account_codes").insert({
    seller_id: seller.id,
    customer_id: customer.id,
    email,
    code_hash: hashAccountCode(code, seller.id, email),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  if (error) return NextResponse.json({ error: "Customer accounts are not ready. Run the customer account migration first." }, { status: 503 });

  await sendEmail({
    to: email,
    subject: `${seller.store_name} account confirmation code`,
    html: `<div style="background:#f5f5f3;padding:36px 18px;font-family:Arial,sans-serif;color:#171717"><div style="max-width:520px;margin:auto;background:#fff;border:1px solid #deded9;border-radius:20px;padding:36px"><div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#777">${seller.store_name}</div><h1 style="font-size:28px;margin:16px 0 10px">Confirm your account</h1><p style="font-size:14px;line-height:1.7;color:#555">Hi ${customer.first_name || "there"}, enter this unique code to link your existing customer record and create your password.</p><div style="margin:26px 0;padding:20px;border-radius:14px;background:#111;color:#fff;text-align:center;font-size:32px;font-weight:800;letter-spacing:.22em">${code}</div><p style="font-size:12px;color:#777">This code expires in 15 minutes. If you did not request it, you can safely ignore this email.</p></div></div>`,
  });
  return NextResponse.json({ ok: true, message: "If that email is linked to a customer, a confirmation code is on its way." });
}
