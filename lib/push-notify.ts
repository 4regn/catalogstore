import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Same "one platform-wide credential pair" shape as YOCO_SECRET_KEY/
// SMSPORTAL_CLIENT_ID -- generated once (npx web-push generate-vapid-keys)
// and set as Vercel env vars, not per-seller. VAPID_SUBJECT is a contact
// address push services can reach out to about this sender, required by
// the spec, not shown to end users.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@catalogstore.co.za";

let configured = false;
function ensureConfigured(): boolean {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  if (!configured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

/* Sends a browser push notification to every device a seller has enabled
   order alerts on (see /api/dashboard/push-subscribe and the service
   worker at public/order-push-sw.js). Silently no-ops if VAPID env vars
   aren't configured or the seller has no subscriptions -- this is an
   addition to the existing email notification, never a replacement, so a
   push failure here must never block or throw for the caller (both call
   sites -- markUnikOrderPaid and /api/notify-order -- already treat the
   seller-email send the same way). A subscription whose endpoint the push
   service reports as gone (404/410 -- the browser unsubscribed, the user
   uninstalled the PWA, etc) is deleted here so it stops being retried on
   every future order. */
export async function sendOrderPushToSeller(
  admin: SupabaseClient,
  sellerId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  if (!ensureConfigured()) return;
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("seller_id", sellerId);
  if (!subs || !subs.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("sendOrderPushToSeller: push send failed", { sellerId, status, message: err?.message });
        }
      }
    })
  );
}
