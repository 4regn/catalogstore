import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { initiateStitchConsentPayment } from "../../../../lib/stitch";
import { getSellerForSetlaOrder, markSetlaInstalmentPaid } from "../../../../lib/setla-instalments";
import { sendEmail } from "../../../../lib/email";
import { SETLA_APP_ORIGIN } from "../../../../lib/setla-email";

export const dynamic = "force-dynamic";

// A card that's genuinely declining shouldn't get auto-charged forever --
// give up after this many failed attempts (one per day, since this cron
// runs daily) and leave the instalment "overdue" for the customer's
// existing manual "pay this instalment" button (still Yoco, unaffected).
const MAX_AUTO_RETRY_ATTEMPTS = 3;

/* Daily Vercel cron: auto-collects SETLA Pay Later instalments #2+ against
   the card saved at instalment #1 (see lib/setla-instalments.ts's
   activateSetlaPlanAfterPayment storing plan.stitch_consent_id, and
   app/api/checkout/setla-create + app/api/setla/checkout/create for where
   that consent is created). Instalment #1 is always paid inline at
   checkout itself and never appears here (it's inserted already "paid").

   Unlike the checkout-time charges, this is a merchant-initiated
   transaction with no customer redirect involved -- initiateStitchConsentPayment
   is a plain synchronous API call, so the result is acted on directly here,
   no webhook round-trip needed (contrast app/api/checkout/stitch-webhook's
   CONSENT branch, which confirms the checkout-time charge because THAT one
   did send the customer to a Stitch-hosted page and back).

   Plans without a stitch_consent_id (created before this feature existed,
   or Laybuy, which has no fixed schedule to automate) are simply not
   matched by the join below -- their instalments stay exactly as before,
   collected only via the customer's manual "pay this instalment" button. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = getAdmin();
  const now = new Date().toISOString();

  const { data: dueInstalments, error: dueErr } = await admin
    .from("setla_instalments")
    .select("id, plan_id, sequence_number, amount, status, stitch_auto_retry_count")
    .in("status", ["scheduled", "overdue"])
    .lte("due_at", now)
    .lt("stitch_auto_retry_count", MAX_AUTO_RETRY_ATTEMPTS)
    .limit(500);
  if (dueErr) return NextResponse.json({ error: dueErr.message }, { status: 500 });
  if (!dueInstalments || !dueInstalments.length) return NextResponse.json({ status: "ok", attempted: 0, paid: 0, failed: 0, skipped: 0 });

  const planIds = [...new Set(dueInstalments.map((i) => i.plan_id))];
  const { data: plans, error: plansErr } = await admin
    .from("setla_payment_plans")
    .select("id, customer_id, order_id, stitch_consent_id, stitch_consent_status")
    .in("id", planIds)
    .not("stitch_consent_id", "is", null)
    .eq("stitch_consent_status", "active");
  if (plansErr) return NextResponse.json({ error: plansErr.message }, { status: 500 });

  const planById = new Map((plans || []).map((p) => [p.id, p]));

  let paid = 0, failed = 0, skipped = 0;
  for (const instalment of dueInstalments) {
    const plan = planById.get(instalment.plan_id);
    if (!plan || !plan.stitch_consent_id) { skipped++; continue; }

    const amountCents = Math.round(Number(instalment.amount) * 100);
    const result = await initiateStitchConsentPayment(plan.stitch_consent_id, amountCents);

    if (result.ok) {
      await markSetlaInstalmentPaid(admin, { instalmentId: instalment.id, paymentId: result.paymentId, eventId: null });
      paid++;
      continue;
    }

    failed++;
    const newRetryCount = (instalment.stitch_auto_retry_count || 0) + 1;
    await admin.from("setla_instalments").update({ status: "overdue", stitch_auto_retry_count: newRetryCount }).eq("id", instalment.id);

    if (result.reauthorisationRequired) {
      // No point retrying the same card again -- it needs the cardholder
      // to redo a 3DS step-up, which only they can do. Stop auto-attempting
      // this plan's future instalments too (checked via
      // stitch_consent_status='active' in the plan query above), and tell
      // the customer directly since this is the one failure mode where
      // silence would just mean the same failure repeating every day.
      await admin.from("setla_payment_plans").update({ stitch_consent_status: "reauth_required" }).eq("id", plan.id);
      await notifyCustomer(admin, plan.customer_id, plan.order_id, instalment.sequence_number, "reauth");
    } else if (newRetryCount >= MAX_AUTO_RETRY_ATTEMPTS) {
      await notifyCustomer(admin, plan.customer_id, plan.order_id, instalment.sequence_number, "gave_up");
    }
  }

  return NextResponse.json({ status: "ok", attempted: dueInstalments.length, paid, failed, skipped });
}

async function notifyCustomer(admin: ReturnType<typeof getAdmin>, customerId: string, setlaOrderId: string, sequenceNumber: number, reason: "reauth" | "gave_up") {
  const { data: customer } = await admin.from("setla_customers").select("id, first_name, email").eq("id", customerId).maybeSingle();
  if (!customer) return;
  const title = reason === "reauth" ? "Please re-verify your card for SETLA" : "We couldn't collect your SETLA instalment automatically";
  const body = reason === "reauth"
    ? `Your bank needs you to re-verify instalment ${sequenceNumber} before we can charge your saved card again. Please pay it manually from your dashboard, and re-link your card if asked to.`
    : `We tried a few times to automatically collect instalment ${sequenceNumber} and it didn't go through. Please pay it manually from your dashboard.`;
  await admin.from("setla_notifications").insert({ customer_id: customer.id, notification_type: "instalment_paid", title, body });
  const seller = await getSellerForSetlaOrder(admin, setlaOrderId);
  // #plans (see setla.js's showDashboardView/initialView) jumps straight
  // to the Payment Plans view -- where the actual "Pay now" button for
  // this instalment already is -- instead of leaving the customer to find
  // their own way there from a bare "pay it manually from your dashboard"
  // sentence with no link at all.
  const payUrl = `${SETLA_APP_ORIGIN}/setla/dashboard.html#plans`;
  await sendEmail({ seller, to: customer.email, from: "SETLA Payments <orders@catalogstore.co.za>", subject: title, html: `<p>Hi ${customer.first_name},</p><p>${body}</p><p><a href="${payUrl}">Pay now &rarr;</a></p>` });
}
