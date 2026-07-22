import crypto from "node:crypto";

// Server-only Yoco Checkout API integration for the private UNIK Labs
// storefront. Secret key and webhook secret are platform-wide Vercel env
// vars (YOCO_SECRET_KEY, YOCO_WEBHOOK_SECRET) -- not per-seller
// checkout_config -- because this integration is exclusive to one seller.
const YOCO_CHECKOUTS_URL = "https://payments.yoco.com/api/checkouts";

// Fallback verification for when webhook delivery is slow/misconfigured --
// called when a customer lands back on the success page so we're never
// fully dependent on the webhook alone. A populated paymentId is the
// clearest unambiguous "this checkout was paid" signal (it's null until
// payment completes, per Yoco's own checkout-creation response example).
export async function getYocoCheckout(checkoutId: string): Promise<{ id: string; status: string; amount: number; paymentId: string | null } | null> {
  const secretKey = process.env.YOCO_SECRET_KEY;
  if (!secretKey || !checkoutId) return null;
  try {
    const res = await fetch(`${YOCO_CHECKOUTS_URL}/${encodeURIComponent(checkoutId)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, status: data.status, amount: Number(data.amount) || 0, paymentId: data.paymentId || null };
  } catch {
    return null;
  }
}

export type YocoLineItem = {
  displayName: string;
  quantity: number;
  pricingDetails: { price: number }; // cents
};

export async function createYocoCheckout(opts: {
  amountCents: number;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  failureUrl: string;
  lineItems?: YocoLineItem[];
}): Promise<{ id: string; redirectUrl: string }> {
  const secretKey = process.env.YOCO_SECRET_KEY;
  if (!secretKey) throw new Error("Yoco is not configured (missing YOCO_SECRET_KEY)");

  const res = await fetch(YOCO_CHECKOUTS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: opts.amountCents,
      currency: "ZAR",
      successUrl: opts.successUrl,
      cancelUrl: opts.cancelUrl,
      failureUrl: opts.failureUrl,
      metadata: opts.metadata,
      ...(opts.lineItems?.length ? { lineItems: opts.lineItems } : {}),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.redirectUrl || !data?.id) {
    throw new Error(data?.message || data?.error || `Could not create Yoco checkout (${res.status})`);
  }
  return { id: data.id, redirectUrl: data.redirectUrl };
}

/* Yoco signs webhooks using the same scheme as Svix/Standard Webhooks:
   signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`, HMAC-SHA256
   with the base64-decoded portion of the "whsec_..." secret, base64-encoded,
   compared against one or more "v1,<sig>" entries in the webhook-signature
   header. Timestamp is checked against replay within a 5 minute window. */
export function verifyYocoWebhookSignature(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string }
): boolean {
  const secret = process.env.YOCO_WEBHOOK_SECRET;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;

  const ts = parseInt(headers.timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;

  const secretBytes = Buffer.from(secret.split("_")[1] || "", "base64");
  if (secretBytes.length === 0) return false;

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  const candidates = headers.signature.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
  return candidates.some((sig) => {
    try {
      const sigBuf = Buffer.from(sig);
      return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}
