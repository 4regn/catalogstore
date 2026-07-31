import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../../lib/unik-brand-manager";

export const dynamic = "force-dynamic";

/* Returns the reference photos a customer uploaded for one of their own
   AI Studio designs -- kept for 30 days after generation purely so a
   reported design (wrong likeness, etc.) can be compared against what was
   actually uploaded; see app/api/cron/purge-generation-photos, which
   strips this field on a rolling basis. Not embedded in the customer
   detail list response since it can be a few hundred KB per design across
   up to 5 photos -- fetched on demand only when a seller actually wants to
   look. */
export async function GET(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing design id" }, { status: 400 });

  const admin = getAdmin();
  const { data: design } = await admin
    .from("unik_designs")
    .select("id, seller_id, options")
    .eq("id", id)
    .maybeSingle();
  if (!design || design.seller_id !== seller.id) {
    return NextResponse.json({ error: "Design not found" }, { status: 404 });
  }

  const options = design.options as Record<string, unknown> | null;
  const refPhotos = Array.isArray(options?.refPhotos) ? (options.refPhotos as string[]) : [];
  if (!refPhotos.length) {
    return NextResponse.json({ error: "Reference photos are no longer available for this design" }, { status: 404 });
  }

  return NextResponse.json({ photos: refPhotos }, { headers: { "Cache-Control": "private, no-store" } });
}
