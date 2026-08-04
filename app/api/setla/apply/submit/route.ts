import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { sendEmail } from "../../../../../lib/email";
import { sendSetlaEmail, applicationReceivedEmailContent } from "../../../../../lib/setla-email";
import { computeProgress, DOCUMENT_TYPES } from "../../../../../lib/setla-application-progress";

export const dynamic = "force-dynamic";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

/* South African ID numbers encode DOB (YYMMDD) + gender + citizenship +
   a Luhn check digit -- validating this needs no vendor, it's pure math.
   Century isn't encoded, so DOB year is inferred the standard way: if the
   2-digit year is <= this year's last two digits, assume 20xx, else 19xx.
   Identical to the check apply/start used to run -- kept here verbatim
   since submit is now the only place final validation happens. */
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

// The final action once every checklist item is done -- everything it
// needs was already saved incrementally by apply/draft (PATCH) and
// document-confirm, so this reads from storage rather than a fresh
// request body. Replaces the old two-step apply/start + apply/finish
// (which required the whole form in one synchronous submit); those
// routes never persisted anything if the customer left partway through,
// which is exactly the gap this whole flow exists to close.
export async function POST(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  if (customer.application_status === "pending" || customer.application_status === "approved") {
    return NextResponse.json({ error: "You already have an application in progress" }, { status: 409 });
  }

  const ip = getClientIP(req);
  if (!rateLimit("setla-apply-submit:" + ip, 15, 3600).allowed || !rateLimit("setla-apply-submit:" + customer.id, 5, 3600).allowed) {
    return NextResponse.json({ error: "Too many applications submitted. Please try again later." }, { status: 429 });
  }

  const admin = getAdmin();
  const draft = customer.application_draft || {};

  const { data: docs } = await admin
    .from("setla_documents")
    .select("id, document_type")
    .eq("customer_id", customer.id)
    .is("application_id", null)
    .in("document_type", DOCUMENT_TYPES as unknown as string[]);
  const uploaded = new Set((docs || []).map((d) => d.document_type));

  const progress = computeProgress(draft, uploaded);
  if (!progress.complete) {
    return NextResponse.json({ error: "Your application isn't complete yet", remaining: progress.remaining }, { status: 400 });
  }

  const idNumber = String(draft.idNumber || "").trim();
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

  const accountNumber = String(draft.accountNumber || "").trim();
  const accountNumberDigits = accountNumber.replace(/\D/g, "");
  if (accountNumberDigits.length < 4) return NextResponse.json({ error: "Enter a valid account number" }, { status: 400 });
  const accountLast4 = accountNumberDigits.slice(-4);

  const accountHolder = String(draft.accountHolder || "").trim();
  // Soft fraud flag, not a hard block -- legitimate name variations exist
  // (maiden names, middle names, etc). Drives manual_review below rather
  // than an auto-decline.
  const normalizedHolder = accountHolder.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  const normalizedApplicant = `${customer.first_name} ${customer.last_name}`.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  const nameLikelyMatches =
    normalizedHolder.includes(normalizedApplicant) ||
    normalizedApplicant.split(/\s+/).every((part) => part.length < 2 || normalizedHolder.includes(part));

  const { data: application, error: appErr } = await admin
    .from("setla_applications")
    .insert({
      customer_id: customer.id,
      monthly_income: Number(draft.income || 0),
      monthly_expenses: Number(draft.expenses || 0),
      status: nameLikelyMatches ? "pending" : "manual_review",
      submitted_ip: ip,
    })
    .select("id")
    .single();
  if (appErr || !application) {
    console.error("SETLA apply/submit: application insert failed:", appErr);
    return NextResponse.json({ error: "Could not submit your application" }, { status: 500 });
  }

  const { error: bankErr } = await admin.from("setla_bank_accounts").insert({
    customer_id: customer.id,
    bank_name: String(draft.bank || "").trim(),
    account_holder_name: accountHolder,
    account_type: String(draft.accountType || "").trim(),
    account_last4: accountLast4,
    review_status: "pending",
  });
  if (bankErr) {
    console.error("SETLA apply/submit: bank account insert failed:", bankErr);
    return NextResponse.json({ error: "Could not save your banking details" }, { status: 500 });
  }

  // Links the documents that were uploaded during the draft phase to the
  // real application, now that one exists.
  await admin
    .from("setla_documents")
    .update({ application_id: application.id })
    .eq("customer_id", customer.id)
    .is("application_id", null);

  await admin
    .from("setla_customers")
    .update({
      id_number: idNumber,
      address: { address: draft.address, city: draft.city, province: draft.province, postal: draft.postal },
      application_status: "pending",
      identity_status: "pending",
    })
    .eq("id", customer.id);

  await admin.from("setla_notifications").insert({
    customer_id: customer.id,
    notification_type: "application_submitted",
    title: "Application received",
    body: "We're reviewing your SETLA application. We'll notify you as soon as a decision is ready.",
  });
  await sendSetlaEmail({ to: customer.email, ...applicationReceivedEmailContent(customer.first_name) });
  const notifyEmail = process.env.SETLA_ADMIN_NOTIFY_EMAIL;
  if (notifyEmail) {
    await sendEmail({
      to: notifyEmail,
      subject: `New SETLA application: ${customer.first_name} ${customer.last_name}`,
      html: `<p>A new SETLA application is ready for review.</p><p>${customer.first_name} ${customer.last_name} · ${customer.email} · ${customer.phone}</p><p><a href="${APP_ORIGIN}/setla-admin#applications">Open the review queue</a></p>`,
    });
  }

  return NextResponse.json({ success: true, applicationId: application.id, manualReview: !nameLikelyMatches });
}
