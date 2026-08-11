# 4regn / CatalogStore Platform Handoff

Written as a durable reference so context survives a switch to a different
AI tool (Codex or otherwise). Everything here reflects the real state of
the code on branch `claude/new-catalogstore-template-YRdMZ` as of this
writing — file paths are exact, not approximate.

**Golden rule for whoever works on this next:** this is a multi-tenant
platform — 4regn and UNIK Labs (and others) share the same codebase and
database. A change meant for 4regn can accidentally affect UNIK Labs if
it touches a shared file/table without checking `seller_id`/`slug`
scoping first. When in doubt, grep for how the existing code already
scopes something before adding new logic.

---

## 1. Payments — how it all works

Every payment method is optional per seller, controlled by
`sellers.checkout_config` (a jsonb column). Two categories:

**Self-serve (seller can toggle from the dashboard, `app/dashboard/page.tsx`, "Checkout" tab):**
- `eft_enabled` + `eft_bank_name`/`eft_account_number`/etc. — manual EFT, no gateway.
- `payfast_enabled` + `payfast_merchant_id`/`payfast_merchant_key` — PayFast, one merchant account per seller.

**NOT self-serve — only ever set directly via SQL, because the underlying account is shared/global, not per-seller:**
- `yoco_enabled` — shared Yoco business account (env: `YOCO_SECRET_KEY`, `YOCO_WEBHOOK_SECRET`). Code: `lib/yoco.ts`.
- `stitch_enabled` — Stitch Express, one platform-wide client (env: `STITCH_CLIENT_ID`, `STITCH_CLIENT_SECRET`, `STITCH_WEBHOOK_SECRET`). Code: `lib/stitch.ts`. **Live and working today via Payment Links** (a plain one-time card charge) — see §2 for why it's NOT using Card Consent yet.
- `setla_enabled` — SETLA is an in-house BNPL/Laybuy credit facility, shared across every participating seller (not a per-seller account). See §2.

### Generic storefront checkout flow (4regn, and any non-UNIK seller)

1. Customer builds cart in `app/store/[slug]/FourRegnStore.tsx`, goes to `app/store/[slug]/checkout/CheckoutPageClient.tsx`.
2. On submit, `CheckoutPageClient.tsx` calls **`POST /api/checkout/place-order`** — this is the one source of truth for pricing: re-fetches every product price server-side (never trusts the client), computes shipping, discount codes, automatic BXGY discounts (§ below), creates the `orders` row at `payment_status: "pending"` (or `"awaiting_payment"` for EFT).
3. Then, depending on the chosen `paymentMethod`, one of these fires:
   - **EFT** → nothing further, order just sits `awaiting_payment` until the seller manually confirms.
   - **PayFast** → `POST /api/payfast-redirect`.
   - **Yoco** → `POST /api/checkout/yoco-redirect` → `createYocoCheckout()` → customer redirected to Yoco's hosted page → **`POST /api/unik/checkout/webhook`** confirms payment (yes, that path name is historical/UNIK-named but it's genuinely generic now, scoped by `order.seller_id`).
   - **Stitch** → `POST /api/checkout/stitch-redirect` → `createStitchPaymentLink()` (`lib/stitch.ts`) → customer redirected to Stitch's hosted page → **`POST /api/checkout/stitch-webhook`** confirms payment (matches on `orders.stitch_link_id`).
   - **SETLA** → see §2, its own separate flow.

### Order confirmation UX

The checkout page polls `orders` directly (Supabase client-side, RLS is
disabled platform-wide — see §9) once it lands on `?paid=<orderId>`, and
shows a "Payment Successful" screen once `payment_status === "paid"`.
This is generic across every gateway — no gateway-specific UI branching
needed there.

### Where each gateway's webhook lives, one more time for clarity

| Gateway | Redirect-start route | Webhook route | Matches order via |
|---|---|---|---|
| Yoco | `app/api/checkout/yoco-redirect/route.ts` | `app/api/unik/checkout/webhook/route.ts` | `orders.yoco_checkout_id` |
| Stitch (Payment Links) | `app/api/checkout/stitch-redirect/route.ts` | `app/api/checkout/stitch-webhook/route.ts` (type `"LINK"`) | `orders.stitch_link_id` |
| Stitch (Card Consent, SETLA only) | `app/api/checkout/setla-create/route.ts` / `app/api/setla/checkout/create/route.ts` | `app/api/checkout/stitch-webhook/route.ts` (type `"CONSENT"`) | `orders.stitch_consent_id` |

`markUnikOrderPaid` (`lib/unik-orders.ts`) is the shared "mark this order
paid" function every webhook calls into — idempotent, sends seller +
customer emails, takes a `provider` param (`"yoco"` default, or
`"stitch"`) so it writes the right provider-specific columns.

---

## 2. SETLA + the Card Consent situation (read this before touching it)

SETLA is the in-house BNPL: **Pay Later** (fixed instalment schedule,
credit-checked) and **Laybuy** (flexible deposit + pay-anytime, no credit
check). Both plan types share one credit facility across every
participating seller — `setla_customers.available_limit` is not
per-seller.

**Current live state:** SETLA's first instalment/deposit is charged via
**Yoco** (a plain one-time checkout), exactly like it always has been.
Every instalment after that requires the customer to manually click "pay
this instalment" from their SETLA dashboard (`public/setla/dashboard.html`),
which also charges via Yoco.

**What's built but turned OFF:** Stitch Card Consent — save the
customer's card on the first charge, then auto-charge instalments #2+ on
schedule with zero customer action. The code for this fully exists:

- `lib/stitch.ts`'s `createStitchCardConsent`/`getStitchCardConsent`/`initiateStitchConsentPayment`.
- `app/api/checkout/setla-create/route.ts` and `app/api/setla/checkout/create/route.ts` — the Pay Later branch would use Stitch instead of Yoco for instalment #1.
- `app/api/checkout/stitch-webhook/route.ts`'s `type: "CONSENT"` branch confirms that first charge.
- `app/api/cron/setla-collect-instalments/route.ts` — a daily Vercel cron that would auto-charge instalments #2+ via `initiateStitchConsentPayment`, giving up after 3 failed attempts per instalment (`stitch_auto_retry_count`) and falling back to the existing manual-pay button.
- `supabase/migrations/20260811_setla_stitch_consent.sql` — the schema for all of this already exists (run or not, check your migration history).

**Why it's off:** `POST /card-consents` on Stitch's real API rejects with
`"Card Consent is not enabled for your client"` even though
`scripts/check-stitch-access.ts` shows the `client_recurringpaymentconsentrequest`
scope as **token-granted**. Those are two separate gates on Stitch's
side — the token endpoint will happily mint a token claiming that scope,
but the actual `/card-consents` endpoint does its own separate approval
check that's still failing. This was a real production outage the first
time it shipped unconditionally (every SETLA Pay Later checkout broke) —
now it's gated behind an env var that defaults OFF:

```
STITCH_CARD_CONSENT_ENABLED=true   ← do NOT set this until Stitch support confirms
```

**To turn it back on:** get Stitch support (express-support@stitch.money)
to explicitly confirm `POST /card-consents` works for your **live**
client (not just that the token scope shows granted — ask them to
confirm the endpoint itself). Test it directly with a real
`POST https://express.stitch.money/api/v1/card-consents` call using a
fresh token before flipping the env var, don't trust the token-scope
check alone again. Once confirmed, set `STITCH_CARD_CONSENT_ENABLED=true`
in Vercel and redeploy.

### How SETLA is managed / how you make updates

- **Customer-facing pages**: static HTML+JS, not React — `public/setla/*.html` + `public/setla/setla.js`. This is one shared codebase serving BOTH UNIK Labs' and 4regn's SETLA customers (`kind: 'generic-product'` in the localStorage handoff object is the discriminator between the two — see that file's own comments, extensive and accurate).
- **Admin dashboard** (SETLA's own internal team, reviewing applications, adjusting limits): `app/setla-admin/*`, backed by `lib/setla-admin.ts` auth.
- **Core business logic**: `lib/setla-instalments.ts` — schedule building, marking instalments paid/failed, the "activate plan only once payment actually confirms" pattern (deliberately NOT before, to avoid claiming credit for a payment that never went through).
- **Database**: `setla_customers`, `setla_applications`, `setla_orders`, `setla_payment_plans`, `setla_instalments` (Pay Later), `setla_laybuy_payments` (Laybuy's own flexible ledger).

---

## 3. Custom storefront sections — how they work

4regn runs on its own dedicated template component,
**`app/store/[slug]/FourRegnStore.tsx`** (large — several thousand
lines, one file, all sections). It's selected via `sellers.template ===
"4regn"`.

- **Section visibility/content**: `sellers.store_config` (jsonb) — read via `effectiveStoreConfig()` in `lib/template-config.ts`. Things like `show_banner_text`, `hero_title`, `marquee_texts`, `trust_items`, policy text, etc. all live here.
- **The visual dashboard editor**: `app/dashboard/editor/page.tsx` — this is what actually writes to `store_config`/`template_configs` when the seller drags/types changes. It renders `FourRegnStore.tsx` inside an iframe in "edit mode" (`isEditMode`) for a live preview.
- **4regn-specific sections built this way**: Shop by Gender, Winter Sale Marquee (`WinterSaleMarquee` function inside `FourRegnStore.tsx`, config keys `winter_marquee_hoodie_slides`/`winter_marquee_tee_slides`), promo badges, anniversary hero pill.
- **Adding a brand-new section**: add a config key to `store_config`, read it in `FourRegnStore.tsx` with a sensible default, add the editor UI for it in `app/dashboard/editor/page.tsx`. Follow the existing Winter Sale Marquee section as the template — it's the most recently built, most thoroughly commented example of "config-driven section + editor curation UI."

---

## 4. Sales popup (recent-purchase notification widget)

- **Component**: `app/store/[slug]/FourRegnSalesPopup.tsx` — a faithful port of the original Shopify `regn-sales-popup.liquid` theme section, including the fake-identity data tables (confirmed explicitly with the seller to replicate exactly, including fabricated names — this was a deliberate, seller-approved decision, flagged for the legal/ethical implications at the time).
- **Data source**: `app/api/store/[slug]/sales-popup/route.ts` — public GET, mixes real recent paid orders with the fake-identity fallback data.
- **Where it's rendered**: `FourRegnStore.tsx`, dynamically imported, shown on home/collection views only, never in edit mode.
- **To edit**: change copy/timing/data tables directly in `FourRegnSalesPopup.tsx`. `localStorage` keys `regn_popup_seen_v2`/`regn_popup_off` control dismiss/frequency — same key names as the original Liquid, kept intentionally for continuity if a customer's browser already has them set from the old Shopify site.

---

## 5. Footer payment method logos

`FourRegnStore.tsx`, search for `fr-pay-icon` — a row of `next/image`
components pointing at static files in **`public/checkout/`** (`visa.png`,
`mastercard.png`, `applepay.png`, etc.). To add a new one: drop the PNG
in `public/checkout/`, add another `<span className="fr-pay-icon">`
block with the real intrinsic width/height (next/image requires this —
check the PNG's actual header dimensions, don't guess, a wrong aspect
ratio will look distorted).

---

## 6. Still open / not yet built

- **Order summary/tracking page** — 4regn has a generic order-tracking
  stage set (not UNIK's production-specific stages), but this hasn't had
  a dedicated deep pass recently. Check `app/store/[slug]/account`
  (customer-facing order history) and the SETLA dashboard's own order
  card rendering — worth a fresh look before assuming it's complete.
- **SMS notifications** — not built at all. No SMS provider is wired into
  this codebase anywhere. Would need: pick a provider (Twilio, Clickatell,
  BulkSMS are the common South African-friendly options), get an API key,
  add a `sendSms()` helper mirroring `lib/email.ts`'s `sendEmail()`
  pattern, then decide which events trigger one (order confirmed?
  instalment reminder?).
- **4regn's own Resend account (`info@4regn.com` sender)** — see §7.
- **Float payment integration** — I have no context on this. Nothing in
  this codebase currently mentions "Float" as a payment provider. Before
  any work can start here, I need: their API docs (same as how Stitch's
  onboarding worked — upload the actual docs, don't rely on training
  data guesses about their API), test/live credentials, and confirmation
  of what specifically Float is used for on the Shopify side (a card
  gateway? a BNPL product? something else?).

---

## 7. Email — current state and what's needed for 4regn's own sender

**Current state**: all order-confirmation emails (for every seller,
including 4regn) go out from ONE shared platform default —
`RESEND_API_KEY` + `RESEND_FROM_EMAIL` (falls back to `"CatalogStore
<orders@catalogstore.co.za>"`), sent via `lib/email.ts`'s `sendEmail()`.
The main call site for order confirmations is `app/api/notify-order/route.ts`
(EFT/manual-confirm path) and `lib/unik-orders.ts`'s `markUnikOrderPaid`
(gateway-confirmed paid path) — both currently use that same shared
default, un-branded per seller beyond the store name in the email body.

**Precedent for a per-seller sender already exists**: SETLA's own emails
use a *different* Resend account entirely (`setla@uniklabs.co.za`, its
own verified domain) — `sendEmail()` already supports this via an
optional `apiKey` override parameter (see `lib/email.ts`'s own comment:
"Resend only lets you send from a domain verified on that specific
account/key").

**What you need to do**: sign up for a Resend account, verify
`4regn.com` (or whichever domain `info@4regn.com` is on) as a sending
domain there, get that account's API key. Once you have it, the code
change is small: add a 4regn-specific env var (e.g. `RESEND_API_KEY_4REGN`),
and update the notify-order/markUnikOrderPaid call sites to pass
`apiKey: process.env.RESEND_API_KEY_4REGN` + `from: "4regn <info@4regn.com>"`
when `seller.subdomain === "4regn"` (or better, store it on
`checkout_config` so it's not hardcoded to one seller). This is the exact
same pattern SETLA's own emails already use — not new architecture, just
wiring a second credential pair the same way.

---

## 8. Updating checkout page look / payment method UI

- **Layout/styling**: `app/store/[slug]/checkout/CheckoutPageClient.tsx` — inline styles throughout (no CSS framework), a `T` theme object near the top drives colors/fonts per template.
- **Adding/changing a payment method's radio row**: find the existing block for e.g. Yoco (`cc.yoco_enabled &&` ... a `<div>` with the radio circle, label, and payment-icon badges) and copy its exact shape for a new method — every existing method (EFT/PayFast/Yoco/Stitch/SETLA) follows the identical visual pattern, so consistency is just copy-paste-adjust.
- **Submit-handler branches**: same file, one `if (paymentMethod === "x" && cc.x_enabled) {...}` block per gateway, right after the `place-order` call succeeds.

---

## 9. A few platform-wide facts worth knowing before you touch anything

- **RLS (Row Level Security) is disabled platform-wide** on every
  seller-owned table (products, orders, discount_codes, etc.) — access
  control is entirely at the application layer (server routes check
  `seller_id` match explicitly; the dashboard's browser-side Supabase
  calls trust the logged-in session). See
  `supabase/migrations/20260716_velour_disable_rls.sql`'s own comment.
  New tables need `disable row level security` explicitly, or Supabase's
  auto-enabled-RLS-with-no-policies default silently blocks everything.
- **Migrations are never run automatically.** Every `.sql` file in
  `supabase/migrations/` is written by whoever's coding, and must be
  manually pasted into Supabase's SQL Editor and run by a human. Check
  which migrations have actually been run before assuming a column/table
  exists — `git log` on that folder doesn't tell you what's actually live
  in the database.
- **Vercel deployments**: code changes need an actual redeploy to take
  effect — editing an env var in Vercel's dashboard does NOT retroactively
  affect an already-running deployment, only the next one.
- **A real incident already happened once this project**: two different
  AI coding sessions deployed to the same Vercel project simultaneously
  and production served the wrong branch. If more than one tool/session
  is working on this repo at once, make sure only one branch is actually
  wired to Vercel's production deployment at a time.
- **Automatic discounts** (Buy X Get Y, matching Shopify's real automatic
  discount behavior) is a newly-built feature — `lib/automatic-discounts.ts`
  is the one pricing function both the cart preview
  (`FourRegnStore.tsx`) and the real charge (`place-order/route.ts`) call,
  so they can never disagree. `scripts/import-4regn-bxgy-discounts.ts`
  pulls the real rules from Shopify's Admin API if you ever need to
  re-sync after a Shopify-side change.
- **Discount codes** (customer types a code) are a separate, older,
  already-working system — `discount_codes` table, applied in
  `place-order/route.ts`, managed from the dashboard's Discounts page.

---

## 10. Shopify Liquid theme import — how it's actually been done

There's no automated "Liquid → React" converter — every section ported
so far (`regn-sales-popup.liquid`, `4regn-winter-sale-landing.liquid`)
was done by:

1. Reading the real `.liquid` file directly (upload the theme export, or
   the specific section file).
2. Understanding what it actually renders/does — Liquid's `{% %}`/`{{ }}`
   syntax and Shopify's object model (`product`, `collection`, `cart`,
   etc.) don't map 1:1 to anything here; the underlying *behavior* gets
   rebuilt as a React component reading from this platform's own data
   shape (Supabase `products`/`orders` rows, not Shopify's Liquid
   objects).
3. Deciding what becomes seller-configurable (a `store_config` key +
   editor UI) versus what's hardcoded to match the original exactly.

If you have the full theme export and want something specific ported,
the fastest path is: identify the exact `.liquid` file(s) for that
section, upload them directly, and describe what behavior needs to
survive vs. what can change. A whole-theme "port everything" pass isn't
realistic in one sitting — file-by-file, prioritized by what's actually
customer-visible and different from what already exists here, is how
every prior port actually happened.
