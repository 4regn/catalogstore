import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";
const YOCO_WEBHOOKS_URL = "https://payments.yoco.com/api/webhooks";

/* One-time setup helper: registers this app's Yoco checkout webhook via
   Yoco's API (there is no dashboard toggle for this -- it's POST
   /api/webhooks, per Yoco's own docs). Gated behind the same ADMIN_PIN
   used by /api/verify-admin so the response (which includes the webhook
   signing secret, shown only once) can't be read by a stranger who finds
   this URL. Delete this route once the webhook is registered -- it has
   no further purpose after that. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("unik-register-webhook:" + ip, 5, 300).allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again in 5 minutes." }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  if (body?.pin !== adminPin) return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });

  const secretKey = process.env.YOCO_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: "YOCO_SECRET_KEY is not set in this environment" }, { status: 500 });

  const webhookUrl = `${APP_ORIGIN}/api/unik/checkout/webhook`;

  const res = await fetch(YOCO_WEBHOOKS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "unik-checkout", url: webhookUrl }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json({ error: data?.message || data?.error || `Yoco returned ${res.status}`, raw: data }, { status: 502 });
  }

  // The secret is only ever returned in this response -- surfaced here
  // once so it can be copied into YOCO_WEBHOOK_SECRET in Vercel.
  return NextResponse.json({ ok: true, webhookUrl, yocoResponse: data });
}
