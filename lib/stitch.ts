import crypto from "node:crypto";

// Server-only Stitch Pay By Bank integration for the private UNIK Labs
// storefront, mirroring lib/yoco.ts. Secret key and webhook secret are
// platform-wide Vercel env vars (STITCH_CLIENT_ID, STITCH_CLIENT_SECRET,
// STITCH_WEBHOOK_SECRET) -- not per-seller checkout_config -- because this
// integration is exclusive to one seller, same as Yoco.
//
// NOTE: the exact request/response field names below are assembled from
// Stitch's public docs (docs.stitch.money) via search snippets -- this
// environment couldn't fetch the full doc pages directly. Verify against a
// real sandbox client before going live; the shape is a best-effort based on
// documented behavior (OAuth2 client-credentials token, REST v2 API,
// HMAC-SHA256 signed webhooks), not a tested integration.

const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_API_URL = "https://api.stitch.money/v2";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getStitchAccessToken(): Promise<string> {
  const clientId = process.env.STITCH_CLIENT_ID;
  const clientSecret = process.env.STITCH_CLIENT_SECRET;
  const scope = process.env.STITCH_SCOPE || "client_paymentrequest";
  if (!clientId || !clientSecret) throw new Error("Stitch is not configured (missing STITCH_CLIENT_ID/STITCH_CLIENT_SECRET)");

  // Reuse a cached token until 60s before expiry -- tokens live 3600s per
  // Stitch's docs, and this is a serverless function so the cache only
  // helps within a warm instance, but avoids a token round trip per request.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const res = await fetch(STITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      audience: STITCH_TOKEN_URL,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || `Could not authenticate with Stitch (${res.status})`);
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

// Fallback verification for when webhook delivery is slow/misconfigured --
// same self-heal role as getYocoCheckout in lib/yoco.ts.
export async function getStitchPaymentRequestStatus(paymentRequestId: string): Promise<{ id: string; status: string } | null> {
  if (!paymentRequestId) return null;
  try {
    const token = await getStitchAccessToken();
    const res = await fetch(`${STITCH_API_URL}/payment-requests/${encodeURIComponent(paymentRequestId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, status: data.status };
  } catch {
    return null;
  }
}

export async function createStitchPaymentRequest(opts: {
  amountRands: number;
  externalReference: string;
  redirectUrl: string; // Stitch redirects back here after the customer authorizes/cancels
}): Promise<{ id: string; url: string }> {
  const token = await getStitchAccessToken();

  const res = await fetch(`${STITCH_API_URL}/payment-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { quantity: opts.amountRands, currency: "ZAR" },
      externalReference: opts.externalReference,
      redirectUrl: opts.redirectUrl,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id || !data?.url) {
    throw new Error(data?.message || data?.error || `Could not create Stitch payment request (${res.status})`);
  }
  return { id: data.id, url: data.url };
}

/* Stitch signs webhooks with an X-Stitch-Signature header, HMAC-SHA256 over
   `${timestamp}.${rawBody}` using the webhook secret. The exact header
   format (single "t=...,v1=..." pair vs. Svix-style separate headers) isn't
   confirmed from docs snippets alone -- this assumes the common
   "t=<unix>,v1=<hex-or-base64 hmac>" convention. Verify against a real
   webhook delivery from the Stitch dashboard before relying on this in
   production, and adjust the parsing below if the real payload differs. */
export function verifyStitchWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.STITCH_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    })
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  try {
    const expectedBuf = Buffer.from(expected);
    const sigBuf = Buffer.from(signature);
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}
