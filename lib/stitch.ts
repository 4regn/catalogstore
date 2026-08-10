import crypto from "node:crypto";

// Server-only Stitch Express API integration. Client ID/secret and webhook
// secret are platform-wide Vercel env vars (STITCH_CLIENT_ID,
// STITCH_CLIENT_SECRET, STITCH_WEBHOOK_SECRET) -- same shape as
// YOCO_SECRET_KEY/YOCO_WEBHOOK_SECRET in lib/yoco.ts, one shared merchant
// account rather than per-seller credentials.
//
// Two distinct Stitch products live in this file:
//   - Payment Links (createStitchPaymentLink) -- a plain one-time charge,
//     needs only the default client_paymentrequest scope. This is what the
//     generic storefront checkout (app/api/checkout/stitch-redirect) uses.
//   - Card Consent (createStitchCardConsent and friends, below) -- saves the
//     card for a later re-charge, needs the separate
//     client_recurringpaymentconsentrequest scope, which Stitch gates
//     behind manual approval (confirmed via scripts/check-stitch-access.ts
//     for the TEST client -- LIVE approval is a separate request to
//     express-support@stitch.money, not yet granted as of this writing).
//     This is reserved for SETLA's recurring-instalment automation, a
//     later phase -- not used by the generic checkout.
const STITCH_BASE_URL = "https://express.stitch.money/api/v1";
const RECURRING_SCOPE = "client_recurringpaymentconsentrequest";
const PAYMENT_REQUEST_SCOPE = "client_paymentrequest";

// Tokens expire after 15 minutes (Stitch's own limit) -- cached per scope
// in module scope so a warm serverless instance reuses one token across
// requests instead of round-tripping for every single API call. Refetched
// 60s before actual expiry so an in-flight request never gets handed a
// token that expires mid-call.
const TOKEN_TTL_MS = 15 * 60 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getStitchToken(scope: string): Promise<string> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) return cached.token;

  const clientId = process.env.STITCH_CLIENT_ID;
  const clientSecret = process.env.STITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Stitch is not configured (missing STITCH_CLIENT_ID/STITCH_CLIENT_SECRET)");
  }

  const res = await fetch(`${STITCH_BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret, scope }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.data?.accessToken) {
    throw new Error(data?.generalErrors?.[0] || data?.message || `Could not get Stitch token (${res.status})`);
  }
  const token: string = data.data.accessToken;
  tokenCache.set(scope, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

export type StitchPaymentLinkStatus = "PENDING" | "EXPIRED" | "PAID" | "CANCELLED";

export type StitchPaymentLink = {
  id: string;
  link: string;
  status: StitchPaymentLinkStatus;
};

// One-time charge -- this is what the generic storefront checkout
// (app/api/checkout/stitch-redirect) actually uses today. Only needs the
// default client_paymentrequest scope (no special approval), unlike
// createStitchCardConsent below. The customer is sent to the returned
// `link`, enters their card, and pays amountCents once -- no card is
// saved, nothing to charge again later.
export async function createStitchPaymentLink(opts: {
  payerName: string;
  email?: string;
  merchantReference: string; // our own reference (e.g. orderId) -- echoed back on the webhook/GET lookup
  amountCents: number;
  redirectUrl?: string; // where Stitch sends the customer's browser after they finish -- must be a redirect URL registered in the Stitch dashboard
}): Promise<StitchPaymentLink> {
  const token = await getStitchToken(PAYMENT_REQUEST_SCOPE);
  const res = await fetch(`${STITCH_BASE_URL}/payment-links`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: opts.amountCents,
      payerName: opts.payerName,
      merchantReference: opts.merchantReference,
      ...(opts.email ? { payerEmailAddress: opts.email } : {}),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.data?.payment?.id || !data?.data?.payment?.link) {
    throw new Error(data?.generalErrors?.[0] || data?.message || `Could not create Stitch payment link (${res.status})`);
  }
  const link = opts.redirectUrl ? `${data.data.payment.link}?redirect_url=${encodeURIComponent(opts.redirectUrl)}` : data.data.payment.link;
  return { id: data.data.payment.id, link, status: data.data.payment.status };
}

export type StitchConsentStatus = "PENDING" | "CONSENTED";

export type StitchCardConsent = {
  id: string;
  url: string;
  status: StitchConsentStatus;
};

// Creates the consent request AND charges initialAmountCents as part of
// the same flow -- the customer is sent to the returned `url`, enters
// their card, pays initialAmountCents, and grants consent to be charged
// again later, all in one Stitch-hosted step. This is the "first payment"
// leg (currently Yoco) once that gets rewired -- not done as part of this
// change; see the checkout-flow comment in
// app/api/checkout/stitch-webhook/route.ts.
export async function createStitchCardConsent(opts: {
  payerFullName: string;
  email: string;
  payerId: string; // our own reference (e.g. this seller's customer/order id) -- echoed back on payments against this consent
  initialAmountCents: number;
  redirectUrl?: string; // where Stitch sends the customer's browser after they finish -- must be a redirect URL registered in the Stitch dashboard
}): Promise<StitchCardConsent> {
  const token = await getStitchToken(RECURRING_SCOPE);
  const res = await fetch(`${STITCH_BASE_URL}/card-consents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      payerFullName: opts.payerFullName,
      email: opts.email,
      payerId: opts.payerId,
      initialAmount: opts.initialAmountCents,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.data?.id || !data?.data?.url) {
    throw new Error(data?.generalErrors?.[0] || data?.message || `Could not create Stitch card consent (${res.status})`);
  }
  const url = opts.redirectUrl ? `${data.data.url}?redirect_url=${encodeURIComponent(opts.redirectUrl)}` : data.data.url;
  return { id: data.data.id, url, status: data.data.status };
}

export type StitchConsentPayment = {
  id: string;
  amount: number;
  paidAt: string | null;
  status: string;
  type: "LINK" | "CONSENT" | "SUBSCRIPTION";
};

// Fallback verification (same reasoning as getYocoCheckout in lib/yoco.ts):
// checking a consent's own payment history directly, for when webhook
// delivery is slow or misconfigured, rather than depending on it alone.
export async function getStitchCardConsent(consentRequestId: string): Promise<{ id: string; status: StitchConsentStatus; payments: StitchConsentPayment[] } | null> {
  const token = await getStitchToken(RECURRING_SCOPE);
  const res = await fetch(`${STITCH_BASE_URL}/card-consents/${encodeURIComponent(consentRequestId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.data?.cardConsent) return null;
  return data.data.cardConsent;
}

export type StitchInitiatePaymentResult =
  | { ok: true; paymentId: string; amountCents: number; status: string }
  | { ok: false; reauthorisationRequired: true }
  | { ok: false; reauthorisationRequired: false; error: string };

// Charges an already-CONSENTED card for a subsequent instalment -- no
// customer interaction, driven entirely by our own schedule
// (lib/setla-instalments.ts). Per Stitch's docs this can throw a
// reauthorisation_required error if the cardholder needs to re-verify
// (e.g. 3DS step-up); surfaced as a distinct result so a caller can route
// the customer back through a fresh consent flow instead of silently
// retrying a doomed charge.
export async function initiateStitchConsentPayment(consentRequestId: string, amountCents: number): Promise<StitchInitiatePaymentResult> {
  const token = await getStitchToken(RECURRING_SCOPE);
  const res = await fetch(`${STITCH_BASE_URL}/card-consents/${encodeURIComponent(consentRequestId)}/initiate-payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountCents }),
  });
  const data = await res.json().catch(() => null);
  if (res.ok && data?.data?.payment?.id) {
    return { ok: true, paymentId: data.data.payment.id, amountCents: Number(data.data.payment.amount) || amountCents, status: data.data.payment.status };
  }
  const errMsg: string = data?.generalErrors?.[0] || data?.message || "";
  if (/reauthoris/i.test(errMsg)) {
    return { ok: false, reauthorisationRequired: true };
  }
  return { ok: false, reauthorisationRequired: false, error: errMsg || `Could not charge saved card (${res.status})` };
}

/* Stitch signs webhooks via Svix -- identical scheme to Yoco's own (see
   lib/yoco.ts's verifyYocoWebhookSignature, which this mirrors near-
   verbatim): signedContent = `${svixId}.${svixTimestamp}.${rawBody}`,
   HMAC-SHA256 with the base64-decoded portion of the "whsec_..." secret,
   base64-encoded, compared against one or more "v1,<sig>" entries in the
   svix-signature header. Timestamp checked against replay within a 5
   minute window. */
export function verifyStitchWebhookSignature(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string }
): boolean {
  const secret = process.env.STITCH_WEBHOOK_SECRET;
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

// One-time setup: registers our webhook URL with Stitch. Per their docs
// the signing secret is returned ONLY on this call and can never be
// re-fetched -- meant to be called once, via
// app/api/admin/register-stitch-webhook/route.ts, with the returned secret
// copied straight into STITCH_WEBHOOK_SECRET. No REQUIRED SCOPE is
// documented for this endpoint (unlike card-consents/subscriptions), so
// the base payment-request scope is used.
export async function registerStitchWebhook(url: string): Promise<{ secret: string }> {
  const token = await getStitchToken(PAYMENT_REQUEST_SCOPE);
  const res = await fetch(`${STITCH_BASE_URL}/webhook`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.data?.secret) {
    throw new Error(data?.generalErrors?.[0] || data?.message || `Could not register Stitch webhook (${res.status})`);
  }
  return { secret: data.data.secret };
}

/* One-time setup: registers a redirect URL Stitch will send the customer's
   browser back to after a card-consent flow finishes (success OR
   cancellation -- Stitch's docs don't distinguish the two via the URL
   itself). Unlike Yoco's successUrl/cancelUrl/failureUrl (fully dynamic
   per checkout), Stitch caps this at 5 PRE-REGISTERED exact URLs per
   account -- there is no documented guarantee that arbitrary extra query
   params (e.g. our own orderId) survive or are even accepted alongside a
   registered URL, so this app registers ONE static bridge URL
   (app/checkout/stitch-return/page.tsx) and carries the actual orderId/
   slug across the redirect via sessionStorage instead (set by
   CheckoutPageClient right before navigating to Stitch), the same way a
   same-tab full-page redirect flow would in any OAuth-style handoff with
   a fixed allow-listed callback. Called once via
   app/api/admin/register-stitch-redirect-url/route.ts. */
export async function registerStitchRedirectUrl(url: string): Promise<{ redirectUrls: string[] }> {
  const token = await getStitchToken(PAYMENT_REQUEST_SCOPE);
  const res = await fetch(`${STITCH_BASE_URL}/redirect-urls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ redirectUrl: url }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.data?.redirectUrls) {
    throw new Error(data?.generalErrors?.[0] || data?.message || `Could not register Stitch redirect URL (${res.status})`);
  }
  return { redirectUrls: data.data.redirectUrls };
}
