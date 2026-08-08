import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

// Temporary one-off cleanup tool -- 4regn's Supabase org went over its
// Storage quota (119% of the free-tier 1GB limit), and 430 draft products
// were deleted (product row only, per the DELETE the user ran directly)
// without first cleaning up their uploaded images, since deleting a
// products row doesn't cascade to Storage (no DB foreign key links them).
// Those images are now orphaned: taking up billed Storage space with no
// product row left to find them by status='draft' anymore (the approach
// scripts/cleanup-4regn-draft-images.ts used, back when the rows still
// existed). This walks every folder actually in Storage under 4regn's
// seller_id and deletes any whose name (the folder IS the product id,
// see scripts/migrate-4regn.ts's own upload path) has no matching row in
// products at all anymore -- regardless of status, so a live published
// product's images are never touched.
//
// Auth: reuses SUPABASE_SERVICE_ROLE_KEY itself as the shared secret (via
// x-admin-key header) rather than inventing a new one to manage -- whoever
// can read that env var already has full database access through
// supabaseAdmin anyway, so this doesn't widen the trust boundary.
//
// Defaults to a dry run (report only, deletes nothing) unless
// ?confirm=true is passed.

const BUCKET = "product-images";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key");
  if (!adminKey || adminKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) return unauthorized();

  const confirm = req.nextUrl.searchParams.get("confirm") === "true";

  const { data: seller, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id")
    .eq("subdomain", "4regn")
    .maybeSingle();
  if (sellerErr || !seller) {
    return NextResponse.json({ error: "4regn seller not found", detail: sellerErr?.message }, { status: 500 });
  }
  const sellerId = seller.id;

  const { data: products, error: productsErr } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("seller_id", sellerId);
  if (productsErr) {
    return NextResponse.json({ error: "Failed to list current products", detail: productsErr.message }, { status: 500 });
  }
  const liveIds = new Set((products || []).map((p) => p.id));

  // Top-level entries under the seller's folder -- each one is a product-id
  // folder (or, in principle, a stray file directly under the seller
  // folder, which storage.list() would also surface here; skip anything
  // whose name isn't a live OR orphaned product folder by just treating
  // every entry the same way: fine either way since we only ever act on
  // entries not present in liveIds).
  const { data: sellerFolder, error: listErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(sellerId, { limit: 5000 });
  if (listErr) {
    return NextResponse.json({ error: "Failed to list storage folder", detail: listErr.message }, { status: 500 });
  }

  const orphanedFolders = (sellerFolder || [])
    .map((entry) => entry.name)
    .filter((name) => !liveIds.has(name));

  if (orphanedFolders.length === 0) {
    return NextResponse.json({ sellerId, liveProductCount: liveIds.size, orphanedFolderCount: 0, message: "Nothing to clean up." });
  }

  // List every file in each orphaned folder before deleting anything, so a
  // dry run can report an accurate file count.
  const plans: { productId: string; paths: string[] }[] = [];
  let listed = 0;
  const CONCURRENCY = 6;
  let cursor = 0;
  async function listWorker() {
    while (cursor < orphanedFolders.length) {
      const idx = cursor++;
      const productId = orphanedFolders[idx];
      const folder = `${sellerId}/${productId}`;
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(folder, { limit: 1000 });
      if (!error && data && data.length > 0) {
        plans.push({ productId, paths: data.map((f) => `${folder}/${f.name}`) });
      }
      listed++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, orphanedFolders.length) }, () => listWorker()));

  const totalFiles = plans.reduce((sum, p) => sum + p.paths.length, 0);

  if (!confirm) {
    return NextResponse.json({
      dryRun: true,
      sellerId,
      liveProductCount: liveIds.size,
      orphanedFolderCount: orphanedFolders.length,
      foldersWithFiles: plans.length,
      totalFilesWouldDelete: totalFiles,
      sample: plans.slice(0, 10).map((p) => ({ productId: p.productId, fileCount: p.paths.length })),
      message: "Dry run only -- nothing deleted. Re-request with ?confirm=true to actually delete.",
    });
  }

  let deleted = 0;
  let failed = 0;
  const allPaths = plans.flatMap((p) => p.paths);
  const DELETE_BATCH = 100;
  for (let i = 0; i < allPaths.length; i += DELETE_BATCH) {
    const chunk = allPaths.slice(i, i + DELETE_BATCH);
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).remove(chunk);
    if (error) failed += chunk.length;
    else deleted += data?.length ?? chunk.length;
  }

  return NextResponse.json({
    dryRun: false,
    sellerId,
    liveProductCount: liveIds.size,
    orphanedFolderCount: orphanedFolders.length,
    foldersWithFiles: plans.length,
    filesDeleted: deleted,
    filesFailed: failed,
    message: failed > 0 ? "Some files failed to delete -- safe to re-request the same way, already-deleted files just won't show up again." : "Done.",
  });
}
