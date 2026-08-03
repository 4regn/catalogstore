// Minimal Resend wrapper, extracted from app/api/notify-order/route.ts so
// other notification flows (bookings, chat) don't re-implement the same
// fetch-to-Resend call. Silently no-ops if RESEND_API_KEY isn't configured,
// matching the existing order-email behavior -- but logs when it does, so
// a missing key or a rejected send is diagnosable instead of a silent
// no-op that looks identical to "sent successfully" from the caller's side.
//
// apiKey is an optional override: Resend only lets you send from a domain
// verified on that specific account/key, so a sender address on a
// different verified domain (e.g. SETLA's own setla@uniklabs.co.za, on its
// own separate free Resend account) needs its own key here -- passing one
// doesn't touch the default RESEND_API_KEY/orders@catalogstore.co.za path
// every other caller still uses.
export async function sendEmail({ to, from, subject, html, apiKey }: { to: string; from?: string; subject: string; html: string; apiKey?: string }): Promise<void> {
  const resendKey = apiKey || process.env.RESEND_API_KEY;
  if (!to) return;
  if (!resendKey) {
    console.warn("sendEmail: RESEND_API_KEY is not set -- email not sent", { to, subject });
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: from || process.env.RESEND_FROM_EMAIL || "CatalogStore <orders@catalogstore.co.za>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("sendEmail: Resend rejected the request", { to, subject, status: res.status, body });
    }
  } catch (err) {
    console.error("sendEmail failed:", err);
  }
}
