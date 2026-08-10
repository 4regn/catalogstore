// Diagnoses (read-only) whether this Stitch Express account actually has
// Card Consent access. The dashboard's own "Payment experience" page has no
// toggle for it -- it's a customer-facing payment-methods screen (Pay by
// Card, Apple Pay, Capitec Pay, Pay Later), not an API-scope view. Per the
// API docs, Card Consent requires a separate grant from
// express-support@stitch.money on top of base merchant approval, and the
// only real way to know is to actually request a token with the
// client_recurringpaymentconsentrequest scope and see what comes back.
//
// Usage:
//   npx tsx scripts/check-stitch-access.ts
//
// Reads STITCH_CLIENT_ID / STITCH_CLIENT_SECRET from .env.local (same
// convention as scripts/lib/migrate-shared.ts's loadDotEnvLocal) or the
// real environment. If you only added these to Vercel's dashboard so far,
// pull them down first: `vercel env pull .env.local`.

import { loadDotEnvLocal } from "./lib/migrate-shared";

const TOKEN_URL = "https://express.stitch.money/api/v1/token";

async function requestToken(scope: string): Promise<{ ok: boolean; status: number; body: any }> {
  const clientId = process.env.STITCH_CLIENT_ID;
  const clientSecret = process.env.STITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Missing STITCH_CLIENT_ID / STITCH_CLIENT_SECRET in the environment.");
    process.exit(1);
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret, scope }),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  loadDotEnvLocal();

  console.log("Checking base credentials (client_paymentrequest scope)...");
  const base = await requestToken("client_paymentrequest");
  if (!base.ok) {
    console.log(`  FAILED (HTTP ${base.status}) -- clientId/clientSecret themselves look wrong.`);
    console.log(`  Response: ${JSON.stringify(base.body)}`);
    console.log("\nFix the credentials first; the recurring-payment check below won't be meaningful until this passes.");
  } else {
    console.log("  OK -- base credentials are valid.");
  }

  console.log("\nChecking Card Consent token scope (client_recurringpaymentconsentrequest)...");
  const recurring = await requestToken("client_recurringpaymentconsentrequest");
  if (recurring.ok) {
    // IMPORTANT: this only confirms Stitch's /token endpoint will mint a
    // token claiming this scope -- it does NOT confirm POST /card-consents
    // itself will actually accept requests. Confirmed the hard way: this
    // showed GRANTED while the real endpoint was still rejecting live
    // traffic with "Card Consent is not enabled for your client." Treat
    // this as "worth trying," not "confirmed working" -- the only real
    // proof is a successful POST /card-consents call (or Stitch support
    // explicitly confirming the endpoint itself, not just the scope).
    console.log("  Token scope granted -- but this does NOT prove POST /card-consents itself is enabled.");
    console.log("  Confirm with an actual test consent request, or ask Stitch support to confirm the endpoint directly, before relying on this.");
  } else if (recurring.status === 403) {
    console.log(`  NOT GRANTED (HTTP 403) -- credentials work, but this specific scope isn't enabled.`);
    console.log("  Email express-support@stitch.money and ask them to enable Card Consent for your client ID.");
    console.log(`  Response: ${JSON.stringify(recurring.body)}`);
  } else {
    console.log(`  FAILED (HTTP ${recurring.status})`);
    console.log(`  Response: ${JSON.stringify(recurring.body)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
