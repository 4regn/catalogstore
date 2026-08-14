// Minimal SMSPortal (smsportal.com, the SA gateway already in use for the
// seller's other messaging) REST API wrapper. Mirrors lib/email.ts's own
// shape (silently no-ops with a console.warn if creds aren't configured,
// so a missing env var degrades to "nothing sent" rather than a hard
// crash) so both channels behave the same way from a caller's side.
//
// Auth: SMSPortal's REST API accepts a Client ID + API Secret directly via
// HTTP Basic Auth on every request (Base64 of "ClientID:APISecret") -- no
// separate token-fetch/cache step needed, which matters here specifically
// because a cached token living on a shared module-level variable is
// exactly the class of bug lib/supabase-admin.ts's createDisposableAdmin
// was built to avoid (see that file's own comment) for a warm serverless
// instance reused across unrelated requests. Basic Auth per-request has no
// such shared state to poison.
const SMSPORTAL_BASE_URL = "https://rest.smsportal.com/v1";

function smsPortalAuthHeader(): string | null {
  const clientId = process.env.SMSPORTAL_CLIENT_ID;
  const apiSecret = process.env.SMSPORTAL_API_SECRET;
  if (!clientId || !apiSecret) return null;
  return "Basic " + Buffer.from(`${clientId}:${apiSecret}`).toString("base64");
}

// SMSPortal's Destination field wants international format with no
// leading "+" (e.g. "27821234567") -- every phone number stored in this
// schema is validated at entry as SA-only (/^(\+27|0)[6-8][0-9]{8}$/, see
// e.g. app/api/setla/auth/signup/route.ts), so this only ever needs to
// handle those two shapes, not general international numbers.
export function toSmsPortalDestination(phone: string): string | null {
  const trimmed = phone.trim();
  if (/^\+27[6-8][0-9]{8}$/.test(trimmed)) return trimmed.slice(1);
  if (/^0[6-8][0-9]{8}$/.test(trimmed)) return "27" + trimmed.slice(1);
  return null;
}

export async function sendSms({ to, message }: { to: string; message: string }): Promise<void> {
  const auth = smsPortalAuthHeader();
  if (!to) return;
  if (!auth) {
    console.warn("sendSms: SMSPORTAL_CLIENT_ID/SMSPORTAL_API_SECRET not set -- SMS not sent", { to });
    return;
  }
  const destination = toSmsPortalDestination(to);
  if (!destination) {
    console.error("sendSms: phone number isn't a recognised SA format, not sending", { to });
    return;
  }
  try {
    const res = await fetch(`${SMSPORTAL_BASE_URL}/bulkmessages`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ Messages: [{ content: message, destination }] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("sendSms: SMSPortal rejected the request", { to, status: res.status, body });
    }
  } catch (err) {
    console.error("sendSms failed:", err);
  }
}
