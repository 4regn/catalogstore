import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Daily Vercel cron. Flips any seller whose 7-day grace period has run out from
// 'past_due' to 'expired', which causes the storefront to render the "currently
// unavailable" page on the next visit (or after the 60s ISR window).
export async function GET(req: NextRequest) {
  // Vercel cron requests are authenticated via the CRON_SECRET env var:
  // https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("sellers")
    .update({ subscription_status: "expired" })
    .eq("subscription_status", "past_due")
    .lte("subscription_grace_until", nowIso)
    .select("id");

  if (error) {
    console.error("Cron expire-past-due error:", error);
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    expired_count: data?.length ?? 0,
    expired_ids: data?.map((r: { id: string }) => r.id) ?? [],
  });
}
