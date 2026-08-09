// Diagnostic only -- reads and prints, writes nothing.
//
// Checking a specific reported bug: the live "Jordan Retros" product page
// (id=0180a330-16a5-435d-8068-bf5f0366199c, no source_url on file, flagged
// earlier as needing a manually-uploaded photo) is still missing an image
// even though the seller believes the original Shopify export still has
// one. The --insert-missing run (which just added ~429 previously-
// unimported CSV products) matches existing products by handle -- if this
// product's real Shopify handle/name differs from what's stored here as
// "Jordan Retros", insert-missing would NOT have recognized it as already
// existing and could have inserted a duplicate under a different name
// instead of ever touching this row. This looks for exactly that: any
// product (for this seller) with "jordan" in its name or handle, so we can
// see directly whether a second, image-having entry now exists.
//
// Usage:
//   npx tsx scripts/inspect-4regn-jordan.ts --seller=owner@4regn.com [--term=jordan]

import { getAdminClient, fetchAllRows } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string; term: string } = { term: "jordan" };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--term=")) out.term = arg.slice("--term=".length).toLowerCase();
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/inspect-4regn-jordan.ts --seller=owner@example.com [--term=jordan]");
    process.exit(1);
  }
  return out as { seller: string; term: string };
}

type ProductRow = {
  id: string; name: string; handle: string | null; image_url: string | null; images: string[] | null;
  source_url: string | null; status: string; in_stock: boolean;
};

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();

  const { data: seller, error: sellerErr } = await admin.from("sellers").select("id, email").eq("email", args.seller).maybeSingle();
  if (sellerErr || !seller) {
    console.error(`Could not find a seller matching "${args.seller}": ${sellerErr?.message || "no matching row"}`);
    process.exit(1);
  }

  const products = await fetchAllRows<ProductRow>(
    admin, "products", "id, name, handle, image_url, images, source_url, status, in_stock", (q) => q.eq("seller_id", seller.id)
  );

  const matches = products.filter(
    (p) => p.name.toLowerCase().includes(args.term) || (p.handle || "").toLowerCase().includes(args.term)
  );

  console.log(`${matches.length} product(s) matching "${args.term}" in name or handle:\n`);
  for (const p of matches) {
    console.log(`"${p.name}"`);
    console.log(`  id=${p.id}  handle=${p.handle || "(none)"}  status=${p.status}  in_stock=${p.in_stock}`);
    console.log(`  source_url=${p.source_url || "(none)"}`);
    console.log(`  image_url=${p.image_url || "(none)"}`);
    console.log(`  images: ${p.images?.length || 0}`);
    console.log(`  -> /products/${p.handle || p.id}`);
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
