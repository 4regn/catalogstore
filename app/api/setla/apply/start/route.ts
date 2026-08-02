import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

const BUCKET = "setla-private-documents";
const DOCUMENT_TYPES = ["id_document", "live_selfie", "proof_of_address", "proof_of_banking", "bank_statement"] as const;

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

/* Step 1 of 2 for a SETLA application (see finish/route.ts for step 2).
   Vercel Functions hard-cap request bodies at 4.5MB -- fine for this JSON
   payload, but nowhere near enough for 5 real phone-camera photos/PDFs
   (this bucket allows up to 15MB each, see the 20260802 migration). So
   documents are no longer uploaded through this API at all: this route
   validates and records everything EXCEPT the documents, then hands back
   short-lived signed upload URLs the browser uses to put the files
   straight into Supabase Storage, never touching a Vercel function. */
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

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const firstName = String(body.firstName || "").trim().slice(0, 80);
  const lastName = String(body.lastName || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const idNumber = String(body.idNumber || "").trim();
  const address = String(body.address || "").trim().slice(0, 300);
  const city = String(body.city || "").trim().slice(0, 120);
  const province = String(body.province || "").trim().slice(0, 60);
  const postal = String(body.postal || "").trim().slice(0, 12);
  const income = Number(body.income || 0);
  const expenses = Number(body.expenses || 0);
  const bank = String(body.bank || "").trim().slice(0, 120);
  const accountHolder = String(body.accountHolder || "").trim().slice(0, 160);
  const accountNumber = String(body.accountNumber || "").trim();
  const accountType = String(body.accountType || "").trim().slice(0, 60);

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
    console.error("SETLA apply/start: application insert failed:", appErr);
    return NextResponse.json({ error: "Could not submit your application" }, { status: 500 });
  }

  const { error: bankErr } = await admin.from("setla_bank_accounts").insert({
    customer_id: customer.id,
    bank_name: bank,
    account_holder_name: accountHolder,
    account_type: accountType,
    account_last4: accountLast4,
    review_status: "pending",
  });
  if (bankErr) {
    console.error("SETLA apply/start: bank account insert failed:", bankErr);
    return NextResponse.json({ error: "Could not save your banking details" }, { status: 500 });
  }

  // Marks the account "in progress" immediately -- before a single document
  // byte has moved -- so a page reload can't start a second, duplicate
  // application (blocked by the check above) while this one is still
  // uploading documents in the background.
  await admin
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

  const uploads: Record<string, { path: string; token: string }> = {};
  for (const type of DOCUMENT_TYPES) {
    const path = `${customer.id}/${application.id}/${type}`;
    const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (signErr || !signed) {
      console.error("SETLA apply/start: signed upload URL failed for", type, signErr);
      return NextResponse.json({ error: "Could not prepare document upload. Please try again." }, { status: 500 });
    }
    uploads[type] = { path: signed.path, token: signed.token };
  }

  return NextResponse.json({ applicationId: application.id, bucket: BUCKET, uploads, manualReview: !nameLikelyMatches });
}
