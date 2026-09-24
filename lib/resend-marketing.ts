import { readFile } from "node:fs/promises";
import path from "node:path";
import { getFourRegnResendFrom } from "./email";

import { SETLA_PAY_LATER_CAMPAIGN, BIG_SPRING_SALE_CAMPAIGN, BIG_SPRING_SALE_REMINDER_CAMPAIGN, getMarketingCampaign } from "./marketing-campaigns";
export { SETLA_PAY_LATER_CAMPAIGN } from "./marketing-campaigns";

export async function marketingCampaignHtml(key: string) {
  const campaign = getMarketingCampaign(key);
  if (!campaign) throw new Error("Unknown email campaign");
  // Literal paths ensure both templates are included in the server deployment.
  if (campaign.key === SETLA_PAY_LATER_CAMPAIGN.key) {
    return readFile(path.join(process.cwd(), "public", "email", "4regn-setla-pay-later-2026.html"), "utf8");
  }
  if (campaign.key === BIG_SPRING_SALE_CAMPAIGN.key || campaign.key === BIG_SPRING_SALE_REMINDER_CAMPAIGN.key) {
    return readFile(path.join(process.cwd(), "public", "email", "4regn-big-spring-sale-2026-09.html"), "utf8");
  }
  return readFile(path.join(process.cwd(), "public", "email", "4regn-r229-flash-sale-2026-09.html"), "utf8");
}

export async function setlaPayLaterCampaignHtml() {
  return marketingCampaignHtml(SETLA_PAY_LATER_CAMPAIGN.key);
}

export function marketingApiKey() {
  const key = process.env.FOUR_REGN_RESEND_MARKETING_API_KEY;
  if (!key) {
    throw new Error("FOUR_REGN_RESEND_MARKETING_API_KEY is not configured. Add a separate Resend Full access key in Vercel for Contacts, Segments and Broadcasts.");
  }
  return key;
}

export async function resendMarketingRequest<T>(endpoint: string, init: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch(`https://api.resend.com${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${marketingApiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (response.status === 429 && retry) {
    const retryAfter = Math.min(5000, Math.max(500, Number(response.headers.get("retry-after") || 1) * 1000));
    await new Promise((resolve) => setTimeout(resolve, retryAfter));
    return resendMarketingRequest<T>(endpoint, init, false);
  }

  const body = await response.text();
  let parsed: any = {};
  try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { message: body }; }
  if (!response.ok) {
    const error = new Error(parsed?.message || `Resend request failed (${response.status})`) as Error & { status?: number; details?: unknown };
    error.status = response.status;
    error.details = parsed;
    throw error;
  }
  return parsed as T;
}

export async function ensureContactInSegment(contact: { email: string; firstName?: string | null; lastName?: string | null }, segmentId: string) {
  try {
    await resendMarketingRequest("/contacts", {
      method: "POST",
      body: JSON.stringify({
        email: contact.email,
        first_name: contact.firstName || undefined,
        last_name: contact.lastName || undefined,
        unsubscribed: false,
        segments: [{ id: segmentId }],
      }),
    });
    return "created" as const;
  } catch (error: any) {
    if (error?.status !== 409) throw error;
  }

  const encodedEmail = encodeURIComponent(contact.email);
  await resendMarketingRequest(`/contacts/${encodedEmail}`, {
    method: "PATCH",
    body: JSON.stringify({
      first_name: contact.firstName || undefined,
      last_name: contact.lastName || undefined,
    }),
  });
  try {
    await resendMarketingRequest(`/contacts/${encodedEmail}/segments/${segmentId}`, { method: "POST", body: "{}" });
  } catch (error: any) {
    if (error?.status !== 409) throw error;
  }
  return "updated" as const;
}

export type ResendSegmentContact = { id: string; email: string; unsubscribed: boolean };

/* Full contact list for a segment, with each contact's CURRENT unsubscribed
   status -- the read half of what ensureContactInSegment only ever writes.
   Paginates via Resend's cursor convention (GET .../contacts, response
   { object: "list", data: [...], has_more }, next page via
   ?after=<last item's id>) since a real segment here can hold 1000+
   contacts, well past a single page. Used by the unsubscribe reconciliation
   cron to catch anyone the contact.updated webhook missed (e.g. the 25 days
   it sat disabled in Resend's dashboard before anyone noticed) -- Resend's
   own unsubscribed flag is authoritative here, not our local guess. */
export async function listSegmentContacts(segmentId: string): Promise<ResendSegmentContact[]> {
  const all: ResendSegmentContact[] = [];
  let after: string | null = null;
  for (let page = 0; page < 50; page++) {
    const queryString: string = after ? `?after=${encodeURIComponent(after)}` : "";
    const response: { data: ResendSegmentContact[]; has_more?: boolean } = await resendMarketingRequest(`/segments/${segmentId}/contacts${queryString}`);
    const batch: ResendSegmentContact[] = response?.data || [];
    all.push(...batch);
    if (!response?.has_more || !batch.length) break;
    after = batch[batch.length - 1]?.id || null;
    if (!after) break;
  }
  return all;
}

export function fourRegnMarketingFrom() {
  return getFourRegnResendFrom();
}

export type ReconcileUnsubscribesResult = { checked: number; corrected: number; note?: string };

/* Shared by the daily reconciliation cron (app/api/cron/reconcile-resend-unsubscribes)
   and the dashboard "sync now" button (app/api/dashboard/reconcile-unsubscribes) so
   both trigger the exact same logic -- Resend's own unsubscribed flag is authoritative,
   corrected onto the local customers row in whichever direction they disagree. */
export async function reconcileSellerUnsubscribes(admin: any, sellerId: string): Promise<ReconcileUnsubscribesResult> {
  const { data: settings } = await admin.from("marketing_email_settings").select("resend_segment_id").eq("seller_id", sellerId).maybeSingle();
  if (!settings?.resend_segment_id) return { checked: 0, corrected: 0, note: "No Resend segment configured yet" };

  const [resendContacts, localCustomersRes] = await Promise.all([
    listSegmentContacts(settings.resend_segment_id),
    admin.from("customers").select("id, email, accepts_email_marketing").eq("seller_id", sellerId),
  ]);

  const localCustomers: { id: string; email: string; accepts_email_marketing: boolean }[] = localCustomersRes.data || [];
  const localByEmail = new Map(localCustomers.map((c) => [String(c.email || "").trim().toLowerCase(), c]));

  let corrected = 0;
  const nowIso = new Date().toISOString();
  for (const contact of resendContacts) {
    const email = String(contact.email || "").trim().toLowerCase();
    if (!email) continue;
    const local = localByEmail.get(email);
    if (!local) continue; // Resend contact with no matching local customer row -- nothing to reconcile.
    const shouldAcceptMarketing = !contact.unsubscribed;
    if (local.accepts_email_marketing === shouldAcceptMarketing) continue;

    const { error } = await admin
      .from("customers")
      .update({ accepts_email_marketing: shouldAcceptMarketing, marketing_consent_updated_at: nowIso, updated_at: nowIso })
      .eq("id", local.id);
    if (!error) corrected++;
  }

  return { checked: resendContacts.length, corrected };
}
