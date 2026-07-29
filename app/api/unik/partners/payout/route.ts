import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikPartner } from "../../../../../lib/unik-partner";

export const dynamic = "force-dynamic";

const BANKS = ["Absa", "Capitec", "FNB", "Nedbank", "Standard Bank", "TymeBank"];
const ACCOUNT_TYPES = ["Cheque / Current", "Savings", "Transmission"];

/* Saves banking details ahead of the payout-request flow (a later phase) --
   same shape and validation as brand_managers' payout route, since it's the
   same real-world data. Only the last four digits of the account number are
   ever stored. */
export async function PATCH(req: NextRequest) {
  const auth = await requireUnikPartner(req);
  if ("response" in auth) return auth.response;
  const { partner } = auth;

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
  if (!accountNumber && !partner.payout_account_last4) {
    return NextResponse.json({ error: "Enter your account number" }, { status: 400 });
  }
  if (accountNumber && accountNumber.length < 6) return NextResponse.json({ error: "Enter a valid account number" }, { status: 400 });

  const update: Record<string, string> = {
    payout_account_holder: accountHolder,
    payout_bank: bank,
    payout_account_type: accountType,
    payout_branch_code: branchCode,
    updated_at: new Date().toISOString(),
  };
  if (accountNumber) update.payout_account_last4 = accountNumber.slice(-4);

  const { error } = await getAdmin().from("unik_partners").update(update).eq("id", partner.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, accountLast4: (update.payout_account_last4 as string) || undefined });
}
