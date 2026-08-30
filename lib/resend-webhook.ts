import crypto from "node:crypto";

/**
 * Resend webhooks use the Standard Webhooks / Svix signature format. Keeping
 * verification local avoids trusting a public endpoint simply because it
 * carries a plausible-looking email address.
 */
export function verifyResendWebhookSignature(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string },
): boolean {
  const secret = process.env.FOUR_REGN_RESEND_WEBHOOK_SECRET;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;

  const timestamp = Number.parseInt(headers.timestamp, 10);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 5 * 60) return false;

  const secretBytes = Buffer.from(secret.split("_")[1] || "", "base64");
  if (!secretBytes.length) return false;

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBytes = Buffer.from(expected);

  return headers.signature.split(" ").some((part) => {
    const signature = part.split(",")[1];
    if (!signature) return false;
    try {
      const receivedBytes = Buffer.from(signature, "base64");
      return receivedBytes.length === expectedBytes.length && crypto.timingSafeEqual(receivedBytes, expectedBytes);
    } catch {
      return false;
    }
  });
}
