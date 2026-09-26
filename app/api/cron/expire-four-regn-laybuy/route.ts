import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { expireOverdueFourRegnLaybuyPlans } from "../../../../lib/four-regn-laybuy";

export const dynamic = "force-dynamic";

// Daily Vercel cron -- see expireOverdueFourRegnLaybuyPlans's own comment
// for what "expiring" a plan actually does (no more top-ups accepted, the
// underlying order is cancelled).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await expireOverdueFourRegnLaybuyPlans(getAdmin());
  return NextResponse.json({ status: "ok", expired_count: result.expired });
}
