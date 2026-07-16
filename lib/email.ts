// Minimal Resend wrapper, extracted from app/api/notify-order/route.ts so
// other notification flows (bookings, chat) don't re-implement the same
// fetch-to-Resend call. Silently no-ops if RESEND_API_KEY isn't configured,
// matching the existing order-email behavior.
export async function sendEmail({ to, from, subject, html }: { to: string; from?: string; subject: string; html: string }): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: from || process.env.RESEND_FROM_EMAIL || "CatalogStore <orders@catalogstore.co.za>",
        to: [to],
        subject,
        html,
      }),
    });
  } catch (err) {
    console.error("sendEmail failed:", err);
  }
}
