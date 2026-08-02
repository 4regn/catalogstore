import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../lib/setla-customer";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { sendEmail } from "../../../../lib/email";

export const dynamic = "force-dynamic";

const BUCKET = "setla-private-documents";
const MAX_FILE_BYTES = 15 * 1024 * 1024; // matches the bucket's own file_size_limit
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);

/* South African ID numbers encode DOB (YYMMDD) + gender + citizenship +
   a Luhn check digit -- validating this needs no vendor, it's pure math.
   Century isn't encoded, so DOB year is inferred the standard way: if the
   2-digit year is <= this year's last two digits, assume 20xx, else 19xx. */
function validateSaIdNumber(idNumber: string): { valid: boolean; reason?: string } {
  if (!/^\d{13}$/.test(idNumber)) return { valid: false, reason: "ID number must be exactly 13 digits" };

  const digits = idNumber.split("").map(Number);
  let luhnSum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[digits.length - 1 - i];
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    luhnSum += d;
  }
  if (luhnSum % 10 !== 0) return { valid: false, reason: "That doesn't look like a valid South African ID number" };

  const yy = Number(idNumber.slice(0, 2));
  const mm = Number(idNumber.slice(2, 4));
  const dd = Number(idNumber.slice(4, 6));
  if (mm < 1 || mm > 12) return { valid: false, reason: "That ID number's birth date isn't valid" };
  const now = new Date();
  const currentYY = now.getFullYear() % 100;
  const century = yy <= currentYY ? 2000 : 1900;
  const dob = new Date(century + yy, mm - 1, dd);
  if (dob.getMonth() !== mm - 1 || dob.getDate() !== dd) return { valid: false, reason: "That ID number's birth date isn't valid" };
  if (dob > now) return { valid: false, reason: "That ID number's birth date isn't valid" };
  const ageMs = now.getTime() - dob.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 18) return { valid: false, reason: "You must be 18 or older to apply" };

  return { valid: true };
}

async function uploadDocument(admin: ReturnType<typeof getAdmin>, customerId: string, applicationId: string, documentType: string, file: File) {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error(`${documentType.replace(/_/g, " ")}: only images or PDFs are accepted`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${documentType.replace(/_/g, " ")}: file is too large`);
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
  const path = `${customerId}/${applicationId}/${documentType}.${ext}`;
  const bytes = await file.arrayBuffer();
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) throw new Error(`Could not upload ${documentType.replace(/_/g, " ")}`);
  return path;
}

/* The core SETLA application flow: identity + affordability + banking, all
   in one submission, five documents (ID, live selfie, proof of address,
   proof of banking, bank statement). Nothing here is auto-approved --
   this only gets the application into the setla-admin review queue
   (see app/api/setla/admin/applications/[id]/decision/route.ts). */
export async function POST(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  const ip = getClientIP(req);
  if (!rateLimit("setla-apply:" + ip, 3, 3600).allowed || !rateLimit("setla-apply:" + customer.id, 3, 3600).allowed) {
    return NextResponse.json({ error: "Too many applications submitted. Please try again later." }, { status: 429 });
  }

  const admin = getAdmin();

  if (customer.application_status === "pending" || customer.application_status === "approved") {
    return NextResponse.json({ error: "You already have an application in progress" }, { status: 409 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const firstName = String(form.get("firstName") || "").trim().slice(0, 80);
  const lastName = String(form.get("lastName") || "").trim().slice(0, 80);
  const email = String(form.get("email") || "").trim().toLowerCase();
  const phone = String(form.get("phone") || "").trim();
  const idNumber = String(form.get("idNumber") || "").trim();
  const address = String(form.get("address") || "").trim().slice(0, 300);
  const city = String(form.get("city") || "").trim().slice(0, 120);
  const province = String(form.get("province") || "").trim().slice(0, 60);
  const postal = String(form.get("postal") || "").trim().slice(0, 12);
  const income = Number(form.get("income") || 0);
  const expenses = Number(form.get("expenses") || 0);
  const bank = String(form.get("bank") || "").trim().slice(0, 120);
  const accountHolder = String(form.get("accountHolder") || "").trim().slice(0, 160);
  const accountNumber = String(form.get("accountNumber") || "").trim();
  const accountType = String(form.get("accountType") || "").trim().slice(0, 60);

  if (!firstName || !lastName || !email || !phone || !idNumber || !address || !city || !province || !postal) {
    return NextResponse.json({ error: "All personal and address fields are required" }, { status: 400 });
  }
  if (!Number.isFinite(income) || income < 0 || !Number.isFinite(expenses) || expenses < 0) {
    return NextResponse.json({ error: "Enter valid income and expense amounts" }, { status: 400 });
  }
  if (!bank || !accountHolder || !accountNumber || !accountType) {
    return NextResponse.json({ error: "All banking fields are required" }, { status: 400 });
  }
  const accountNumberDigits = accountNumber.replace(/\D/g, "");
  if (accountNumberDigits.length < 4) {
    return NextResponse.json({ error: "Enter a valid account number" }, { status: 400 });
  }
  const accountLast4 = accountNumberDigits.slice(-4);

  const idCheck = validateSaIdNumber(idNumber);
  if (!idCheck.valid) return NextResponse.json({ error: idCheck.reason }, { status: 400 });

  // The real fraud-relevant duplicate check -- a second email is trivial,
  // a second valid SA ID number for the same person is not.
  const { data: idClash } = await admin
    .from("setla_customers")
    .select("id")
    .eq("id_number", idNumber)
    .neq("id", customer.id)
    .maybeSingle();
  if (idClash) return NextResponse.json({ error: "An account already exists for this ID number" }, { status: 409 });

  // Soft fraud flag, not a hard block -- legitimate name variations exist
  // (maiden names, middle names, etc). Drives manual_review below rather
  // than an auto-decline.
  const normalizedHolder = accountHolder.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  const normalizedApplicant = `${firstName} ${lastName}`.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  const nameLikelyMatches =
    normalizedHolder.includes(normalizedApplicant) ||
    normalizedApplicant.split(/\s+/).every((part) => part.length < 2 || normalizedHolder.includes(part));

  const idDocumentFile = form.get("idDocument");
  const addressProofFile = form.get("addressProof");
  const bankProofFile = form.get("bankProof");
  const statementFile = form.get("statement");
  const selfieFile = form.get("selfie");
  if (!(idDocumentFile instanceof File) || !(addressProofFile instanceof File) || !(bankProofFile instanceof File) || !(statementFile instanceof File)) {
    return NextResponse.json({ error: "All required documents must be uploaded" }, { status: 400 });
  }
  if (!(selfieFile instanceof File)) {
    return NextResponse.json({ error: "A live selfie or a recent photo is required" }, { status: 400 });
  }

  const { data: application, error: appErr } = await admin
    .from("setla_applications")
    .insert({
      customer_id: customer.id,
      monthly_income: income,
      monthly_expenses: expenses,
      status: nameLikelyMatches ? "pending" : "manual_review",
      submitted_ip: ip,
    })
    .select("id")
    .single();
  if (appErr || !application) {
    console.error("SETLA apply: application insert failed:", appErr);
    return NextResponse.json({ error: "Could not submit your application" }, { status: 500 });
  }

  try {
    const documents: Array<{ type: string; file: File }> = [
      { type: "id_document", file: idDocumentFile },
      { type: "live_selfie", file: selfieFile },
      { type: "proof_of_address", file: addressProofFile },
      { type: "proof_of_banking", file: bankProofFile },
      { type: "bank_statement", file: statementFile },
    ];
    const uploaded = await Promise.all(
      documents.map(async (doc) => ({ type: doc.type, path: await uploadDocument(admin, customer.id, application.id, doc.type, doc.file) }))
    );

    const { error: docsErr } = await admin.from("setla_documents").insert(
      uploaded.map((doc) => ({
        customer_id: customer.id,
        application_id: application.id,
        document_type: doc.type,
        storage_path: doc.path,
      }))
    );
    if (docsErr) throw new Error("Could not save your documents");

    const { error: bankErr } = await admin.from("setla_bank_accounts").insert({
      customer_id: customer.id,
      bank_name: bank,
      account_holder_name: accountHolder,
      account_type: accountType,
      account_last4: accountLast4,
      review_status: "pending",
    });
    if (bankErr) throw new Error("Could not save your banking details");

    const { error: customerErr } = await admin
      .from("setla_customers")
      .update({
        first_name: firstName,
        last_name: lastName,
        phone,
        id_number: idNumber,
        address: { address, city, province, postal },
        application_status: "pending",
        identity_status: "pending",
      })
      .eq("id", customer.id);
    if (customerErr) throw new Error("Could not update your profile");
  } catch (err) {
    console.error("SETLA apply: failed partway through, application", application.id, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not submit your application" }, { status: 500 });
  }

  await admin.from("setla_notifications").insert({
    customer_id: customer.id,
    notification_type: "application_submitted",
    title: "Application received",
    body: "We're reviewing your SETLA application. We'll notify you as soon as a decision is ready.",
  });

  await sendEmail({
    to: email,
    from: "SETLA Payments <orders@catalogstore.co.za>",
    subject: "We've received your SETLA application",
    html: `<p>Hi ${firstName},</p><p>Thanks for applying to SETLA Payments. We're reviewing your identity, affordability and banking details now and will email you as soon as a decision is ready.</p><p>You can check your application status any time from your <a href="${new URL(req.url).origin}/setla/dashboard.html">SETLA dashboard</a>.</p>`,
  });

  const notifyEmail = process.env.SETLA_ADMIN_NOTIFY_EMAIL;
  if (notifyEmail) {
    await sendEmail({
      to: notifyEmail,
      subject: `New SETLA application: ${firstName} ${lastName}`,
      html: `<p>A new SETLA application is ready for review.</p><p>${firstName} ${lastName} · ${email} · ${phone}</p><p><a href="${new URL(req.url).origin}/setla-admin#applications">Open the review queue</a></p>`,
    });
  }

  return NextResponse.json({ success: true, applicationId: application.id, manualReview: !nameLikelyMatches });
}
