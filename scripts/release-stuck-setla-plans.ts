// One-off cleanup for SETLA Pay Later plans created before checkout was
// changed to defer plan/instalment/credit-claim creation until Yoco
// actually confirms the first charge (see activateSetlaPlanAfterPayment
// in lib/setla-instalments.ts). Under the old code, a plan/instalment
// schedule was created and the customer's available_limit was claimed
// BEFORE the Yoco redirect -- so an abandoned or declined first charge
// left a plan sitting "active" (instalment #1 still "due now") with the
// limit gone, even though its underlying order never actually got paid.
//
// This finds every setla_payment_plans row that's still "active" whose
// underlying order is NOT "paid" (i.e. pending/abandoned/failed -- the
// first charge never genuinely succeeded), and does exactly what
// voidStillbornPayLaterPlan does for each: cancels the plan, gives the
// principal_amount back to the customer's available_limit, and cancels
// the setla_orders row.
//
// Dry-run by default -- prints exactly what would change without writing
// anything. Add --confirm to actually update the DB.
//
// Usage:
//   npx tsx scripts/release-stuck-setla-plans.ts [--confirm]

import { getAdminClient } from "./lib/migrate-shared";

function parseArgs() {
  return { confirm: process.argv.includes("--confirm") };
}

async function main() {
  const { confirm } = parseArgs();
  const admin = getAdminClient();

  const { data: plans, error: plansErr } = await admin
    .from("setla_payment_plans")
    .select("id, customer_id, principal_amount, order_id")
    .eq("plan_type", "pay_later")
    .eq("status", "active");
  if (plansErr) {
    console.error("Failed to fetch setla_payment_plans:", plansErr.message);
    process.exit(1);
  }
  if (!plans || !plans.length) {
    console.log("No active Pay Later plans found at all -- nothing to check.");
    return;
  }

  const { data: setlaOrders, error: setlaOrdersErr } = await admin
    .from("setla_orders")
    .select("id, unik_order_id")
    .in("id", plans.map((p) => p.order_id));
  if (setlaOrdersErr) {
    console.error("Failed to fetch setla_orders:", setlaOrdersErr.message);
    process.exit(1);
  }
  const setlaOrderById = new Map((setlaOrders || []).map((o) => [o.id, o]));

  const { data: orders, error: ordersErr } = await admin
    .from("orders")
    .select("id, order_number, total, payment_status, customer_name, customer_email")
    .in("id", (setlaOrders || []).map((o) => o.unik_order_id));
  if (ordersErr) {
    console.error("Failed to fetch orders:", ordersErr.message);
    process.exit(1);
  }
  const orderById = new Map((orders || []).map((o) => [o.id, o]));

  const { data: customers, error: customersErr } = await admin
    .from("setla_customers")
    .select("id, email, available_limit")
    .in("id", plans.map((p) => p.customer_id));
  if (customersErr) {
    console.error("Failed to fetch setla_customers:", customersErr.message);
    process.exit(1);
  }
  const customerById = new Map((customers || []).map((c) => [c.id, c]));

  const stuck = plans
    .map((plan) => {
      const setlaOrder = setlaOrderById.get(plan.order_id);
      const order = setlaOrder ? orderById.get(setlaOrder.unik_order_id) : null;
      return { plan, setlaOrder, order };
    })
    .filter((row) => row.order && row.order.payment_status !== "paid");

  if (!stuck.length) {
    console.log(`Checked ${plans.length} active Pay Later plan(s) -- all belong to genuinely paid orders. Nothing stuck.`);
    return;
  }

  console.log(`Found ${stuck.length} stuck plan(s):\n`);
  for (const { plan, order } of stuck) {
    const customer = customerById.get(plan.customer_id);
    console.log(
      `  Order #${order?.order_number ?? order?.id} (R${order?.total}, ${order?.customer_name} <${order?.customer_email}>) -- ` +
        `order.payment_status=${order?.payment_status}, plan principal=R${plan.principal_amount}, ` +
        `customer=${customer?.email ?? plan.customer_id}, current available_limit=R${customer?.available_limit ?? "?"}`
    );
  }

  if (!confirm) {
    console.log("\nDry run only -- re-run with --confirm to release these plans and restore the credit.");
    return;
  }

  console.log("\nReleasing...");
  for (const { plan, setlaOrder, order } of stuck) {
    const { data: voided } = await admin
      .from("setla_payment_plans")
      .update({ status: "cancelled" })
      .eq("id", plan.id)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (!voided) {
      console.log(`  Skipped plan ${plan.id} -- already changed by something else since the check above.`);
      continue;
    }

    // Re-read the customer's CURRENT available_limit right before this
    // specific release, not the batch snapshot from earlier -- two stuck
    // orders belonging to the same customer (a real case this surfaced)
    // would otherwise both optimistic-lock against the same stale
    // pre-loop value, so the second release silently loses the race and
    // matches 0 rows the moment the first one has already applied.
    const { data: freshCustomer } = await admin.from("setla_customers").select("id, email, available_limit").eq("id", plan.customer_id).maybeSingle();
    if (freshCustomer) {
      const { data: released } = await admin
        .from("setla_customers")
        .update({ available_limit: Number(freshCustomer.available_limit) + Number(plan.principal_amount) })
        .eq("id", freshCustomer.id)
        .eq("available_limit", freshCustomer.available_limit)
        .select("id")
        .maybeSingle();
      if (!released) {
        console.error(`  WARNING: plan ${plan.id} cancelled but the limit release lost a race for ${freshCustomer.email} -- re-run this script to catch it (it only checks plan status, so a cancelled-but-unreleased plan won't show up again; ping for a targeted fix if that happens).`);
      }
    }

    if (setlaOrder) {
      await admin.from("setla_orders").update({ status: "cancelled" }).eq("id", setlaOrder.id);
    }
    if (order?.payment_status === "pending") {
      await admin.from("orders").update({ payment_status: "failed", status: "failed" }).eq("id", order.id).eq("payment_status", "pending");
    }

    console.log(`  Released R${plan.principal_amount} back to ${freshCustomer?.email ?? plan.customer_id} (order #${order?.order_number ?? order?.id})`);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
