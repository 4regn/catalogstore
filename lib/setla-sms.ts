import { sendSms } from "./sms";
import { SETLA_APP_ORIGIN } from "./setla-email";

// SMS companion to sendApprovedSetlaLimitEmail -- same "standard vs
// starter" variant split (see that function's own comment for why), kept
// deliberately short since SMS is billed per-segment (~160 chars for
// plain GSM-7 text) rather than styled like the email at all.
export function approvedLimitSmsContent(firstName: string, approvedLimit: number, variant: "standard" | "starter" = "standard"): string {
  const amount = Math.round(Number(approvedLimit) || 0);
  const dashboardUrl = `${SETLA_APP_ORIGIN}/setla/dashboard.html`;
  const limitLabel = variant === "starter" ? "starter limit" : "limit";
  return `Hi ${firstName}, your SETLA ${limitLabel} of R${amount.toLocaleString("en-ZA")} is ready! Shop 4REGN or UNIK Labs now, pay later. View dashboard: ${dashboardUrl}`;
}

export async function sendApprovedSetlaLimitSms(opts: { to: string; firstName: string; approvedLimit: number; variant?: "standard" | "starter" }) {
  await sendSms({ to: opts.to, message: approvedLimitSmsContent(opts.firstName, opts.approvedLimit, opts.variant) });
}
