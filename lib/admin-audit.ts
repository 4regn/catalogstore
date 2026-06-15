/* Centralised admin-audit-log writer. All admin-assist API routes call this
   so we never silently miss an action. Best-effort: a failed insert is
   logged to console and the API continues — we don't want a missing
   audit table to break legitimate admin work. */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

/* Lazy init — Next 16's collect-page-data phase imports this module
   without env vars present. We defer createClient until the first audit
   call so the build doesn't crash. */
let _admin: SupabaseClient | null = null;
function admin() {
  if (_admin) return _admin;
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return _admin;
}

export interface AuditEntry {
  adminEmail: string;
  action: string;
  targetSellerId?: string | null;
  fields?: string[];
  details?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await admin().from("admin_audit_log").insert({
      admin_email: entry.adminEmail,
      action: entry.action,
      target_seller_id: entry.targetSellerId || null,
      fields: entry.fields || null,
      details: entry.details || null,
      ip: entry.ip || null,
      user_agent: entry.userAgent || null,
    });
  } catch (e) {
    console.error("[audit] failed to write entry", entry.action, e);
  }
}
