import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { writeAudit } from "../../../../lib/admin-audit";
import { getClientIP } from "../../../../lib/rate-limit";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "info@4regn.com";

/* While impersonating a seller, the dashboard never loads the existing
   payment keys into the browser. To still let the admin SET new values
   (for onboarding) this endpoint accepts a partial checkout_config and
   merges it into the existing row server-side.

   Empty-string fields are treated as "leave the existing value alone",
   so the admin can update one field (eg. eft_account_number) without
   nuking the others.

   Authentication is two-part:
   - the caller's supabase session must be the seller's (they're acting
     as the seller in this flow), AND
   - the cs_admin_email cookie must match ADMIN_EMAIL (set by the
     impersonation start endpoint).
   This double-check prevents either an admin without an active assist
   session OR a seller logged in normally from posting to this endpoint. */

const SENSITIVE_KEYS = new Set([
  "payfast_merchant_key",
  "payfast_merchant_id",
  "eft_account_number",
]);

interface CheckoutConfigPatch {
  eft_enabled?: boolean;
  eft_bank_name?: string;
  eft_account_number?: string;
  eft_account_name?: string;
  eft_branch_code?: string;
  eft_account_type?: string;
  eft_instructions?: string;
  payfast_enabled?: boolean;
  payfast_merchant_id?: string;
  payfast_merchant_key?: string;
  delivery_enabled?: boolean;
  pickup_enabled?: boolean;
  pickup_address?: string;
  pickup_instructions?: string;
  shipping_options?: { name: string; price: number }[];
  whatsapp_checkout_enabled?: boolean;
}

export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies();
  const adminEmailCookie = (cookieStore.get("cs_admin_email")?.value || "").toLowerCase();
  const impersonatingSellerId = cookieStore.get("cs_impersonating")?.value || "";

  if (!adminEmailCookie || adminEmailCookie !== ADMIN_EMAIL.toLowerCase() || !impersonatingSellerId) {
    return NextResponse.json({ error: "Admin assist session not active" }, { status: 403 });
  }

  /* Also verify the supabase session belongs to the seller we're acting as.
     Without this an admin could PATCH any seller by swapping the cookie. */
  const accessToken =
    cookieStore.get("sb-access-token")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  if (userData.user.id !== impersonatingSellerId) {
    return NextResponse.json({ error: "Session / impersonation target mismatch" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as CheckoutConfigPatch | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  /* Fetch existing config so we can merge */
  const { data: existing, error: getErr } = await supabaseAdmin
    .from("sellers")
    .select("checkout_config")
    .eq("id", impersonatingSellerId)
    .single();
  if (getErr || !existing) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

  const current: Record<string, unknown> = (existing.checkout_config || {}) as any;
  const merged: Record<string, unknown> = { ...current };
  const writtenFields: string[] = [];
  const sensitiveWritten: string[] = [];

  for (const [k, v] of Object.entries(body)) {
    /* Empty-string string fields mean "don't touch the existing value" —
       crucial for sensitive keys the admin never reads. */
    if (typeof v === "string" && v === "") continue;
    if (v === undefined) continue;
    merged[k] = v;
    writtenFields.push(k);
    if (SENSITIVE_KEYS.has(k)) sensitiveWritten.push(k);
  }

  const { error: updErr } = await supabaseAdmin
    .from("sellers")
    .update({ checkout_config: merged })
    .eq("id", impersonatingSellerId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await writeAudit({
    adminEmail: adminEmailCookie,
    action: "edit_checkout_config",
    targetSellerId: impersonatingSellerId,
    fields: writtenFields,
    details: sensitiveWritten.length ? { sensitiveFieldsWritten: sensitiveWritten } : undefined,
    ip: getClientIP(req),
    userAgent: req.headers.get("user-agent"),
  });

  /* Response strips sensitive keys so even the admin can't read back what
     they just wrote. */
  const safeMerged: Record<string, unknown> = { ...merged };
  for (const k of SENSITIVE_KEYS) delete safeMerged[k];
  return NextResponse.json({ ok: true, checkout_config: safeMerged });
}
