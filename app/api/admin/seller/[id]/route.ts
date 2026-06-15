import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdmin } from "../../../../../lib/supabase-admin";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "info@4regn.com";

/* Fields that are safe for the admin to see and edit. Anything not in this
   set is either sensitive (API keys, banking details) or system-managed
   (id, subscription_status, etc.) and stays server-side only.
   The seller's own dashboard sees more — admin assist intentionally
   doesn't. */
const READABLE_FIELDS = [
  "id", "store_name", "subdomain", "template", "primary_color",
  "tagline", "description", "logo_url", "banner_url",
  "whatsapp_number", "collections", "social_links",
  "store_config",
  "subscription_status", "trial_ends_at", "subscription_plan", "plan",
  "email", "created_at",
].join(", ");

const WRITABLE_TOP_LEVEL = new Set([
  "store_name", "subdomain", "template", "primary_color",
  "tagline", "description", "logo_url", "banner_url",
  "whatsapp_number", "collections", "social_links", "store_config",
]);

async function requireAdmin(req: NextRequest): Promise<{ ok: true; email: string } | { ok: false; res: NextResponse }> {
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get("sb-access-token")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) {
    return { ok: false, res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const { data: userData, error } = await getAdmin().auth.getUser(accessToken);
  if (error || !userData.user) {
    return { ok: false, res: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  }
  if ((userData.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, email: userData.user.email! };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing seller id" }, { status: 400 });

  const { data: seller, error } = await getAdmin()
    .from("sellers")
    .select(READABLE_FIELDS)
    .eq("id", id)
    .single();

  if (error || !seller) {
    return NextResponse.json({ error: "Seller not found" }, { status: 404 });
  }
  /* By design the response never includes checkout_config / payfast_merchant_* /
     eft_* — those are simply not in READABLE_FIELDS. */
  return NextResponse.json({ seller });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing seller id" }, { status: 400 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  /* Whitelist top-level keys. Reject anything not on the writable list so
     admin assist can never touch checkout_config / payfast_* / eft_* even
     if a malicious or buggy client sends them. */
  const sanitized: Record<string, unknown> = {};
  for (const k of Object.keys(body)) {
    if (WRITABLE_TOP_LEVEL.has(k)) {
      sanitized[k] = body[k];
    }
  }
  if (Object.keys(sanitized).length === 0) {
    return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
  }

  /* If store_config is being written, also scrub it: never let admin write
     EFT/PayFast secrets via the store_config blob either. (Belt + suspenders;
     these aren't currently in store_config, but if any get added they won't
     leak through this path.) */
  if (sanitized.store_config && typeof sanitized.store_config === "object") {
    const sc = sanitized.store_config as Record<string, unknown>;
    for (const k of Object.keys(sc)) {
      if (k.startsWith("payfast_") || k.startsWith("eft_") || k === "merchant_id" || k === "merchant_key") {
        delete sc[k];
      }
    }
  }

  const { data: updated, error } = await getAdmin()
    .from("sellers")
    .update(sanitized)
    .eq("id", id)
    .select(READABLE_FIELDS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  /* Audit log — best effort, don't block on it */
  try {
    await getAdmin().from("admin_audit_log").insert({
      admin_email: auth.email,
      action: "edit_seller",
      target_seller_id: id,
      fields: Object.keys(sanitized),
    });
  } catch { /* table may not exist yet; no-op */ }

  return NextResponse.json({ seller: updated });
}
