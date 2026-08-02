import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

/* Deactivate, never hard-delete -- keeps every reviewed_by FK pointing at
   a real (if now-inactive) admin, so historical decisions stay
   attributable. requireSetlaAdmin already filters on active:true, so a
   deactivated admin's own session stops working immediately. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  if (auth.admin.role !== "super_admin") return NextResponse.json({ error: "Only a super admin can remove admin access" }, { status: 403 });
  const { id } = await ctx.params;

  if (id === auth.admin.id) return NextResponse.json({ error: "You can't remove your own access" }, { status: 400 });

  const { error } = await getAdmin().from("setla_admins").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
