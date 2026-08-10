import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { registerStitchWebhook } from "../../../../lib/stitch";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

/* One-time setup helper: registers this app's Stitch webhook via POST
   /api/v1/webhook, same reasoning as
   app/api/unik/admin/register-webhook/route.ts's identical Yoco version.
   Gated behind the same ADMIN_PIN used by /api/verify-admin so the
   response (which includes the webhook signing secret, shown only once)
   can't be read by a stranger who finds this URL.

   Run this ONCE, from the deployed environment (Stitch needs a real
   public HTTPS URL, not localhost) -- e.g.
     curl -X POST https://<your-deployed-domain>/api/admin/register-stitch-webhook \
       -H "Content-Type: application/json" -d '{"pin":"<ADMIN_PIN>"}'
   then copy the returned secret into STITCH_WEBHOOK_SECRET in Vercel and
   redeploy. Re-running this after a URL is already registered returns a
   409 per Stitch's docs -- delete the old endpoint from the Stitch
   dashboard's Webhooks page first if you need to re-register. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("register-stitch-webhook:" + ip, 5, 300).allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again in 5 minutes." }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  if (body?.pin !== adminPin) return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });

  const webhookUrl = `${APP_ORIGIN}/api/checkout/stitch-webhook`;

  try {
    const { secret } = await registerStitchWebhook(webhookUrl);
    // Surfaced once here so it can be copied into STITCH_WEBHOOK_SECRET in
    // Vercel -- Stitch will not return it again on any later call.
    return NextResponse.json({ ok: true, webhookUrl, secret });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not register Stitch webhook" }, { status: 502 });
  }
}
