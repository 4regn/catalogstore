import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";
import { markSetlaInstalmentPaid } from "../../../../../../../lib/setla-instalments";

export const dynamic = "force-dynamic";

/* EFT/cash edge-case fallback -- reuses the exact same paid-instalment
   logic the Yoco webhook uses (lib/setla-instalments.ts), so there's one
   implementation of "what happens when an instalment is paid", not two.
   payment_provider_reference gets the "manual:<admin email>" shape the
   20260803 migration's own comment already anticipated for this. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const admin = getAdmin();
  const { data: instalment, error: fetchErr } = await admin.from("setla_instalments").select("id, status").eq("id", id).maybeSingle();
  if (fetchErr || !instalment) return NextResponse.json({ error: "Instalment not found" }, { status: 404 });
  if (instalment.status === "paid") return NextResponse.json({ error: "This instalment is already paid" }, { status: 409 });

  const result = await markSetlaInstalmentPaid(admin, { instalmentId: id, paymentId: `manual:${auth.admin.email}` });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_instalment_manual_mark_paid",
    target_seller_id: null,
    details: { instalmentId: id },
  });

  return NextResponse.json({ success: true });
}
