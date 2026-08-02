import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../lib/setla-customer";

export const dynamic = "force-dynamic";

/* Feeds dashboard.html's renderDashboard() -- shaped to match what that
   function (still, deliberately, from the original static prototype)
   already expects: firstName/lastName/name/email/applicationStatus/
   approvedLimit/availableLimit/createdAt/application.{bank,accountLast4}.
   orders stays [] until Phase 2 (real checkout/order creation) -- every
   render branch downstream already treats an empty orders list as a
   normal, valid state (this is what a genuinely new customer looks like
   today too), so nothing needs to change there for this to be "real". */
export async function GET(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  const admin = getAdmin();

  const [{ data: latestApplication }, { data: latestBank }, { data: notifications }] = await Promise.all([
    admin
      .from("setla_applications")
      .select("id, status, decision_reason, proposed_limit, submitted_at, reviewed_at")
      .eq("customer_id", customer.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("setla_bank_accounts")
      .select("bank_name, account_last4, review_status, is_refund_account")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("setla_notifications")
      .select("id, notification_type, title, body, metadata, read_at, created_at")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const fullName = `${customer.first_name} ${customer.last_name}`.trim();

  return NextResponse.json({
    id: customer.id,
    firstName: customer.first_name,
    lastName: customer.last_name,
    name: fullName,
    email: customer.email,
    phone: customer.phone,
    address: customer.address && Object.keys(customer.address).length ? [customer.address.address, customer.address.city, customer.address.province, customer.address.postal].filter(Boolean).join(", ") : null,
    applicationStatus: customer.application_status,
    identityStatus: customer.identity_status,
    approvedLimit: Number(customer.approved_limit || 0),
    availableLimit: Number(customer.available_limit || 0),
    paymentStatus: customer.payment_status,
    createdAt: customer.created_at,
    application: latestApplication
      ? {
          id: latestApplication.id,
          status: latestApplication.status,
          submittedAt: latestApplication.submitted_at,
          reviewedAt: latestApplication.reviewed_at,
          decisionReason: latestApplication.decision_reason,
          bank: latestBank?.bank_name || null,
          accountLast4: latestBank?.account_last4 || null,
        }
      : null,
    notifications: notifications || [],
    // Real orders/payment plans/instalments arrive in Phase 2 -- an
    // approved customer with no orders yet is indistinguishable from
    // "Phase 2 isn't built yet", which is exactly the point.
    orders: [],
  });
}
