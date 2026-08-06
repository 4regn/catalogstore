// Pulls every collection and its full product membership straight from
// Shopify's own Admin GraphQL API, using an already-existing custom app's
// access token -- no Matrixify plan cap involved. Writes a CSV in the same
// shape Matrixify exports ("Title", "Product: Handle"), one row per
// (collection x member product), so it drops straight into
// migrate-4regn-collections.ts's --custom-csv/--smart-csv unchanged.
//
// The existing app just needs the `read_products` scope -- Collection,
// SmartCollection and CustomCollection are all covered under that scope in
// Shopify's Admin API, the same scope a product-reading app already has.
//
// Usage:
//   npx tsx scripts/export-shopify-collections.ts --domain=your-store.myshopify.com --token=shpat_xxx [--out=shopify-collections.csv] [--api-version=2024-10]
// (or set SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN in .env.local instead of --domain/--token)

import { writeFileSync } from "fs";
import { loadDotEnvLocal, shopifyGraphQL } from "./lib/migrate-shared";

function parseArgs() {
  const out: { domain?: string; token?: string; out: string; apiVersion: string } = {
    out: "shopify-collections.csv",
    apiVersion: "2024-10",
  };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--domain=")) out.domain = arg.slice("--domain=".length);
    else if (arg.startsWith("--token=")) out.token = arg.slice("--token=".length);
    else if (arg.startsWith("--out=")) out.out = arg.slice("--out=".length);
    else if (arg.startsWith("--api-version=")) out.apiVersion = arg.slice("--api-version=".length);
  }
  loadDotEnvLocal();
  out.domain = out.domain || process.env.SHOPIFY_STORE_DOMAIN;
  out.token = out.token || process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!out.domain || !out.token) {
    console.error(
      "Usage: npx tsx scripts/export-shopify-collections.ts --domain=your-store.myshopify.com --token=shpat_xxx [--out=shopify-collections.csv]\n" +
      "(or set SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN in .env.local)"
    );
    process.exit(1);
  }
  return out as { domain: string; token: string; out: string; apiVersion: string };
}

interface CollectionNode { id: string; title: string; handle: string; }

async function fetchAllCollections(domain: string, token: string, apiVersion: string): Promise<CollectionNode[]> {
  const collections: CollectionNode[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const data: any = await shopifyGraphQL(
      domain, token, apiVersion,
      `query($cursor: String) {
        collections(first: 50, after: $cursor) {
          edges { cursor node { id title handle } }
          pageInfo { hasNextPage }
        }
      }`,
      { cursor }
    );
    const edges = data.collections.edges as { cursor: string; node: CollectionNode }[];
    for (const e of edges) collections.push(e.node);
    hasNext = data.collections.pageInfo.hasNextPage;
    cursor = edges.length ? edges[edges.length - 1].cursor : null;
  }
  return collections;
}

async function fetchCollectionProductHandles(domain: string, token: string, apiVersion: string, collectionId: string): Promise<string[]> {
  const handles: string[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const data: any = await shopifyGraphQL(
      domain, token, apiVersion,
      `query($id: ID!, $cursor: String) {
        collection(id: $id) {
          products(first: 100, after: $cursor) {
            edges { cursor node { handle } }
            pageInfo { hasNextPage }
          }
        }
      }`,
      { id: collectionId, cursor }
    );
    const edges = data.collection.products.edges as { cursor: string; node: { handle: string } }[];
    for (const e of edges) handles.push(e.node.handle);
    hasNext = data.collection.products.pageInfo.hasNextPage;
    cursor = edges.length ? edges[edges.length - 1].cursor : null;
  }
  return handles;
}

function csvField(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

async function main() {
  const args = parseArgs();
  console.log(`Fetching collections from ${args.domain} (API ${args.apiVersion})...`);
  const collections = await fetchAllCollections(args.domain, args.token, args.apiVersion);
  console.log(`Found ${collections.length} collection(s). Fetching product membership for each...`);

  const rows: string[] = ["Title,Product: Handle"];
  let totalMemberships = 0;
  for (let i = 0; i < collections.length; i++) {
    const c = collections[i];
    const handles = await fetchCollectionProductHandles(args.domain, args.token, args.apiVersion, c.id);
    for (const h of handles) rows.push(`${csvField(c.title)},${csvField(h)}`);
    totalMemberships += handles.length;
    console.log(`  [${i + 1}/${collections.length}] ${c.title}: ${handles.length} product(s)`);
  }

  writeFileSync(args.out, rows.join("\n") + "\n", "utf8");
  console.log(`\nWrote ${args.out}: ${collections.length} collection(s), ${totalMemberships} membership row(s).`);
  console.log(`\nNext: npx tsx scripts/migrate-4regn-collections.ts --seller=owner@example.com --custom-csv=${args.out} --dry-run`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
