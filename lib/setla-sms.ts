import { sendSms } from "./sms";

// setla.4regn.com is the SETLA marketing/customer-facing domain (see
// middleware.ts's SETLA_MARKETING_HOSTS) -- it rewrites clean paths like
// /dashboard straight to the real /setla/dashboard.html page, so this is
// the same destination the "official" uniklabs.co.za link points at,
// just shorter and branded to 4REGN, which is who most of these
// customers actually know. Kept local to this file rather than pulled
// from SETLA_APP_ORIGIN in setla-email.ts, since that constant is also
// used to fetch logo assets and shouldn't be repointed just for this.
const SETLA_DASHBOARD_URL = "https://setla.4regn.com/dashboard";

// SMS companion to sendApprovedSetlaLimitEmail -- same "standard vs
// starter" variant split (see that function's own comment for why), kept
// deliberately short since SMS is billed per-segment (~160 chars for
// plain GSM-7 text) rather than styled like the email at all. Copy
// matches what's actually already gone out to real approved customers
// (confirmed directly), not a separate draft.
// approvedLimit is accepted (not just firstName/variant) to keep this
// function's shape symmetric with sendApprovedSetlaLimitEmail's and
// because every caller already has it in hand for their own audit-log
// entry -- the real copy just doesn't mention the number, unlike the
// email, so it's unused in the string itself right now.
export function approvedLimitSmsContent(firstName: string, approvedLimit: number, variant: "standard" | "starter" = "standard"): string {
  const limitLabel = variant === "starter" ? "starter limit" : "spend limit";
  return `Hi ${firstName}, you've been approved! \u{1F389} Your SETLA ${limitLabel} is ready. BUY NOW, PAY LATER! Shop on 4REGN or UNIK Labs: ${SETLA_DASHBOARD_URL}`;
}

export async function sendApprovedSetlaLimitSms(opts: { to: string; firstName: string; approvedLimit: number; variant?: "standard" | "starter" }) {
  await sendSms({ to: opts.to, message: approvedLimitSmsContent(opts.firstName, opts.approvedLimit, opts.variant) });
}

// Ongoing "you still haven't used it" nudge for an already-approved
// customer, distinct from the one-time approvedLimitSmsContent above --
// see limitReminderEmailContent in lib/setla-email.ts for the email
// counterpart. Unlike the approval SMS, this one names the actual amount:
// the whole point is reminding someone of money they're specifically not
// using, so the number is what makes it worth reading.
export function limitReminderSmsContent(firstName: string, availableLimit: number): string {
  return `Hi ${firstName}, you still have R${Math.round(availableLimit).toLocaleString("en-ZA")} SETLA spend limit ready to use! Buy Now, Pay Later on 4REGN: ${SETLA_DASHBOARD_URL}`;
}

export async function sendLimitReminderSms(opts: { to: string; firstName: string; availableLimit: number }) {
  await sendSms({ to: opts.to, message: limitReminderSmsContent(opts.firstName, opts.availableLimit) });
}
