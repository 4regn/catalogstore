// Imports a Shopify store's real legal policy content (Shipping, Refund,
// Privacy, Terms of Service) straight from Shopify's own Admin GraphQL API
// -- the same `shop { ... }` object Shopify's own storefront reads these
// from -- and writes them into this platform's sellers.store_config JSONB
// column (shipping_policy / return_policy / privacy_policy /
// terms_of_service keys; see app/dashboard/editor/page.tsx, which reads and
// writes those same four keys off store_config, not real columns on
// `sellers`).
//
// Usage:
//   npx tsx scripts/import-4regn-policies.ts --seller=owner@example.com [--domain=your-store.myshopify.com --token=shpat_xxx] [--api-version=2024-10] [--dry-run]
// (domain/token fall back to SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN
// in .env.local, exactly like export-shopify-collections.ts)

import { loadDotEnvLocal, getAdminClient, resolveSeller, shopifyGraphQL, htmlToParagraphs, withTimeout } from "./lib/migrate-shared";

function parseArgs() {
  const out: { domain?: string; token?: string; apiVersion: string; seller?: string; dryRun: boolean } = {
    apiVersion: "2024-10",
    dryRun: false,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--domain=")) out.domain = arg.slice("--domain=".length);
    else if (arg.startsWith("--token=")) out.token = arg.slice("--token=".length);
    else if (arg.startsWith("--api-version=")) out.apiVersion = arg.slice("--api-version=".length);
    else if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
  }
  loadDotEnvLocal();
  out.domain = out.domain || process.env.SHOPIFY_STORE_DOMAIN;
  out.token = out.token || process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!out.domain || !out.token || !out.seller) {
    console.error(
      "Usage: npx tsx scripts/import-4regn-policies.ts --seller=owner@example.com [--domain=your-store.myshopify.com --token=shpat_xxx] [--dry-run]\n" +
      "(domain/token fall back to SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN in .env.local)"
    );
    process.exit(1);
  }
  return out as { domain: string; token: string; apiVersion: string; seller: string; dryRun: boolean };
}

interface ShopPolicies {
  shop: {
    shippingPolicy: { body: string } | null;
    refundPolicy: { body: string } | null;
    privacyPolicy: { body: string } | null;
    termsOfService: { body: string } | null;
  };
}

// Maps Shopify's shop-policy field name to this platform's store_config key
// (see app/dashboard/editor/page.tsx lines around 555-558 / 806-859).
const POLICY_FIELD_MAP: { shopifyField: keyof ShopPolicies["shop"]; storeConfigKey: string; label: string }[] = [
  { shopifyField: "shippingPolicy", storeConfigKey: "shipping_policy", label: "Shipping Policy" },
  { shopifyField: "refundPolicy", storeConfigKey: "return_policy", label: "Refund Policy" },
  { shopifyField: "privacyPolicy", storeConfigKey: "privacy_policy", label: "Privacy Policy" },
  { shopifyField: "termsOfService", storeConfigKey: "terms_of_service", label: "Terms of Service" },
];

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  console.log(`\nFetching shop policies from ${args.domain} (API ${args.apiVersion})...`);
  const data = await shopifyGraphQL<ShopPolicies>(
    args.domain, args.token, args.apiVersion,
    `query {
      shop {
        shippingPolicy { body }
        refundPolicy { body }
        privacyPolicy { body }
        termsOfService { body }
      }
    }`,
    {}
  );

  const found: { storeConfigKey: string; label: string; text: string }[] = [];
  console.log("\nPolicy summary:");
  for (const { shopifyField, storeConfigKey, label } of POLICY_FIELD_MAP) {
    const raw = data.shop[shopifyField]?.body;
    if (!raw || !raw.trim()) {
      console.log(`  - ${label}: not found (Shopify returned null/empty body)`);
      continue;
    }
    const text = htmlToParagraphs(raw);
    if (!text) {
      console.log(`  - ${label}: not found (converted to empty text after stripping)`);
      continue;
    }
    const preview = text.slice(0, 150).replace(/\n/g, " ⏎ ");
    console.log(`  - ${label}: found, ${text.length} char(s) -- "${preview}${text.length > 150 ? "..." : ""}"`);
    found.push({ storeConfigKey, label, text });
  }

  if (found.length === 0) {
    console.log("\nNo policies found on this shop -- nothing to write.");
    return;
  }

  if (args.dryRun) {
    console.log(`\n--dry-run: ${found.length}/${POLICY_FIELD_MAP.length} polic(y/ies) would be written to store_config (${found.map((f) => f.storeConfigKey).join(", ")}). No changes written.`);
    return;
  }

  // Re-select store_config fresh right before the write, rather than
  // reusing resolveSeller's initial read, to minimize the race window
  // against any other concurrent write to this seller's store_config
  // (e.g. the dashboard editor saving other fields at the same time).
  const { data: freshSeller, error: fetchErr } = await withTimeout(
    admin.from("sellers").select("store_config").eq("id", sellerId).single(),
    "fetch current store_config"
  );
  if (fetchErr || !freshSeller) {
    console.error(`Failed to re-fetch current store_config: ${fetchErr?.message || "no row"}`);
    process.exit(1);
  }

  const currentConfig = (freshSeller.store_config as Record<string, unknown>) || {};
  const merged = { ...currentConfig };
  for (const { storeConfigKey, text } of found) merged[storeConfigKey] = text;

  const { error: updateErr } = await withTimeout(
    admin.from("sellers").update({ store_config: merged }).eq("id", sellerId),
    "update seller store_config"
  );
  if (updateErr) {
    console.error(`Failed to update store_config: ${updateErr.message}`);
    process.exit(1);
  }

  console.log(`\nDone. Wrote ${found.length} key(s) to store_config for ${seller.email}: ${found.map((f) => f.storeConfigKey).join(", ")}.`);
  const skipped = POLICY_FIELD_MAP.filter((p) => !found.some((f) => f.storeConfigKey === p.storeConfigKey));
  if (skipped.length) {
    console.log(`(${skipped.map((s) => s.storeConfigKey).join(", ")} left untouched -- Shopify had no content for ${skipped.length === 1 ? "it" : "them"}, existing values if any were preserved.)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
