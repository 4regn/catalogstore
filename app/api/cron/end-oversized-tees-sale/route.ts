import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { revalidateStore } from "../../../actions/revalidate-store";

export const dynamic = "force-dynamic";

// One-off: reverts Oversized Premium Tees pricing back to R350 (no sale)
// once the flash sale's cutoff has passed. The sale price (R249) was set
// directly via supabase/migrations/20260830_oversized_tees_flash_sale.sql,
// not by this route -- this only ever runs the reverse direction, gated
// on CUTOFF rather than on today's date, so running it early, late, or
// more than once a day is always a safe no-op (nothing matches
// price=SALE_PRICE once it's already been reverted). The "buy 2 for R449"
// bundle needs no equivalent cleanup here -- it expires on its own via the
// discount row's own ends_at.
const CUTOFF = Date.parse("2026-08-31T21:59:00.000Z"); // 31 Aug 23:59 SAST
const SALE_PRICE = 249;
const ORIGINAL_PRICE = 350;
const COLLECTION = "OVERSIZED PREMIUM TEES";

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

    const { data: candidates, error: fetchErr } = await admin
      .from("products")
      .select("id, category")
      .eq("seller_id", seller.id)
      .eq("price", SALE_PRICE);
    if (fetchErr) throw fetchErr;

    const eligibleIds = (candidates || [])
      .filter((p: any) => (p.category || "").split(",").map((c: string) => c.trim()).includes(COLLECTION))
      .map((p: any) => p.id);
    if (!eligibleIds.length) return NextResponse.json({ status: "ok", reverted: 0 });

    const { error: updateErr } = await admin
      .from("products")
      .update({ price: ORIGINAL_PRICE, old_price: null })
      .in("id", eligibleIds);
    if (updateErr) throw updateErr;

    // Collection/product pages read products through a persistent,
    // seller-scoped cache (lib/four-regn-catalog-cache.ts, up to a
    // 1-hour revalidate window) that a raw DB write never invalidates
    // on its own -- without this, the grid would keep showing the
    // now-reverted R249 sale price (which checkout would no longer
    // honour) for up to an hour after the sale actually ended. This is
    // the same gap that made the sale's own price update need a manual
    // dashboard save to show up on the collection grid immediately.
    await revalidateStore("4regn").catch(() => {});

    return NextResponse.json({ status: "ok", reverted: eligibleIds.length });
  } catch (error: any) {
    console.error("End oversized tees sale cron failed", error);
    return NextResponse.json({ status: "error", error: error?.message || "Cron failed" }, { status: 500 });
  }
}
