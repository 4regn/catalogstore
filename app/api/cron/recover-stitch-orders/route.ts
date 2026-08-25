import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { recoverPaidStitchOrders } from "../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await recoverPaidStitchOrders(getAdmin());
    return NextResponse.json({ status: "ok", ...result });
  } catch (error: any) {
    console.error("Stitch recovery cron failed", error);
    return NextResponse.json({ status: "error", error: error?.message || "Recovery failed" }, { status: 500 });
  }
}
