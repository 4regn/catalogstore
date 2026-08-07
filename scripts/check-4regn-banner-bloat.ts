// Checks whether a seller's hero/banner image was ever corrupted by a real
// bug in app/dashboard/editor/page.tsx's save() function (now fixed):
// clicking Save while a newly-selected hero image was still mid-upload
// persisted the raw base64 preview data URL straight into the database
// instead of the real Supabase Storage URL. Since sellers.banner_url is
// selected on every single storefront route, a corrupted row meant every
// page load embedded a multi-hundred-KB (sometimes much larger) base64
// blob into the page's HTML -- confirmed as the dominant cause of an
// oversized page payload on the live 4regn site.
//
// hero_image is a template-scoped field (see lib/template-config.ts) --
// depending on when it was last saved, the real/corrupted value could be
// sitting in sellers.banner_url directly, the legacy flat
// store_config.hero_image, or template_configs[<template>].hero_image.
// This checks all three.
//
// Usage:
//   npx tsx scripts/check-4regn-banner-bloat.ts --seller=owner@4regn.com [--fix]
// --fix clears any corrupted field(s) back to empty (both the storefront
// and dashboard already handle a missing hero image gracefully -- no
// banner shown, same as a seller who never set one) rather than guessing
// at a replacement. After clearing, re-upload the hero image once via the
// dashboard editor -- the save bug that caused this is already fixed, so a
// fresh save will persist the real Storage URL correctly this time.

import { getAdminClient, resolveSeller, withTimeout } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string; fix: boolean } = { fix: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--fix") out.fix = true;
    else if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/check-4regn-banner-bloat.ts --seller=owner@example.com [--fix]");
    process.exit(1);
  }
  return out as { seller: string; fix: boolean };
}

function describe(label: string, value: unknown): { corrupted: boolean } {
  if (typeof value !== "string" || !value) {
    console.log(`  ${label}: (not set)`);
    return { corrupted: false };
  }
  if (value.startsWith("data:")) {
    console.log(`  ${label}: CORRUPTED -- raw base64 data URL, ~${Math.round(value.length / 1024)}KB of text`);
    return { corrupted: true };
  }
  console.log(`  ${label}: OK -- real URL (${value.slice(0, 70)}${value.length > 70 ? "..." : ""})`);
  return { corrupted: false };
}

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);

  const { data: row, error } = await withTimeout(
    admin.from("sellers").select("banner_url, store_config, template_configs, template").eq("id", seller.id).single(),
    "fetch seller row"
  );
  if (error || !row) {
    console.error(`Failed to fetch seller row: ${error?.message || "no row"}`);
    process.exit(1);
  }

  console.log(`\nChecking ${seller.email} (template: ${row.template})...\n`);
  const bannerResult = describe("sellers.banner_url", row.banner_url);
  const storeConfigResult = describe("store_config.hero_image (legacy)", (row.store_config as any)?.hero_image);
  const templateConfigResult = describe(`template_configs.${row.template}.hero_image`, (row.template_configs as any)?.[row.template]?.hero_image);

  const anyCorrupted = bannerResult.corrupted || storeConfigResult.corrupted || templateConfigResult.corrupted;
  if (!anyCorrupted) {
    console.log("\nNothing corrupted -- all clear, no fix needed.");
    return;
  }

  if (!args.fix) {
    console.log("\nFound corrupted field(s) above. --dry-run (default): nothing changed.");
    console.log("Re-run with --fix to clear the corrupted field(s) back to empty, then re-upload the hero image once via the dashboard editor to restore a real image.");
    return;
  }

  const updates: Record<string, any> = {};
  if (bannerResult.corrupted) updates.banner_url = null;
  if (storeConfigResult.corrupted) {
    const cfg = { ...((row.store_config as any) || {}) };
    delete cfg.hero_image;
    updates.store_config = cfg;
  }
  if (templateConfigResult.corrupted) {
    const tcfgs = { ...((row.template_configs as any) || {}) };
    tcfgs[row.template] = { ...(tcfgs[row.template] || {}) };
    delete tcfgs[row.template].hero_image;
    updates.template_configs = tcfgs;
  }

  const { error: updateErr } = await withTimeout(
    admin.from("sellers").update(updates).eq("id", seller.id),
    "clear corrupted hero image field(s)"
  );
  if (updateErr) {
    console.error(`Failed to update: ${updateErr.message}`);
    process.exit(1);
  }
  console.log("\nCleared. Please re-upload the hero image once via the dashboard editor to restore a real banner image.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
