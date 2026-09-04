import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";
import { rateLimit } from "../../../../../../../lib/rate-limit";
import { sendSetlaEmail, SETLA_APP_ORIGIN } from "../../../../../../../lib/setla-email";
import { formatInstalmentDueDate } from "../../../../../../../lib/setla-instalments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!rateLimit(`setla-admin-reminder:${auth.admin.id}:${id}`, 3, 3600).allowed) {
    return NextResponse.json({ error: "A reminder for this instalment was sent recently" }, { status: 429 });
  }

  const admin = getAdmin();
  const { data: instalment } = await admin
    .from("setla_instalments")
    .select("id, plan_id, sequence_number, amount, due_at, status")
    .eq("id", id)
    .maybeSingle();
  if (!instalment) return NextResponse.json({ error: "Instalment not found" }, { status: 404 });
  if (["paid", "waived", "refunded"].includes(instalment.status)) return NextResponse.json({ error: "This instalment is already settled" }, { status: 409 });

  const { data: plan } = await admin.from("setla_payment_plans").select("id, customer_id, order_id").eq("id", instalment.plan_id).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Payment plan not found" }, { status: 404 });
  const [{ data: customer }, { data: setlaOrder }] = await Promise.all([
    admin.from("setla_customers").select("id, first_name, email").eq("id", plan.customer_id).maybeSingle(),
    admin.from("setla_orders").select("unik_order_id").eq("id", plan.order_id).maybeSingle(),
  ]);
  if (!customer || !setlaOrder) return NextResponse.json({ error: "Customer order not found" }, { status: 404 });
  const { data: order } = await admin.from("orders").select("order_number, external_id").eq("id", setlaOrder.unik_order_id).maybeSingle();
  const reference = order?.external_id || (order?.order_number ? `#${order.order_number}` : "your order");
  const dueDate = formatInstalmentDueDate(instalment.due_at);

  await sendSetlaEmail({
    to: customer.email,
    firstName: customer.first_name,
    subject: `SETLA payment reminder — ${reference}`,
    kicker: instalment.status === "overdue" || new Date(instalment.due_at).getTime() < Date.now() ? "Payment overdue" : "Upcoming payment",
    headline: `Instalment ${instalment.sequence_number} of your SETLA plan is ${new Date(instalment.due_at).getTime() < Date.now() ? "overdue" : "coming up"}.`,
    bodyHtml: `A payment of <strong class="setla-fg" style="color:#ffffff">R${Number(instalment.amount).toFixed(2)}</strong> for order <strong class="setla-fg" style="color:#ffffff">${reference}</strong> is due on <strong class="setla-fg" style="color:#ffffff">${dueDate}</strong>.`,
    // #plans jumps straight to the Payment Plans view on load (see
    // setla.js's showDashboardView/initialView) instead of landing on the
    // Overview tab, where reaching the actual "Pay now" button meant
    // scrolling past the approved-limit hero and clicking through "Manage
    // payment plan" first. requireAccount() in setla.js preserves this
    // hash across the login redirect for a signed-out click too.
    ctaLabel: "Pay now",
    ctaUrl: `${SETLA_APP_ORIGIN}/setla/dashboard.html#plans`,
  });
  await Promise.all([
    admin.from("setla_notifications").insert({ customer_id: customer.id, notification_type: "repayment_reminder", title: `Payment reminder — ${reference}`, body: `R${Number(instalment.amount).toFixed(2)} due ${dueDate}`, metadata: { instalmentId: id, orderId: setlaOrder.unik_order_id } }),
    admin.from("admin_audit_log").insert({ admin_email: auth.admin.email, action: "setla_repayment_reminder", target_seller_id: null, details: { customerId: customer.id, instalmentId: id, orderId: setlaOrder.unik_order_id } }),
  ]);
  return NextResponse.json({ success: true });
}
