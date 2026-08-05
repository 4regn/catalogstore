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

  // Not a plain .upsert(): the uniqueness that matters here (one draft row
  // per customer+document_type, from the 20260809 migration) is a PARTIAL
  // index -- "where application_id is null" -- so a customer can still
  // accumulate real historical rows across multiple submitted/declined/
  // reapplied applications. Postgres's ON CONFLICT inference can't match a
  // partial index from a plain column list (Supabase's upsert() has no way
  // to express that WHERE clause), so it always raised "no unique or
  // exclusion constraint matching the ON CONFLICT specification" here --
  // every single document upload failed with this, not just occasionally.
  // Selecting the draft row explicitly and updating/inserting by hand
  // sidesteps ON CONFLICT entirely and matches the partial index's actual
  // intent instead of fighting it.
  const { data: existingDraft } = await admin
    .from("setla_documents")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("document_type", documentType)
    .is("application_id", null)
    .maybeSingle();

  const { error: saveErr } = existingDraft
    ? await admin.from("setla_documents").update({ storage_path: path, review_status: "pending" }).eq("id", existingDraft.id)
    : await admin.from("setla_documents").insert({ customer_id: customer.id, application_id: null, document_type: documentType, storage_path: path, review_status: "pending" });
  if (saveErr) {
    console.error("SETLA apply/document-confirm: save failed:", saveErr);
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
