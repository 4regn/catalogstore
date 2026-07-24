// Minimal Resend wrapper, extracted from app/api/notify-order/route.ts so
// other notification flows (bookings, chat) don't re-implement the same
// fetch-to-Resend call. Silently no-ops if RESEND_API_KEY isn't configured,
// matching the existing order-email behavior -- but logs when it does, so
// a missing key or a rejected send is diagnosable instead of a silent
// no-op that looks identical to "sent successfully" from the caller's side.
export async function sendEmail({ to, from, subject, html }: { to: string; from?: string; subject: string; html: string }): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!to) return;
  if (!resendKey) {
    console.warn("sendEmail: RESEND_API_KEY is not set -- email not sent", { to, subject });
    return;
  }
  // catalogstore.co.za isn't verified in Resend yet, so any address on that
  // domain gets rejected outright. Until it's verified (resend.com/domains),
  // fall back to Resend's built-in sandbox sender -- which needs no
  // verification -- while keeping whatever display name the caller wanted.
  const requested = from || process.env.RESEND_FROM_EMAIL || "CatalogStore <orders@catalogstore.co.za>";
  const displayName = requested.match(/^(.*)<.*>$/)?.[1]?.trim();
  const sender = displayName ? `${displayName} <onboarding@resend.dev>` : "onboarding@resend.dev";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender,
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
