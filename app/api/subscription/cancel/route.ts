import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "";
const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "";

/* Cancel a seller's PayFast subscription.
   Previously the dashboard just set subscription_status="expired" client-side
   without telling PayFast — the card kept being billed forever and the
   seller had no idea. This:
   - verifies the caller owns the subscription (auth session)
   - calls PayFast's subscription cancel API with the saved token
   - on success, marks subscription_status="cancelled" so the store keeps
     working until the current period ends. The next ITN-FAILED or trial
     expiry transitions to "expired" naturally.
   - on PayFast failure, returns 502 so the dashboard surfaces the error;
     the row is NOT touched, preventing UI/billing desync. */

function signPayfast(data: Record<string, string>): string {
  const ordered = Object.keys(data)
    .filter((k) => k !== "signature")
    .sort()
    .map((k) => `${k}=${encodeURIComponent(data[k]).replace(/%20/g, "+")}`)
    .join("&");
  const withPassphrase = PAYFAST_PASSPHRASE ? ordered + "&passphrase=" + encodeURIComponent(PAYFAST_PASSPHRASE) : ordered;
  return crypto.createHash("md5").update(withPassphrase).digest("hex");
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get("sb-access-token")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { data: seller, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, payfast_subscription_token, subscription_status")
    .eq("id", userData.user.id)
    .single();
  if (sellerErr || !seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

  if (!seller.payfast_subscription_token) {
    /* Nothing to cancel at PayFast — just mark as cancelled locally.
       Happens on trial accounts that never converted. */
    await supabaseAdmin.from("sellers").update({ subscription_status: "cancelled" }).eq("id", seller.id);
    return NextResponse.json({ ok: true, note: "no_token" });
  }

  if (!PAYFAST_MERCHANT_ID || !PAYFAST_PASSPHRASE) {
    return NextResponse.json({ error: "Server is not configured for subscription cancellation. Contact support." }, { status: 503 });
  }

  /* PayFast subscription API: PUT /subscriptions/{token}/cancel
     Headers: merchant-id, version=v1, timestamp, signature (md5 of sorted
     headers + passphrase) */
  const timestamp = new Date().toISOString();
  const signature = signPayfast({
    "merchant-id": PAYFAST_MERCHANT_ID,
    "version": "v1",
    "timestamp": timestamp,
  });

  try {
    const pfRes = await fetch(`https://api.payfast.co.za/subscriptions/${seller.payfast_subscription_token}/cancel`, {
      method: "PUT",
      headers: {
        "merchant-id": PAYFAST_MERCHANT_ID,
        "version": "v1",
        "timestamp": timestamp,
        "signature": signature,
        "Content-Type": "application/json",
      },
    });

    if (!pfRes.ok) {
      const text = await pfRes.text().catch(() => "");
      console.error("PayFast cancel failed:", pfRes.status, text);
      return NextResponse.json({ error: "PayFast could not cancel the subscription. Please email support." }, { status: 502 });
    }

    /* PayFast accepted the cancel — mark seller cancelled. They keep
       access until the next billing date passes (handled elsewhere). */
    await supabaseAdmin
      .from("sellers")
      .update({ subscription_status: "cancelled" })
      .eq("id", seller.id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Subscription cancel network error:", e);
    return NextResponse.json({ error: "Network error contacting PayFast. Please try again." }, { status: 503 });
  }
}
