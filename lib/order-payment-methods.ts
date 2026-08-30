// Deliberately dependency-free (no Supabase/Node/email imports) -- this is
// imported directly by the client-side dashboard page as well as
// server-only code (lib/unik-orders.ts, the abandoned-cart email cron).
// Pulling it in from lib/unik-orders.ts instead broke the dashboard's
// client bundle: that module imports lib/push-notify.ts, which imports
// web-push, which needs Node-only deps (https-proxy-agent) that don't
// exist in a browser bundle -- Next.js failed the build trying to include
// them in dashboard/page.tsx's client component. A plain constant has no
// such transitive baggage.
//
// Gateways with their own real-time payment-confirmation lifecycle -- an
// order on one of these that never actually got paid for was never a real
// sale, so it belongs in the seller dashboard's Abandoned Carts tab (and is
// what the abandoned-cart recovery email cron targets), not the main
// Orders list. EFT is deliberately excluded: its "awaiting_payment" status
// is a normal state the seller manually resolves once they see the bank
// transfer, not an abandoned checkout.
export const UNRESOLVED_GATEWAY_PAYMENT_METHODS = ["payfast", "yoco", "stitch", "float", "setla", "setla_pay_later", "setla_laybuy"];
