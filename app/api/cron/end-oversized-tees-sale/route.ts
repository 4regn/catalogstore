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
// row's own ends_at.
const CUTOFF = Date.parse("2026-10-02T21:59:00.000Z"); // 2 Oct 23:59 SAST
const TIERS = [
  { collection: "OVERSIZED PREMIUM TEES", salePrice: 229, originalPrice: 350 },
  // Matches both spellings of this tag used across the codebase (see
  // FourRegnStore.tsx's own getProductPromoBadge) so a product tagged
  // either way still gets reverted.
  { collection: "BACK & FRONT PRINTED HOODIES", salePrice: 329, originalPrice: 479 },
  { collection: "FRONT & BACK PRINTED HOODIES", salePrice: 329, originalPrice: 479 },
  { collection: "STANDARD GRAPHIC HOODIES", salePrice: 299, originalPrice: 350 },
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
    for (const tier of TIERS) {
      const { data: candidates, error: fetchErr } = await admin
        .from("products")
        .select("id, category")
        .eq("seller_id", seller.id)
        .eq("price", tier.salePrice);
      if (fetchErr) throw fetchErr;

      const eligibleIds = (candidates || [])
        .filter((p: any) => (p.category || "").split(",").map((c: string) => c.trim()).includes(tier.collection))
        .map((p: any) => p.id);
      if (!eligibleIds.length) continue;

      const { error: updateErr } = await admin
        .from("products")
        .update({ price: tier.originalPrice, old_price: null })
        .in("id", eligibleIds);
      if (updateErr) throw updateErr;
      reverted += eligibleIds.length;
    }

    if (!reverted) return NextResponse.json({ status: "ok", reverted: 0 });

    // Collection/product pages read products through a persistent,
    // seller-scoped cache (lib/four-regn-catalog-cache.ts, up to a
    // 1-hour revalidate window) that a raw DB write never invalidates
    // on its own -- without this, the grid would keep showing the
    // now-reverted sale price (which checkout would no longer honour)
    // for up to an hour after the sale actually ended. This is the
    // same gap that made the sale's own price update need a manual
    // dashboard save to show up on the collection grid immediately.
    await revalidateStore("4regn").catch(() => {});

    return NextResponse.json({ status: "ok", reverted });
  } catch (error: any) {
    console.error("End big spring sale cron failed", error);
    return NextResponse.json({ status: "error", error: error?.message || "Cron failed" }, { status: 500 });
  }
}
