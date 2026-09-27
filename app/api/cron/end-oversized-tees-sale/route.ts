import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { revalidateStore } from "../../../actions/revalidate-store";

export const dynamic = "force-dynamic";

// Reverts each BIG SPRING SALE tier's pricing back to normal once the
// sale's cutoff has passed. Originally this route only ever handled the
// Oversized Premium Tees flash sale (hence the path); generalized here to
// a list of tiers since the current campaign runs three collections at
// once (supabase/migrations/20260923_big_spring_sale.sql), all sharing one
// cutoff. Gated on CUTOFF rather than today's date, and matched by each
// tier's own SALE_PRICE rather than today's date, so running this early,
// late, or more than once a day is always a safe no-op per tier (nothing
// matches price=SALE_PRICE once that tier's already been reverted).
// Reused across repeat campaigns -- add/replace tiers here to match
// whatever the current migration set. The "buy 2 for R___" bundles need no
// equivalent cleanup here -- each expires on its own via its discount
// row's own ends_at (except the 3 PERMANENT ones paused for the sale's
// duration, restored below by their own real ids). Also fixes any product
// description still carrying the sale's own "SPRING SALE!!! BUY 2 FOR
// R___!!" copy (see each tier's saleMarker/permanentText) so a reverted
// product's own page doesn't keep advertising a sale that's over.
const CUTOFF = Date.parse("2026-10-02T21:59:00.000Z"); // 2 Oct 23:59 SAST
// saleMarker/permanentText: a product description written during the sale
// (e.g. the 28 new Oversized Premium Tees products) opens with
// "**SPRING SALE!!!**\n\n**BUY 2 FOR R___!!**" ahead of the same evergreen
// boilerplate (free delivery, unisex, etc). Once reverted, that heading is
// swapped for the reactivated permanent deal's own bundle price (see
// PERMANENT_RULES_TO_RESTORE below) instead of just deleting it -- the
// discount is still real, just no longer a limited-time one. This is a
// plain, exact string match: a product whose description doesn't contain
// this precise text (a different/custom description) is left completely
// untouched, never guessed at.
const TIERS = [
  { collection: "OVERSIZED PREMIUM TEES", salePrice: 229, originalPrice: 350, saleMarker: "**SPRING SALE!!!**\n\n**BUY 2 FOR R399!!**", permanentText: "**BUY 2 FOR R449!!**" },
  // Matches both spellings of this tag used across the codebase (see
  // FourRegnStore.tsx's own getProductPromoBadge) so a product tagged
  // either way still gets reverted.
  { collection: "BACK & FRONT PRINTED HOODIES", salePrice: 329, originalPrice: 479, saleMarker: "**SPRING SALE!!!**\n\n**BUY 2 FOR R599!!**", permanentText: "**BUY 2 FOR R699!!**" },
  { collection: "FRONT & BACK PRINTED HOODIES", salePrice: 329, originalPrice: 479, saleMarker: "**SPRING SALE!!!**\n\n**BUY 2 FOR R599!!**", permanentText: "**BUY 2 FOR R699!!**" },
  { collection: "STANDARD GRAPHIC HOODIES", salePrice: 299, originalPrice: 350, saleMarker: "**SPRING SALE!!!**\n\n**BUY 2 FOR R549!!**", permanentText: "**BUY 2 FOR R599!!**" },
];
// These 3 pre-existing PERMANENT "buy 2" rules (each collection's normal,
// always-on multi-buy deal) were paused for the sale's duration -- they'd
// otherwise stack with the BIG SPRING SALE rules above on the exact same
// collections, since the discount engine (computeAutomaticBxgyDiscount)
// applies every matching active rule, not just one. Re-activated here by
// their own real ids (confirmed against the live table, not re-derived
// from title/collection matching -- too easy to accidentally catch an
// unrelated row that way) at the same cutoff, so the normal deal comes
// back on its own with no separate manual step once the sale ends.
const PERMANENT_RULES_TO_RESTORE = [
  "b4a1fad2-29b5-4419-a177-02751bd21e71", // BUY 2 FOR R449! / OVERSIZED PREMIUM TEES
  "91ad22bc-8d81-4444-a4b5-a7f1711c4d23", // BUY 2 FOR R599! / STANDARD GRAPHIC HOODIES
  "36203d5d-065e-4f68-88bf-2512371c6fec", // BUY 2 FOR R699! / BACK & FRONT PRINTED HOODIES
];

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (Date.now() < CUTOFF) return NextResponse.json({ status: "ok", reverted: 0, note: "Sale still active" });

  const admin = getAdmin();
  try {
    const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", "4regn").maybeSingle();
    if (!seller) return NextResponse.json({ status: "ok", reverted: 0, note: "4regn seller not found" });

    let reverted = 0;
    let descriptionsFixed = 0;
    for (const tier of TIERS) {
      const { data: candidates, error: fetchErr } = await admin
        .from("products")
        .select("id, category, description")
        .eq("seller_id", seller.id)
        .eq("price", tier.salePrice);
      if (fetchErr) throw fetchErr;

      const eligible = (candidates || []).filter((p: any) =>
        (p.category || "").split(",").map((c: string) => c.trim()).includes(tier.collection)
      );
      if (!eligible.length) continue;

      const { error: updateErr } = await admin
        .from("products")
        .update({ price: tier.originalPrice, old_price: null })
        .in("id", eligible.map((p: any) => p.id));
      if (updateErr) throw updateErr;
      reverted += eligible.length;

      // Fix stale "SPRING SALE" copy on whichever of these products actually
      // have it -- one row at a time since each needs its own rewritten
      // description, not a shared value. Small counts (a batch of products,
      // not the whole catalog), so no rate-limit concern doing this plainly.
      const staleDescriptionRows = eligible.filter((p: any) => typeof p.description === "string" && p.description.includes(tier.saleMarker));
      for (const row of staleDescriptionRows) {
        const fixedDescription = row.description.replace(tier.saleMarker, tier.permanentText);
        const { error: descErr } = await admin.from("products").update({ description: fixedDescription }).eq("id", row.id);
        if (descErr) throw descErr;
        descriptionsFixed++;
      }
    }

    const { error: restoreErr } = await admin
      .from("automatic_bxgy_discounts")
      .update({ active: true })
      .in("id", PERMANENT_RULES_TO_RESTORE);
    if (restoreErr) throw restoreErr;

    if (!reverted) return NextResponse.json({ status: "ok", reverted: 0, descriptionsFixed: 0, restoredPermanentRules: true });

    // Collection/product pages read products through a persistent,
    // seller-scoped cache (lib/four-regn-catalog-cache.ts, up to a
    // 1-hour revalidate window) that a raw DB write never invalidates
    // on its own -- without this, the grid would keep showing the
    // now-reverted sale price (which checkout would no longer honour)
    // for up to an hour after the sale actually ended. This is the
    // same gap that made the sale's own price update need a manual
    // dashboard save to show up on the collection grid immediately.
    await revalidateStore("4regn").catch(() => {});

    return NextResponse.json({ status: "ok", reverted, descriptionsFixed });
  } catch (error: any) {
    console.error("End big spring sale cron failed", error);
    return NextResponse.json({ status: "error", error: error?.message || "Cron failed" }, { status: 500 });
  }
}
