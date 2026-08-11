// Diagnostic (read-only, no writes) -- fetches the FULL structure of
// 4regn's 3 real "Buy X Get Y" Shopify discounts (BUY 2 FOR R599!,
// BUY 2 FOR R699!, BUY 2, GET A 3RD TEE FREE!!!) so the real bundle-price
// checkout math can be built from Shopify's actual customerBuys/
// customerGets rules instead of guessed at.
//
// Shopify's BxGy discount schema is one of their more complex, less
// commonly-documented areas, and this was written without live access to
// their current API docs -- same caution as scripts/import-4regn-discounts.ts's
// own header comment. If this query fails outright, the error will name
// the exact bad field; paste the full error back and the query gets fixed
// from that, rather than guessing twice.
//
// Usage:
//   npx tsx scripts/inspect-4regn-bxgy-discounts.ts --seller=owner@4regn.com [--domain=your-store.myshopify.com --token=shpat_xxx] [--api-version=2024-10]
// (domain/token fall back to SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN in .env.local)

import { loadDotEnvLocal, shopifyGraphQL } from "./lib/migrate-shared";

function parseArgs() {
  const out: { domain?: string; token?: string; apiVersion: string } = { apiVersion: "2024-10" };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--domain=")) out.domain = arg.slice("--domain=".length);
    else if (arg.startsWith("--token=")) out.token = arg.slice("--token=".length);
    else if (arg.startsWith("--api-version=")) out.apiVersion = arg.slice("--api-version=".length);
  }
  loadDotEnvLocal();
  out.domain = out.domain || process.env.SHOPIFY_STORE_DOMAIN;
  out.token = out.token || process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!out.domain || !out.token) {
    console.error("Usage: npx tsx scripts/inspect-4regn-bxgy-discounts.ts [--domain=your-store.myshopify.com --token=shpat_xxx]\n(domain/token fall back to SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN in .env.local)");
    process.exit(1);
  }
  return out as { domain: string; token: string; apiVersion: string };
}

const QUERY = `query($cursor: String) {
  discountNodes(first: 50, after: $cursor) {
    edges {
      cursor
      node {
        id
        discount {
          __typename
          ... on DiscountCodeBxgy {
            title
            status
            startsAt
            endsAt
            codes(first: 5) { edges { node { code } } }
            usesPerOrderLimit
            customerBuys {
              value {
                __typename
                ... on DiscountQuantity { quantity }
                ... on DiscountPurchaseAmount { amount }
              }
              items {
                __typename
                ... on AllDiscountItems { allItems }
                ... on DiscountProducts { products(first: 50) { edges { node { id handle title } } } }
                ... on DiscountCollections { collections(first: 50) { edges { node { id title } } } }
              }
            }
            customerGets {
              value {
                __typename
                ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
                ... on DiscountPercentage { percentage }
                ... on DiscountOnQuantity {
                  quantity { quantity }
                  effect {
                    __typename
                    ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
                    ... on DiscountPercentage { percentage }
                  }
                }
              }
              items {
                __typename
                ... on AllDiscountItems { allItems }
                ... on DiscountProducts { products(first: 50) { edges { node { id handle title } } } }
                ... on DiscountCollections { collections(first: 50) { edges { node { id title } } } }
              }
            }
          }
          ... on DiscountAutomaticBxgy {
            title
            status
            startsAt
            endsAt
            summary
            customerBuys {
              value {
                __typename
                ... on DiscountQuantity { quantity }
                ... on DiscountPurchaseAmount { amount }
              }
              items {
                __typename
                ... on AllDiscountItems { allItems }
                ... on DiscountProducts { products(first: 50) { edges { node { id handle title } } } }
                ... on DiscountCollections { collections(first: 50) { edges { node { id title } } } }
              }
            }
            customerGets {
              value {
                __typename
                ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
                ... on DiscountPercentage { percentage }
                ... on DiscountOnQuantity {
                  quantity { quantity }
                  effect {
                    __typename
                    ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
                    ... on DiscountPercentage { percentage }
                  }
                }
              }
              items {
                __typename
                ... on AllDiscountItems { allItems }
                ... on DiscountProducts { products(first: 50) { edges { node { id handle title } } } }
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
  console.log(`Fetching discount nodes from ${args.domain} (API ${args.apiVersion})...\n`);

  let cursor: string | null = null;
  let hasNext = true;
  const bxgyNodes: any[] = [];
  const typeCounts = new Map<string, number>();
  while (hasNext) {
    const data: any = await shopifyGraphQL(args.domain, args.token, args.apiVersion, QUERY, { cursor });
    const edges = data.discountNodes.edges;
    for (const e of edges) {
      const t = e.node.discount?.__typename || "(none)";
      typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      if (t === "DiscountCodeBxgy" || t === "DiscountAutomaticBxgy") bxgyNodes.push(e.node);
    }
    hasNext = data.discountNodes.pageInfo.hasNextPage;
    cursor = edges.length ? edges[edges.length - 1].cursor : null;
  }

  console.log("All discount node types seen:");
  for (const [t, n] of typeCounts) console.log(`  ${t}: ${n}`);

  console.log(`\nFound ${bxgyNodes.length} BXGY node(s) (code or automatic).\n`);
  console.log(JSON.stringify(bxgyNodes, null, 2));
}

main().catch((err) => {
  console.error("\nQuery failed -- paste this full error back:\n");
  console.error(err);
  process.exit(1);
});
