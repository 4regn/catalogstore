// Targeted follow-up for a specific race in release-stuck-setla-plans.ts's
// first run: when the same customer had two stuck plans, both releases
// optimistic-locked against the same stale pre-loop available_limit
// snapshot, so the second one silently lost the race and matched 0 rows --
// its plan was cancelled correctly, but the money was never actually
// given back. release-stuck-setla-plans.ts only looks for plans still
// "active", so an already-cancelled-but-unreleased plan won't show up
// again there; this adds a fixed amount directly instead.
//
// Guarded against double-running: refuses if the resulting available_limit
// would exceed the customer's approved_limit, since that should never
// happen from a genuine release.
//
// Dry-run by default -- add --confirm to actually update the DB.
//
// Usage:
//   npx tsx scripts/top-up-setla-limit.ts --email=customer@example.com --amount=509 [--confirm]

import { getAdminClient } from "./lib/migrate-shared";

function parseArgs() {
  const out: { email?: string; amount?: number; confirm: boolean } = { confirm: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--email=")) out.email = arg.slice("--email=".length).trim().toLowerCase();
    else if (arg.startsWith("--amount=")) out.amount = Number(arg.slice("--amount=".length));
    else if (arg === "--confirm") out.confirm = true;
  }
  if (!out.email || !out.amount || !Number.isFinite(out.amount) || out.amount <= 0) {
    console.error("Usage: npx tsx scripts/top-up-setla-limit.ts --email=customer@example.com --amount=509 [--confirm]");
    process.exit(1);
  }
  return out as { email: string; amount: number; confirm: boolean };
}

async function main() {
  const { email, amount, confirm } = parseArgs();
  const admin = getAdminClient();

  const { data: customer, error } = await admin
    .from("setla_customers")
    .select("id, email, available_limit, approved_limit")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    console.error("Failed to fetch setla_customers:", error.message);
    process.exit(1);
  }
  if (!customer) {
    console.error(`No SETLA customer found for ${email}`);
    process.exit(1);
  }

  const current = Number(customer.available_limit);
  const approved = Number(customer.approved_limit);
  const next = Math.round((current + amount) * 100) / 100;

  console.log(`${customer.email}: available_limit R${current} -> R${next} (approved_limit R${approved})`);

  if (next > approved) {
    console.error(`Refusing: R${next} would exceed the approved limit of R${approved} -- this amount was likely already applied. Stopping without changing anything.`);
    process.exit(1);
  }

  if (!confirm) {
    console.log("Dry run only -- re-run with --confirm to apply.");
    return;
  }

  const { data: updated, error: updateErr } = await admin
    .from("setla_customers")
    .update({ available_limit: next })
    .eq("id", customer.id)
    .eq("available_limit", current)
    .select("id")
    .maybeSingle();
  if (updateErr) {
    console.error("Update failed:", updateErr.message);
    process.exit(1);
  }
  if (!updated) {
    console.error("Update matched 0 rows -- the limit changed since it was read above. Re-run to recheck the current value.");
    process.exit(1);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
