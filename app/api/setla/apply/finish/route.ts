import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { sendEmail } from "../../../../../lib/email";

export const dynamic = "force-dynamic";

const BUCKET = "setla-private-documents";
const DOCUMENT_TYPES = ["id_document", "live_selfie", "proof_of_address", "proof_of_banking", "bank_statement"] as const;

/* Step 2 of 2 (see start/route.ts) -- called once the browser has finished
   PUTting all 5 documents straight into Supabase Storage using the signed
   URLs from step 1. This route never sees the file bytes; it just confirms
   every expected object actually landed, then records the setla_documents
   rows and sends the "application received" notification/emails. Safe to
   call more than once (e.g. after a retried upload) -- already-recorded
   documents are just skipped. */
export async function POST(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  const body = await req.json().catch(() => ({}));
  const applicationId = String(body.applicationId || "").trim();
  if (!applicationId) return NextResponse.json({ error: "Missing application" }, { status: 400 });

  const admin = getAdmin();
  const { data: application, error: appFetchErr } = await admin
    .from("setla_applications")
    .select("id, customer_id, status")
    .eq("id", applicationId)
    .maybeSingle();
  if (appFetchErr || !application || application.customer_id !== customer.id) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data: existingDocs } = await admin.from("setla_documents").select("document_type").eq("application_id", applicationId);
  const already = new Set((existingDocs || []).map((d) => d.document_type));
  const missing = DOCUMENT_TYPES.filter((t) => !already.has(t));
  // Nothing left to record -- this is a pure retry of an already-completed
  // finish call (e.g. the client's own confirmation response got lost).
  // Recording is fully done, so skip straight to a success reply without
  // re-sending the "application received" notification/emails below.
  const alreadyComplete = missing.length === 0 && already.size > 0;

  if (missing.length) {
    const { data: listed, error: listErr } = await admin.storage.from(BUCKET).list(`${customer.id}/${applicationId}`);
    if (listErr) return NextResponse.json({ error: "Could not verify your documents. Please try again." }, { status: 500 });
    const present = new Set((listed || []).map((f) => f.name));
    const stillMissing = missing.filter((t) => !present.has(t));
    if (stillMissing.length) {
      return NextResponse.json({ error: "Some documents didn't finish uploading. Please try again.", missing: stillMissing }, { status: 400 });
    }

    const { error: docsErr } = await admin.from("setla_documents").insert(
      missing.map((type) => ({
        customer_id: customer.id,
        application_id: applicationId,
        document_type: type,
        storage_path: `${customer.id}/${applicationId}/${type}`,
      }))
    );
    if (docsErr) return NextResponse.json({ error: "Could not save your documents. Please try again." }, { status: 500 });
  }

  // Notifications/emails only fire the first time the full document set is
  // recorded -- a retried finish call after that is a no-op past this point.
  if (!alreadyComplete) {
    await admin.from("setla_notifications").insert({
      customer_id: customer.id,
      notification_type: "application_submitted",
      title: "Application received",
      body: "We're reviewing your SETLA application. We'll notify you as soon as a decision is ready.",
    });
    await sendEmail({
      to: customer.email,
      from: "SETLA Payments <orders@catalogstore.co.za>",
      subject: "We've received your SETLA application",
      html: `<p>Hi ${customer.first_name},</p><p>Thanks for applying to SETLA Payments. We're reviewing your identity, affordability and banking details now and will email you as soon as a decision is ready.</p><p>You can check your application status any time from your <a href="${new URL(req.url).origin}/setla/dashboard.html">SETLA dashboard</a>.</p>`,
    });
    const notifyEmail = process.env.SETLA_ADMIN_NOTIFY_EMAIL;
    if (notifyEmail) {
      await sendEmail({
        to: notifyEmail,
        subject: `New SETLA application: ${customer.first_name} ${customer.last_name}`,
        html: `<p>A new SETLA application is ready for review.</p><p>${customer.first_name} ${customer.last_name} · ${customer.email} · ${customer.phone}</p><p><a href="${new URL(req.url).origin}/setla-admin#applications">Open the review queue</a></p>`,
      });
    }
  }

  return NextResponse.json({ success: true, applicationId });
}
