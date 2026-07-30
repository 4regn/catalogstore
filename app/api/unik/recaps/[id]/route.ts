import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikRecapCreator } from "../../../../../lib/unik-recap-auth";

export const dynamic = "force-dynamic";
const BUCKET = "store-assets";

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUnikRecapCreator(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;
  const { id } = await context.params;

  const admin = getAdmin();
  const { data: deleted, error } = await admin.from("unik_recaps").delete().eq("id", id).eq("seller_id", seller.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: "Recap not found" }, { status: 404 });

  // Best-effort cleanup of the images that went with it -- every file for
  // this recap lives under one known prefix, so no need to know the exact
  // filenames stored.
  const prefix = `unik-recaps/${seller.id}/${id}`;
  const { data: files } = await admin.storage.from(BUCKET).list(prefix);
  if (files?.length) {
    await admin.storage.from(BUCKET).remove(files.map((f) => `${prefix}/${f.name}`));
  }

  return NextResponse.json({ success: true });
}
