import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { rateLimit } from "../../../../../lib/rate-limit";
import { sanitizeDraftPatch, computeProgress, DOCUMENT_TYPES } from "../../../../../lib/setla-application-progress";

export const dynamic = "force-dynamic";

async function loadProgress(admin: ReturnType<typeof getAdmin>, customerId: string, draft: any) {
  const { data: docs } = await admin
    .from("setla_documents")
    .select("document_type")
    .eq("customer_id", customerId)
    .in("document_type", DOCUMENT_TYPES as unknown as string[]);
  const uploaded = new Set((docs || []).map((d) => d.document_type));
  return computeProgress(draft || {}, uploaded);
}

// Powers both apply.html's own progress bar/prefill on load, and the
// dashboard's "continue application" card -- same shape either way, so
// the two never show a different percentage for the same customer.
export async function GET(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  const admin = getAdmin();
  const progress = await loadProgress(admin, customer.id, customer.application_draft);
  return NextResponse.json({ draft: customer.application_draft || {}, ...progress });
}

// Called on blur/change of any apply.html field, and again after each
// document finishes uploading -- see document-upload-url/route.ts for the
// document half of "save the moment they add something". Every call is a
// partial merge, never a full replace, so saving one field can't clobber
// another field saved a minute earlier from a different call.
export async function PATCH(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  if (customer.application_status === "pending" || customer.application_status === "approved") {
    return NextResponse.json({ error: "You already have an application in progress" }, { status: 409 });
  }

  if (!rateLimit("setla-apply-draft:" + customer.id, 120, 3600).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const patch = sanitizeDraftPatch(body);

  const admin = getAdmin();
  const merged = { ...(customer.application_draft || {}), ...patch };

  const update: Record<string, unknown> = { application_draft: merged };
  // First save of any kind moves the customer out of "not_applied" so the
  // dashboard/admin funnel can tell "never started" apart from "started,
  // still going" -- the 'draft' status already existed in the DB check
  // constraint, just unused until now.
  if (customer.application_status === "not_applied") update.application_status = "draft";

  const { error } = await admin.from("setla_customers").update(update).eq("id", customer.id);
  if (error) {
    console.error("SETLA apply/draft PATCH: update failed:", error);
    return NextResponse.json({ error: "Could not save your progress" }, { status: 500 });
  }

  const progress = await loadProgress(admin, customer.id, merged);
  return NextResponse.json({ draft: merged, ...progress });
}
