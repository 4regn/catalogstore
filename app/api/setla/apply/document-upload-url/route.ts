import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { rateLimit } from "../../../../../lib/rate-limit";
import { DOCUMENT_TYPES } from "../../../../../lib/setla-application-progress";

export const dynamic = "force-dynamic";

const BUCKET = "setla-private-documents";

// Requests a signed upload URL for exactly one document, independent of
// every other field or document -- the point of the save-as-you-go apply
// flow is that a customer can add just their ID photo today and come back
// for the bank statement next week, so nothing here waits on the rest of
// the form. Stored at a stable per-customer "draft" path (no application
// id exists yet); document-confirm/route.ts records the upload once it
// lands, and apply/submit/route.ts links these rows to the real
// application at final submit.
export async function POST(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  if (customer.application_status === "pending" || customer.application_status === "approved") {
    return NextResponse.json({ error: "You already have an application in progress" }, { status: 409 });
  }

  if (!rateLimit("setla-apply-doc-url:" + customer.id, 60, 3600).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const documentType = String(body?.documentType || "");
  if (!(DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
    return NextResponse.json({ error: "Unknown document type" }, { status: 400 });
  }

  const admin = getAdmin();
  const path = `${customer.id}/draft/${documentType}`;
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !signed) {
    console.error("SETLA apply/document-upload-url: signing failed:", error);
    return NextResponse.json({ error: "Could not prepare upload. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ bucket: BUCKET, path: signed.path, token: signed.token });
}
