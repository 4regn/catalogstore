import { createHmac, timingSafeEqual } from "crypto";

const FLOAT_UAT_ORIGIN = "https://uat-secure.float.co.za";
const FLOAT_LIVE_ORIGIN = "https://secure.float.co.za";

function credentials() {
  const clientSecret = process.env.FLOAT_CLIENT_SECRET;
  const signingKey = process.env.FLOAT_SIGNING_KEY;
  if (!clientSecret || !signingKey) throw new Error("Float credentials are not configured");
  return { clientSecret, signingKey };
}

function apiOrigin(): string {
  return process.env.FLOAT_ENVIRONMENT === "production" ? FLOAT_LIVE_ORIGIN : FLOAT_UAT_ORIGIN;
}

export type FloatCheckoutInput = {
  amountCents: number;
  orderId: string;
  notifyUrl: string;
  successUrl: string;
  cancelUrl: string;
  customer: {
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
    billingAddress?: string;
  };
  displayName: string;
};

export async function createFloatCheckout(input: FloatCheckoutInput): Promise<{ id: string; paymentUrl: string }> {
  const { clientSecret, signingKey } = credentials();
  const payload = {
    checkout: {
      amount: input.amountCents,
      currency: "ZAR",
      client_reference_id: input.orderId,
      notify_url: input.notifyUrl,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer: {
        first_name: input.customer.firstName || undefined,
        last_name: input.customer.lastName || undefined,
        email: input.customer.email,
        phone_number: input.customer.phone || undefined,
        billing_address: input.customer.billingAddress || undefined,
      },
      // A single reconciled line keeps the displayed summary equal to the
      // server-calculated payable total after shipping and discounts.
      line_items: [{ name: input.displayName, amount: input.amountCents, quantity: 1 }],
    },
  };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha512", signingKey).update(body).digest("base64");
  const response = await fetch(`${apiOrigin()}/api/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clientSecret}`,
      "Content-Type": "application/json",
      "X-Signature": signature,
    },
    body,
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = json?.errors?.[0]?.detail || json?.error || `Float returned ${response.status}`;
    throw new Error(detail);
  }
  const id = json?.data?.id;
  const paymentUrl = json?.data?.payment_url;
  if (!id || !paymentUrl) throw new Error("Float did not return a checkout URL");
  return { id, paymentUrl };
}

export function verifyFloatSignature(rawBody: string, suppliedSignature: string): boolean {
  const signingKey = process.env.FLOAT_SIGNING_KEY;
  if (!signingKey || !suppliedSignature) return false;
  const expected = createHmac("sha512", signingKey).update(rawBody).digest("base64");
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(suppliedSignature);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}
