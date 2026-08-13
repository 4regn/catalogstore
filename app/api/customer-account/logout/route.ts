import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { clearCustomerSessionCookie, CUSTOMER_SESSION_COOKIE } from "../../../../lib/customer-account";
import { getAdmin } from "../../../../lib/supabase-admin";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value || "";
  if (token) await getAdmin().from("customer_account_sessions").delete().eq("token_hash", createHash("sha256").update(token).digest("hex"));
  const response = NextResponse.json({ ok: true });
  clearCustomerSessionCookie(response);
  return response;
}
