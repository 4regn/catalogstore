/* Centralised admin-audit-log writer. All admin-assist API routes call this
   so we never silently miss an action. Best-effort: a failed insert is
   logged to console and the API continues — we don't want a missing
   audit table to break legitimate admin work. */

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

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
    await supabaseAdmin.from("admin_audit_log").insert({
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
