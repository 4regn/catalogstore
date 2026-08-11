// Imports 4regn's real Shopify "Buy X Get Y" discounts into
// automatic_bxgy_discounts -- confirmed via scripts/inspect-4regn-bxgy-discounts.ts
// against the real store to be genuine DiscountAutomaticBxgy (automatic,
// no code) with this exact shape: buy 1 (or 2) items from a collection,
// get 1 more from the same collection at a fixed amount or percentage off.
//
// Unlike scripts/import-4regn-discounts.ts (which only writes DISPLAY
// badges), this writes real checkout-functional rows -- see
// lib/automatic-discounts.ts for the pricing math and
// app/api/checkout/place-order/route.ts for where it's applied.
//
// Collection eligibility is resolved the same way the badge-import script
// already does it: Shopify collection title -> a name appearing in our
// products.category comma-list (FourRegnStore.tsx's own convention).
//
// Percentage effect is Shopify's raw customerGets.value fraction (0..1,
// e.g. 1 = 100% = fully free) -- converted to this platform's 0-100 scale
// on write.
//
// Usage:
//   npx tsx scripts/import-4regn-bxgy-discounts.ts --seller=owner@4regn.com [--domain=your-store.myshopify.com --token=shpat_xxx] [--api-version=2024-10] [--dry-run]
// (domain/token fall back to SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN in .env.local)

import { loadDotEnvLocal, getAdminClient, resolveSeller, shopifyGraphQL, fetchAllRows } from "./lib/migrate-shared";

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
    console.error("Usage: npx tsx scripts/import-4regn-bxgy-discounts.ts --seller=owner@example.com [--domain=your-store.myshopify.com --token=shpat_xxx] [--dry-run]");
    process.exit(1);
  }
  return out as { domain: string; token: string; apiVersion: string; seller: string; dryRun: boolean };
}

const QUERY = `query($cursor: String) {
  discountNodes(first: 50, after: $cursor) {
    edges {
      cursor
      node {
        id
        discount {
          __typename
          ... on DiscountAutomaticBxgy {
            title
            status
            startsAt
            endsAt
            customerBuys {
              value { __typename ... on DiscountQuantity { quantity } }
              items {
                __typename
                ... on DiscountCollections { collections(first: 50) { edges { node { id title } } } }
              }
            }
            customerGets {
              value {
                __typename
                ... on DiscountOnQuantity {
                  quantity { quantity }
                  effect {
                    __typename
                    ... on DiscountAmount { amount { amount } }
                    ... on DiscountPercentage { percentage }
                  }
                }
              }
              items {
                __typename
                ... on DiscountCollections { collections(first: 50) { edges { node { id title } } } }
              }
            }
          }
        }
      }
    }
    pageInfo { hasNextPage }
  }
}`;

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  console.log(`\nFetching automatic BXGY discounts from ${args.domain} (API ${args.apiVersion})...`);

  let cursor: string | null = null;
  let hasNext = true;
  const nodes: any[] = [];
  while (hasNext) {
    const data: any = await shopifyGraphQL(args.domain, args.token, args.apiVersion, QUERY, { cursor });
    const edges = data.discountNodes.edges;
    for (const e of edges) if (e.node.discount?.__typename === "DiscountAutomaticBxgy") nodes.push(e.node);
    hasNext = data.discountNodes.pageInfo.hasNextPage;
    cursor = edges.length ? edges[edges.length - 1].cursor : null;
  }

  console.log(`Found ${nodes.length} DiscountAutomaticBxgy node(s).`);

  const products = await fetchAllRows<{ id: string; category: string | null }>(
    admin, "products", "id, category", (q) => q.eq("seller_id", sellerId)
  );
  const knownCollectionNames = new Set<string>();
  for (const p of products) {
    for (const c of (p.category || "").split(",").map((c) => c.trim()).filter(Boolean)) knownCollectionNames.add(c);
  }

  const rows: any[] = [];
  const skipped: { title: string; reason: string }[] = [];

  for (const n of nodes) {
    const d = n.discount;
    if ((d.status || "").toUpperCase() !== "ACTIVE") continue;

    const buyQty = Number(d.customerBuys?.value?.quantity);
    const getQty = Number(d.customerGets?.value?.quantity?.quantity);
    if (!buyQty || !getQty) { skipped.push({ title: d.title, reason: "missing buy/get quantity -- unrecognized shape, not this platform's known DiscountQuantity/DiscountOnQuantity pattern" }); continue; }

    const buyCollections: string[] = (d.customerBuys?.items?.collections?.edges || []).map((e: any) => e.node.title).filter((t: string) => knownCollectionNames.has(t));
    const getCollections: string[] = (d.customerGets?.items?.collections?.edges || []).map((e: any) => e.node.title).filter((t: string) => knownCollectionNames.has(t));
    if (!buyCollections.length || !getCollections.length) { skipped.push({ title: d.title, reason: "no known collection match (product-scoped or unmatched collection title -- not this platform's supported shape yet)" }); continue; }

    const effect = d.customerGets?.value?.effect;
    let effectType: "fixed_amount" | "percentage";
    let effectValue: number;
    if (effect?.__typename === "DiscountAmount") {
      effectType = "fixed_amount";
      effectValue = Number(effect.amount?.amount) || 0;
    } else if (effect?.__typename === "DiscountPercentage") {
      effectType = "percentage";
      // Shopify returns this as a 0..1 fraction (confirmed: 1 = 100% =
      // fully free, matching "buy 2 get a 3rd free") -- this platform's
      // own percentage scale is 0-100, same as discount_codes.value.
      effectValue = (Number(effect.percentage) || 0) * 100;
    } else {
      skipped.push({ title: d.title, reason: `unrecognized customerGets effect type: ${effect?.__typename}` });
      continue;
    }

    rows.push({
      seller_id: sellerId,
      title: d.title,
      buy_quantity: buyQty,
      buy_collection_names: buyCollections,
      get_quantity: getQty,
      get_collection_names: getCollections,
      effect_type: effectType,
      effect_value: effectValue,
      active: true,
      starts_at: d.startsAt || null,
      ends_at: d.endsAt || null,
      source: "shopify_import",
      external_id: n.id,
    });
  }

  console.log(`\n${rows.length} row(s) would be written:`);
  for (const r of rows) console.log(`  - "${r.title}": buy ${r.buy_quantity} from [${r.buy_collection_names.join(", ")}], get ${r.get_quantity} from [${r.get_collection_names.join(", ")}] at ${r.effect_type === "percentage" ? r.effect_value + "% off" : "R" + r.effect_value + " off"}`);
  if (skipped.length) {
    console.log(`\n${skipped.length} skipped:`);
    for (const s of skipped) console.log(`  - "${s.title}": ${s.reason}`);
  }

  const existing = await fetchAllRows<{ id: string; external_id: string | null; active: boolean }>(
    admin, "automatic_bxgy_discounts", "id, external_id, active", (q) => q.eq("seller_id", sellerId).eq("source", "shopify_import")
  );
  const freshExternalIds = new Set(rows.map((r) => r.external_id));
  const toDeactivate = existing.filter((e) => e.active && e.external_id && !freshExternalIds.has(e.external_id));
  console.log(`\n${existing.length} previously-imported row(s) found; ${toDeactivate.length} would be deactivated.`);

  if (args.dryRun) {
    console.log("\n--dry-run: no changes written.");
    return;
  }

  if (rows.length) {
    const { error } = await admin.from("automatic_bxgy_discounts").upsert(rows, { onConflict: "seller_id,external_id" });
    if (error) console.error("Upsert failed:", error);
    else console.log(`\n${rows.length} row(s) upserted.`);
  }
  if (toDeactivate.length) {
    await admin.from("automatic_bxgy_discounts").update({ active: false }).in("id", toDeactivate.map((e) => e.id));
    console.log(`${toDeactivate.length} stale row(s) deactivated.`);
  }

  console.log("\nDone. Safe to re-run -- recomputes everything fresh from Shopify each time.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
