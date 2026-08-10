import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { registerStitchRedirectUrl } from "../../../../lib/stitch";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

/* One-time setup helper: registers this app's Stitch redirect URL via POST
   /api/v1/redirect-urls -- same reasoning/gating as
   /api/admin/register-stitch-webhook. Run this ONCE, from the deployed
   environment, e.g.
     curl -X POST https://<your-deployed-domain>/api/admin/register-stitch-redirect-url \
       -H "Content-Type: application/json" -d '{"pin":"<ADMIN_PIN>"}'
   See lib/stitch.ts's registerStitchRedirectUrl for why this registers one
   static bridge URL rather than a dynamic per-order one. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("register-stitch-redirect-url:" + ip, 5, 300).allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again in 5 minutes." }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  if (body?.pin !== adminPin) return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });

  const redirectUrl = `${APP_ORIGIN}/checkout/stitch-return`;

  try {
    const { redirectUrls } = await registerStitchRedirectUrl(redirectUrl);
    return NextResponse.json({ ok: true, redirectUrl, allRegistered: redirectUrls });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not register Stitch redirect URL" }, { status: 502 });
  }
}
