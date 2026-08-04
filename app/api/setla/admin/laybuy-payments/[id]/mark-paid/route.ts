import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";
import { markLaybuyPaymentPaid } from "../../../../../../../lib/setla-instalments";

export const dynamic = "force-dynamic";

/* EFT/cash edge-case fallback for a Laybuy top-up -- mirrors
   admin/instalments/[id]/mark-paid exactly, just against the flexible
   ledger (markLaybuyPaymentPaid) instead of a fixed instalment. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const admin = getAdmin();
  const { data: payment, error: fetchErr } = await admin.from("setla_laybuy_payments").select("id, status").eq("id", id).maybeSingle();
  if (fetchErr || !payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.status === "paid") return NextResponse.json({ error: "This payment is already recorded as paid" }, { status: 409 });

  const result = await markLaybuyPaymentPaid(admin, { paymentId: id, providerReference: `manual:${auth.admin.email}` });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_laybuy_payment_manual_mark_paid",
    target_seller_id: null,
    details: { laybuyPaymentId: id },
  });

  return NextResponse.json({ success: true });
}
