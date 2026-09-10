import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { SETLA_CUSTOMER_ORIGIN } from "../../../../../lib/setla-email";

export const dynamic = "force-dynamic";

/* Always returns {ok:true} regardless of whether the email is registered
   -- no account-enumeration signal. Doesn't need the Supabase SDK
   client-side; resetPasswordForEmail just sends an email, it doesn't
   establish a session (that only happens once the customer clicks the
   link and lands on reset-password.html, the one SETLA page that does
   load the SDK). */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Enter your email address" }, { status: 400 });
  if (!rateLimit("setla-forgot:" + ip + ":" + email, 3, 60).allowed) {
    return NextResponse.json({ ok: true });
  }

  // setla.4regn.com, not catalogstore.co.za -- most customers bought on
  // 4regn.com and have never heard of catalogstore.co.za (this platform's
  // own domain), so a reset link pointing there reads as suspicious. Same
  // reasoning as every other customer-facing SETLA link (see
  // SETLA_CUSTOMER_ORIGIN's own comment). Requires
  // "https://setla.4regn.com/**" to be listed under Supabase Auth's
  // Redirect URLs allowlist, or resetPasswordForEmail silently fails to
  // honour this redirectTo.
  await getAdmin()
    .auth.resetPasswordForEmail(email, { redirectTo: `${SETLA_CUSTOMER_ORIGIN}/reset-password` })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
