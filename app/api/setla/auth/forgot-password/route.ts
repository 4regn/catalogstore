import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// Fixed, not derived from req.url -- see apply/finish/route.ts for why.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

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

  await getAdmin()
    .auth.resetPasswordForEmail(email, { redirectTo: `${APP_ORIGIN}/setla/reset-password.html` })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
