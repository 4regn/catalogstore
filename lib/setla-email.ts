import { sendEmail } from "./email";

// Fixed, not derived from a request -- see apply/finish/route.ts for why
// (a Resend-verified sending domain must match the links inside the email,
// or it gets flagged as spam-risk).
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

// Shared branded shell for every SETLA transactional/marketing email --
// logo header, dark/green card matching the product itself, one CTA
// button, footer. Logos are referenced by hosted URL (not inlined as
// base64) since that's what actually renders reliably across email
// clients at a reasonable message size.
export async function sendSetlaEmail(opts: {
  to: string;
  firstName: string;
  subject: string;
  kicker: string;
  headline: string;
  bodyHtml: string;
  extraHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const ctaLabel = opts.ctaLabel || "View my dashboard";
  const ctaUrl = opts.ctaUrl || `${APP_ORIGIN}/setla/dashboard.html`;

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:linear-gradient(145deg,#121612,#0a0c0a);border:1px solid #2a2f2a;border-radius:20px;overflow:hidden;font-family:'DM Sans',Arial,sans-serif;color:#f5f7f4">
<tr><td style="padding:32px 36px 26px;text-align:center;border-bottom:1px solid #1c1f1c">
<img src="${APP_ORIGIN}/setla/assets/setla-payments-logo.png" alt="SETLA Payments" height="32" style="display:inline-block;vertical-align:middle;border:0">
<span style="display:inline-block;width:1px;height:20px;background:#2a2f2a;margin:0 14px;vertical-align:middle;font-size:0;line-height:0">&nbsp;</span>
<img src="${APP_ORIGIN}/setla/assets/unik-labs-logo.png" alt="Powered by UNIK Labs" height="24" style="display:inline-block;vertical-align:middle;border:0">
</td></tr>
<tr><td style="padding:38px 36px 6px">
<div style="color:#4ade80;font-size:10.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin-bottom:14px">${opts.kicker}</div>
<h1 style="font:600 25px/1.28 'Manrope',Arial,sans-serif;letter-spacing:-.02em;margin:0 0 18px;color:#fff">${opts.headline}</h1>
<p style="font-size:14.5px;line-height:1.75;color:#c7cbc7;margin:0 0 8px 0">Hi ${opts.firstName},</p>
<p style="font-size:14.5px;line-height:1.75;color:#c7cbc7;margin:0 0 24px 0">${opts.bodyHtml}</p>
${opts.extraHtml || ""}
<a href="${ctaUrl}" style="display:inline-block;background:#007517;color:#ffffff;text-decoration:none;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:15px 28px;border-radius:999px;margin-top:4px">${ctaLabel}</a>
</td></tr>
<tr><td style="padding:26px 36px 32px;border-top:1px solid #1c1f1c">
<p style="font-size:11px;color:#7f877f;line-height:1.7;margin:0">SETLA Payments is powered by UNIK Labs. Questions? Reply to this email or reach us at <a href="mailto:support@uniklabs.co.za" style="color:#85d897;text-decoration:none">support@uniklabs.co.za</a>.</p>
</td></tr>
</table>`;

  await sendEmail({ to: opts.to, from: "SETLA Payments <orders@catalogstore.co.za>", subject: opts.subject, html });
}
