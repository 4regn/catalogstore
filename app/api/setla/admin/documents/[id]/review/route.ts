import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["verified", "rejected", "manual_review"]);

/* Per-document review, independent of the overall application decision --
   a reviewer can flag just the bank statement while everything else
   passes, without that forcing an immediate approve/decline on the whole
   application (the decision route at .../applications/[id]/decision is
   still the only thing that actually changes application_status). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const reviewStatus = String(body.reviewStatus || "");
  const rejectionReason = String(body.rejectionReason || "").trim().slice(0, 300) || null;
  if (!STATUSES.has(reviewStatus)) return NextResponse.json({ error: "Invalid review status" }, { status: 400 });

  const admin = getAdmin();
  const { error } = await admin
    .from("setla_documents")
    .update({ review_status: reviewStatus, rejection_reason: reviewStatus === "rejected" ? rejectionReason : null, reviewed_at: new Date().toISOString(), reviewed_by: auth.user.id })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
