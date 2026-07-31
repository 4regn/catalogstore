import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Daily Vercel cron. Customer-generated designs keep their uploaded
// reference photos (unik_designs.options.refPhotos, same field/shape the
// partner Studio route already stores indefinitely for "Send to Recap")
// for 30 days so a reported generation can be compared against what was
// actually uploaded -- see app/api/unik/generations/route.ts. This strips
// that field once a design ages past the window; everything else about the
// design row (the design itself, mockup, order history) is untouched.
//
// Scoped to owner_role = 'customer' only -- partner-owned designs keep
// refPhotos indefinitely for their own unrelated "Send to Recap" purpose,
// and brand-manager-owned designs never store refPhotos in the first
// place, so neither needs purging here.
const RETENTION_DAYS = 30;

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

  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error: selectError } = await supabase
    .from("unik_designs")
    .select("id, options")
    .eq("owner_role", "customer")
    .eq("source", "ai-studio")
    .lt("created_at", cutoffIso)
    .limit(500);

  if (selectError) {
    console.error("Cron purge-generation-photos select error:", selectError);
    return NextResponse.json({ status: "error", error: selectError.message }, { status: 500 });
  }

  const toPurge = (candidates || []).filter((row: { options: Record<string, unknown> | null }) => !!row.options?.refPhotos);

  let purgedCount = 0;
  const errors: string[] = [];
  for (const row of toPurge) {
    const rest = { ...(row.options as Record<string, unknown>) };
    delete rest.refPhotos;
    const { error } = await supabase.from("unik_designs").update({ options: rest }).eq("id", row.id);
    if (error) errors.push(`${row.id}: ${error.message}`);
    else purgedCount += 1;
  }

  if (errors.length) console.error("Cron purge-generation-photos update errors:", errors);

  return NextResponse.json({
    status: errors.length ? "partial" : "ok",
    scanned: candidates?.length ?? 0,
    purged_count: purgedCount,
    errors: errors.length || undefined,
  });
}
