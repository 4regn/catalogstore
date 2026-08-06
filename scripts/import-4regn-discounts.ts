// Imports real Shopify discounts (e.g. an automatic "BUY 2 GET 1 FREE"
// oversized-tee promo) as DISPLAY-ONLY badges into product_promo_badges --
// see supabase/migrations/20260806_product_promo_badges.sql. This never
// touches checkout pricing: a badge shown here is purely a visual label on
// the product card/PDP, exactly like the manual anniversary-sale hero pill
// (see FourRegnStore.tsx) -- actually applying buy-x-get-y pricing at
// checkout is a materially bigger, separate feature the user explicitly
// deferred.
//
// Shopify's discount GraphQL schema (especially Buy-X-Get-Y) is one of
// their more complex, less stable areas, and this was written without
// access to live docs or a real store to test against -- so this queries
// broadly (discountNodes, every node's raw __typename) and logs anything
// unrecognized rather than silently skipping it. --dry-run output should be
// reviewed carefully (paste the FULL output, not a summary) before ever
// running for real, to catch a wrong field/enum assumption before it writes
// bad data.
//
// Eligibility resolution mirrors discount_codes' own applies_to/product_ids/
// collection_names convention used everywhere else in this codebase:
//   - product-targeted (customerGets.items is DiscountProducts): resolved
//     via the Shopify product's `handle` -> our products.handle (already
//     backfilled by backfill-4regn-handles.ts).
//   - collection-targeted (DiscountCollections): resolved via the Shopify
//     collection's `title` -> a name appearing in our products.category
//     comma-list (same matching convention migrate-4regn-collections.ts
//     established, and the same one FourRegnStore.tsx's pInCat() uses at
//     render time).
//   - sitewide (AllDiscountItems): NOT handled -- there's no "applies to
//     every product" scope in product_promo_badges by design (creating one
//     row per product store-wide would be surprising for what's meant to be
//     a small, targeted promo), so this is logged and skipped for manual
//     review instead of guessed at.
//
// One row is written per (discount x eligible product) or
// (discount x eligible collection) -- a single discount can be eligible for
// several products/collections, and product_promo_badges has one
// product_id/collection_name per row, so external_id is namespaced per
// match (not just the raw discount node id) to keep the upsert key unique:
//   "{discountNodeId}#product#{productId}"
//   "{discountNodeId}#collection#{collectionName}"
//
// Re-running this script re-fetches everything fresh and upserts on
// (seller_id, external_id) -- already-imported rows just update in place.
// A discount that's no longer ACTIVE, or no longer returned by Shopify at
// all (deleted), has its previously-imported row(s) flipped to active=false
// rather than deleted -- keeps a record, and undoing a bad import is just
// flipping the flag back rather than losing data permanently.
//
// Usage:
//   npx tsx scripts/import-4regn-discounts.ts --seller=owner@4regn.com [--domain=your-store.myshopify.com --token=shpat_xxx] [--api-version=2024-10] [--dry-run]
// (domain/token fall back to SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN in .env.local)

import { loadDotEnvLocal, getAdminClient, resolveSeller, shopifyGraphQL, fetchAllRows, writeInBatches, withTimeout } from "./lib/migrate-shared";

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
      "Usage: npx tsx scripts/import-4regn-discounts.ts --seller=owner@example.com [--domain=your-store.myshopify.com --token=shpat_xxx] [--dry-run]\n" +
      "(domain/token fall back to SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN in .env.local)"
    );
    process.exit(1);
  }
  return out as { domain: string; token: string; apiVersion: string; seller: string; dryRun: boolean };
}

// Deliberately loose (all fields optional/`any`-ish downstream) -- this is
// exactly the boundary where Shopify's real schema might not match what's
// guessed here, and a strict interface would just throw away useful raw
// data before it can be logged for review.
interface DiscountNode {
  id: string;
  discount: {
    __typename: string;
    title?: string;
    status?: string;
    startsAt?: string;
    endsAt?: string;
    customerGets?: {
      items?: {
        __typename: string;
        products?: { edges: { node: { id: string; handle: string } }[] };
        collections?: { edges: { node: { id: string; title: string } }[] };
      };
    };
  };
}

interface DiscountNodesResponse {
  discountNodes: {
    edges: { cursor: string; node: DiscountNode }[];
    pageInfo: { hasNextPage: boolean };
  };
}

const DISCOUNT_QUERY = `query($cursor: String) {
  discountNodes(first: 50, after: $cursor) {
    edges {
      cursor
      node {
        id
        discount {
          __typename
          ... on DiscountAutomaticBasic { title status startsAt endsAt }
          ... on DiscountAutomaticBxgy {
            title status startsAt endsAt
            customerGets {
              items {
                __typename
                ... on AllDiscountItems { allItems }
                ... on DiscountProducts { products(first: 50) { edges { node { id handle } } } }
                ... on DiscountCollections { collections(first: 50) { edges { node { id title } } } }
              }
            }
          }
          ... on DiscountCodeBasic { title status startsAt endsAt }
          ... on DiscountCodeBxgy {
            title status startsAt endsAt
            customerGets {
              items {
                __typename
                ... on AllDiscountItems { allItems }
                ... on DiscountProducts { products(first: 50) { edges { node { id handle } } } }
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

async function fetchAllDiscountNodes(domain: string, token: string, apiVersion: string): Promise<DiscountNode[]> {
  const nodes: DiscountNode[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const data: DiscountNodesResponse = await shopifyGraphQL<DiscountNodesResponse>(domain, token, apiVersion, DISCOUNT_QUERY, { cursor });
    const edges: { cursor: string; node: DiscountNode }[] = data.discountNodes.edges;
    for (const e of edges) nodes.push(e.node);
    hasNext = data.discountNodes.pageInfo.hasNextPage;
    cursor = edges.length ? edges[edges.length - 1].cursor : null;
  }
  return nodes;
}

type BadgeRow = {
  seller_id: string;
  label: string;
  scope: "product" | "collection";
  product_id?: string;
  collection_name?: string;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  source: "shopify_import";
  external_id: string;
};

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  console.log(`\nFetching discounts from ${args.domain} (API ${args.apiVersion})...`);
  const nodes = await fetchAllDiscountNodes(args.domain, args.token, args.apiVersion);
  console.log(`\nShopify returned ${nodes.length} discount node(s):`);
  for (const n of nodes) {
    const d = n.discount;
    console.log(`  - [${d.__typename}] "${d.title ?? "(no title)"}" status=${d.status ?? "?"} id=${n.id}`);
    if (d.customerGets?.items) console.log(`      customerGets.items.__typename = ${d.customerGets.items.__typename}`);
  }

  const KNOWN_TYPES = new Set(["DiscountAutomaticBasic", "DiscountAutomaticBxgy", "DiscountCodeBasic", "DiscountCodeBxgy"]);
  const unrecognized = nodes.filter((n) => !KNOWN_TYPES.has(n.discount.__typename));
  if (unrecognized.length) {
    console.log(`\n${unrecognized.length} discount node(s) had an unrecognized __typename -- these are logged above but NOT imported (add a case for them once seen for real):`);
    for (const n of unrecognized) console.log(`  - ${n.discount.__typename}: ${JSON.stringify(n.discount).slice(0, 300)}`);
  }

  const products = await fetchAllRows<{ id: string; handle: string | null; category: string | null }>(
    admin, "products", "id, handle, category", (q) => q.eq("seller_id", sellerId)
  );
  const productIdByHandle = new Map(products.filter((p) => p.handle).map((p) => [p.handle as string, p.id]));
  const knownCollectionNames = new Set<string>();
  for (const p of products) {
    for (const c of (p.category || "").split(",").map((c) => c.trim()).filter(Boolean)) knownCollectionNames.add(c);
  }

  const rows: BadgeRow[] = [];
  const skippedSitewide: string[] = [];
  const skippedNoMatch: { title: string; reason: string }[] = [];

  for (const n of nodes) {
    const d = n.discount;
    if (!KNOWN_TYPES.has(d.__typename)) continue;
    if ((d.status || "").toUpperCase() !== "ACTIVE") continue; // inactive on Shopify -- diff step below flips any existing row off, nothing to write for it here.

    const label = (d.title || "").trim();
    if (!label) { skippedNoMatch.push({ title: "(untitled)", reason: "no title" }); continue; }

    const itemsType = d.customerGets?.items?.__typename;
    if (!itemsType) {
      // A plain percentage/fixed automatic discount with no customerGets
      // (e.g. DiscountAutomaticBasic without buy-x-get-y items) has nothing
      // product/collection-scoped to attach a badge to -- skip, this
      // feature is specifically for eligibility-scoped promos like BXGY.
      skippedNoMatch.push({ title: label, reason: "no customerGets.items (not a scoped BXGY-style discount)" });
      continue;
    }

    if (itemsType === "AllDiscountItems") {
      skippedSitewide.push(label);
      continue;
    }

    if (itemsType === "DiscountProducts") {
      const edges = d.customerGets?.items?.products?.edges || [];
      let matched = 0;
      for (const { node: shopifyProduct } of edges) {
        const productId = productIdByHandle.get(shopifyProduct.handle);
        if (!productId) continue;
        matched++;
        rows.push({
          seller_id: sellerId, label, scope: "product", product_id: productId,
          starts_at: d.startsAt || null, ends_at: d.endsAt || null, active: true,
          source: "shopify_import", external_id: `${n.id}#product#${productId}`,
        });
      }
      if (matched === 0) skippedNoMatch.push({ title: label, reason: `none of ${edges.length} eligible product handle(s) matched a known product` });
      continue;
    }

    if (itemsType === "DiscountCollections") {
      const edges = d.customerGets?.items?.collections?.edges || [];
      let matched = 0;
      for (const { node: shopifyCollection } of edges) {
        const name = shopifyCollection.title;
        if (!knownCollectionNames.has(name)) continue;
        matched++;
        rows.push({
          seller_id: sellerId, label, scope: "collection", collection_name: name,
          starts_at: d.startsAt || null, ends_at: d.endsAt || null, active: true,
          source: "shopify_import", external_id: `${n.id}#collection#${name}`,
        });
      }
      if (matched === 0) skippedNoMatch.push({ title: label, reason: `none of ${edges.length} eligible collection title(s) matched a known collection (products.category)` });
      continue;
    }

    skippedNoMatch.push({ title: label, reason: `unrecognized customerGets.items.__typename: ${itemsType}` });
  }

  console.log(`\n${rows.length} badge row(s) would be written (${rows.filter((r) => r.scope === "product").length} product-scoped, ${rows.filter((r) => r.scope === "collection").length} collection-scoped).`);
  if (rows.length) {
    console.log("\nSample (first 10):");
    for (const r of rows.slice(0, 10)) {
      console.log(`  - "${r.label}" -> ${r.scope === "product" ? `product ${r.product_id}` : `collection "${r.collection_name}"`}`);
    }
  }
  if (skippedSitewide.length) console.log(`\n${skippedSitewide.length} discount(s) are sitewide (AllDiscountItems) -- NOT imported, needs manual review: ${skippedSitewide.join(", ")}`);
  if (skippedNoMatch.length) {
    console.log(`\n${skippedNoMatch.length} discount(s) skipped:`);
    for (const s of skippedNoMatch) console.log(`  - "${s.title}": ${s.reason}`);
  }

  // Diff against previously-imported rows: anything imported before that
  // isn't in this run's fresh external_id set gets flipped to active=false
  // (discount deactivated, deleted, or no longer resolves to a known
  // product/collection) rather than deleted outright.
  const existing = await fetchAllRows<{ id: string; external_id: string | null; active: boolean }>(
    admin, "product_promo_badges", "id, external_id, active", (q) => q.eq("seller_id", sellerId).eq("source", "shopify_import")
  );
  const freshExternalIds = new Set(rows.map((r) => r.external_id));
  const toDeactivate = existing.filter((e) => e.active && e.external_id && !freshExternalIds.has(e.external_id));
  console.log(`\n${existing.length} previously-imported row(s) found; ${toDeactivate.length} would be deactivated (no longer active/matched).`);

  if (args.dryRun) {
    console.log("\n--dry-run: no changes written.");
    return;
  }

  if (rows.length) {
    const written = await writeInBatches(admin, "product_promo_badges", rows, { onConflict: "seller_id,external_id" });
    console.log(`\n${written} badge row(s) upserted.`);
  }

  if (toDeactivate.length) {
    let done = 0;
    for (const e of toDeactivate) {
      await withTimeout(admin.from("product_promo_badges").update({ active: false }).eq("id", e.id), "deactivate promo badge");
      done++;
    }
    console.log(`${done} stale badge row(s) deactivated.`);
  }

  console.log("\nDone. Safe to re-run this script -- it recomputes everything fresh from Shopify each time.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
