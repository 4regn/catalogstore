import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireUnikPartner } from "../../../../../../lib/unik-partner";

export const dynamic = "force-dynamic";

/* A partner's own generation history -- what the Studio tab's gallery and
   "Send to Recap" import pull from. Scoped to this partner's own
   auth_user_id, same as the storefront customer account page does for its
   own designs. */
export async function GET(req: NextRequest) {
  const auth = await requireUnikPartner(req);
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;

  const admin = getAdmin();
  const { data, error } = await admin
    .from("unik_designs")
    .select("id, status, name, garment, colour, size, style, options, mockup_url, created_at")
    .eq("seller_id", seller.id)
    .eq("auth_user_id", user.id)
    .eq("owner_role", "partner")
    .eq("source", "ai-studio")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: "Could not load your generations" }, { status: 500 });

  const designs = (data || []).map((d) => ({
    id: d.id,
    status: d.status,
    name: d.name,
    garment: d.garment,
    colour: d.colour,
    size: d.size,
    style: d.style,
    tagline: (d.options as any)?.tagline || "",
    mockupUrl: d.mockup_url,
    createdAt: d.created_at,
  }));

  return NextResponse.json({ designs }, { headers: { "Cache-Control": "private, no-store" } });
}
