import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { rateLimit } from "../../../../../lib/rate-limit";
import { sanitizeDraftPatch, computeProgress, DOCUMENT_TYPES } from "../../../../../lib/setla-application-progress";

export const dynamic = "force-dynamic";

const BUCKET = "setla-private-documents";

// Called right after the browser's direct-to-Storage PUT (using the URL
// from document-upload-url/route.ts) succeeds -- records the
// setla_documents row so progress tracking knows this document is done.
// The path is derived server-side from the customer id, never trusted
// from the client, so there's no way to register a document against
// someone else's path even by lying about success.
export async function POST(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  if (!rateLimit("setla-apply-doc-confirm:" + customer.id, 60, 3600).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const documentType = String(body?.documentType || "");
  if (!(DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
    return NextResponse.json({ error: "Unknown document type" }, { status: 400 });
  }

  const admin = getAdmin();
  const path = `${customer.id}/draft/${documentType}`;

  const { data: found, error: listErr } = await admin.storage.from(BUCKET).list(`${customer.id}/draft`, { search: documentType });
  if (listErr || !(found || []).some((f) => f.name === documentType)) {
    return NextResponse.json({ error: "That document hasn't finished uploading yet. Please try again." }, { status: 400 });
  }

  const { error: upsertErr } = await admin
    .from("setla_documents")
    .upsert(
      { customer_id: customer.id, application_id: null, document_type: documentType, storage_path: path, review_status: "pending" },
      { onConflict: "customer_id,document_type" }
    );
  if (upsertErr) {
    console.error("SETLA apply/document-confirm: upsert failed:", upsertErr);
    return NextResponse.json({ error: "Could not save your document. Please try again." }, { status: 500 });
  }

  // First document uploaded moves the customer out of "not_applied", same
  // as the draft PATCH route does for the first text field saved -- either
  // one can be the very first thing a customer does after signing up.
  if (customer.application_status === "not_applied") {
    await admin.from("setla_customers").update({ application_status: "draft" }).eq("id", customer.id);
  }

  const { data: docs } = await admin
    .from("setla_documents")
    .select("document_type")
    .eq("customer_id", customer.id)
    .in("document_type", DOCUMENT_TYPES as unknown as string[]);
  const uploaded = new Set((docs || []).map((d) => d.document_type));
  const progress = computeProgress(sanitizeDraftPatch(customer.application_draft || {}), uploaded);

  return NextResponse.json({ ok: true, ...progress });
}
