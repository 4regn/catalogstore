import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";

export const dynamic = "force-dynamic";

const BANKS = ["Absa", "Capitec", "FNB", "Nedbank", "Standard Bank", "TymeBank"];
const ACCOUNT_TYPES = ["Cheque / Current", "Savings", "Transmission"];

/* Personal-earnings payout details only -- this account never receives
   customer payments, company revenue, refunds or operating funds, and
   (matching the original design) only the last four digits of the account
   number are ever stored. */
export async function PATCH(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { manager } = auth;

  let body: { accountHolder?: string; bank?: string; accountType?: string; branchCode?: string; accountNumber?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const accountHolder = String(body.accountHolder || "").trim();
  const bank = String(body.bank || "").trim();
  const accountType = String(body.accountType || "").trim();
  const branchCode = String(body.branchCode || "").replace(/\D/g, "");
  const accountNumber = String(body.accountNumber || "").replace(/\D/g, "");

  if (!accountHolder) return NextResponse.json({ error: "Add the account holder's name" }, { status: 400 });
  if (!BANKS.includes(bank)) return NextResponse.json({ error: "Choose a valid bank" }, { status: 400 });
  if (!ACCOUNT_TYPES.includes(accountType)) return NextResponse.json({ error: "Choose a valid account type" }, { status: 400 });
  if (branchCode.length !== 6) return NextResponse.json({ error: "Branch code must be 6 digits" }, { status: 400 });
  if (accountNumber.length < 6) return NextResponse.json({ error: "Enter a valid account number" }, { status: 400 });

  const { error } = await getAdmin().from("brand_managers").update({
    payout_account_holder: accountHolder,
    payout_bank: bank,
    payout_account_type: accountType,
    payout_branch_code: branchCode,
    payout_account_last4: accountNumber.slice(-4),
    updated_at: new Date().toISOString(),
  }).eq("id", manager.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
