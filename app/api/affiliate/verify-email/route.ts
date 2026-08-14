import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

// Plain link-click verification (no login required to click it -- the
// affiliate is reading this from their own inbox) -- matches how
// SETLA's/UNIK's own reset-password links work, just a redirect instead
// of a form. Always redirects to the affiliate login page with a status
// query param the login screen can show a message for, rather than
// rendering its own bare page here.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const redirectTo = (status: string) => NextResponse.redirect(`${APP_ORIGIN}/affiliate/login?verify=${status}`);

  if (!token) return redirectTo("missing");

  const admin = getAdmin();
  const { data: affiliate } = await admin
    .from("affiliates")
    .select("id, email_verified")
    .eq("email_verification_token", token)
    .maybeSingle();

  if (!affiliate) return redirectTo("invalid");
  if (affiliate.email_verified) return redirectTo("already");

  const { error } = await admin
    .from("affiliates")
    .update({ email_verified: true, email_verification_token: null })
    .eq("id", affiliate.id);

  if (error) {
    console.error("Affiliate email verification update failed:", error);
    return redirectTo("error");
  }

  return redirectTo("success");
}
