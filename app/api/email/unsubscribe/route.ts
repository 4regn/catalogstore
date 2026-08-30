import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { unsubscribeToken } from "../../../../lib/marketing-unsubscribe";

export const dynamic = "force-dynamic";

// Public, one-click, no login required -- standard for an email
// unsubscribe link. The token (an HMAC of seller+email) is what stops
// someone from unsubscribing an address that isn't theirs by just editing
// the URL.
function errorPage(message: string) {
  return new NextResponse(
    `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:60px 20px;color:#2f2a38;"><h2>${message}</h2></body></html>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const sellerId = req.nextUrl.searchParams.get("seller") || "";
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!sellerId || !email || !token) return errorPage("This unsubscribe link is missing information.");
  if (unsubscribeToken(sellerId, email) !== token) return errorPage("This unsubscribe link is invalid.");

  const admin = getAdmin();
  const { error } = await admin
    .from("marketing_email_unsubscribes")
    .upsert({ seller_id: sellerId, email }, { onConflict: "seller_id,email" });
  if (error) {
    console.error("unsubscribe upsert failed:", error);
    return errorPage("Something went wrong -- please try again.");
  }

  return new NextResponse(
    `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:60px 20px;color:#2f2a38;"><h2>You're unsubscribed</h2><p>${email} won't receive cart reminder emails from us again.</p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
