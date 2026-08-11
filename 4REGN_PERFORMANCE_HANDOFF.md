# 4regn Performance Handoff (for Codex)

Companion to `4REGN_PLATFORM_HANDOFF.md` — that one covers architecture/
payments/SETLA; this one is purely about page-load speed. All figures
below are pulled directly from real uploaded PageSpeed Insights HTML
reports and real commit history in this repo — nothing here is estimated
or guessed.

---

## 1. Current speed baseline

**Tool used**: Google PageSpeed Insights (Lighthouse), **mobile emulation**
(`device=mobile` in every report), run against the **live production**
4regn storefront (not a Vercel preview). Two directly comparable runs,
same page, taken before and after a specific fix shipped:

| Metric | Before | After |
|---|---|---|
| Performance score | 55 | 58 |
| Best Practices score | 96 | 100 |
| First Contentful Paint | 1.21s | 1.21s (unchanged) |
| Largest Contentful Paint | 10.65s | 10.52s |
| Total Blocking Time | 491ms | 413ms |
| **Speed Index** | **8.28s** | **6.73s** |
| Time to Interactive | 11.58s | 11.24s |

**LCP is still ~10.5s — this is the single biggest number to fix.** That
did not meaningfully move between these two runs; the fix behind the
Speed Index improvement (see §2) didn't target LCP specifically.

A third report exists from the same session showing a much worse
Performance score (45) and FCP (5.6s) — almost certainly a **different
page or a transient bad run**, not a valid before/after comparison point.
Don't treat it as baseline data; if useful, re-run PageSpeed fresh instead
of trying to reconcile it.

**What this means practically**: re-run PageSpeed Insights (or Lighthouse
in Chrome DevTools) against the current live URL before starting any
speed work, on both mobile and desktop, and on at least: homepage, one
collection page, one product page, and checkout. The numbers above are
one homepage snapshot from mobile only — there's no equivalent recorded
data for the other page types or desktop.

---

## 2. Exact performance changes already made

In roughly chronological order, from real commit history (`git log`) —
commit hashes given so you can `git show <hash>` for the full diff.

**`0a59bea` — Fix the root cause of slow storefront pages: stop calling `headers()` on every request.**
This is the most important one. Every storefront route declared
`export const revalidate = 60`, but `isStoreSubdomainRequest()` called
`next/headers`'s `headers()` to read the real Host header — a Next.js
"dynamic API" that forces the *entire* route segment (and everything
nested under it) to render fully dynamically on every request, silently
defeating the 60s cache. Confirmed directly via `x-vercel-cache: MISS` on
every single production homepage load before the fix. Replaced with
`VERCEL_ENV` (set per-deployment, not per-request) for the one real case
that matters (production vs preview/local) — verified no other dynamic-API
call remained at any of the 8 call sites or their transitive imports.
**This is the fix behind the Speed Index improvement in §1.**

**`ce278c1` — Platform-wide page-load speed pass: fonts, code-splitting, fetch narrowing, middleware.**
- Self-hosted Schibsted Grotesk (`globals.css` `@font-face` + `public/fonts/*.woff2`) instead of loading from `fonts.googleapis.com`/`fonts.gstatic.com` — removes two external round-trips before real text can render, on every page.
- Root layout's always-on widgets (affiliate tracking, affiliate banner, support chat) moved to `next/dynamic` + `ssr:false` via a new `RootClientWidgets` wrapper, out of the main hydration path.
- `FourRegnStore`'s PDP image lightbox extracted to its own file (`FourRegnLightbox.tsx`), loaded via `next/dynamic` + `ssr:false` — its JS only downloads once a shopper actually opens the lightbox, not on every page load.
- `middleware.ts` (runs on every single request) got minor hoisting: regex/derived strings moved to module scope instead of recomputed per-request.
- **Explicitly NOT attempted in this pass** (per its own commit message): a few templates' client-side re-fetches still use `select("*")` instead of narrow columns; several route-level pages still load Google Fonts externally the same way the root layout used to. Worth checking if these still apply.

**`949b18f` / task history "narrow product+collection+PDP route fetches for speed"** — 4regn's own storefront routes had their Supabase `select()` calls narrowed to only the columns actually rendered, instead of `select("*")`.

**`099d289`, `b6ab0e1`, `dfbc002` — converted various `<img>` to `next/image`**: footer logo, nav logo (both instances), Winter Essentials carousel, category tiles, 6 footer payment icon PNGs, main product grid images. Each conversion used the file's **real intrinsic width/height** (checked directly against the PNG headers), not guessed values — a wrong aspect ratio distorts on screen.

**`2e008aa` — one `next/image` conversion was reverted.** The category-tile cover image (`config.collection_images`, a seller-editable, uncontrolled-domain field) broke real collections' cover images in production once converted, because `next.config.ts`'s `remotePatterns` only allows `*.supabase.co` — any other-domain image URL silently 400s through `next/image`'s optimizer. **This is the single most important gotcha for any further `next/image` work**: check `next.config.ts`'s `remotePatterns` before converting ANY image field whose URL isn't guaranteed to be Supabase Storage — a seller-uploaded/user-editable field is exactly the risky case.

**`84` (task) — `loading.tsx` added to storefront route segments** — gives Next.js an instant loading UI to show during the (now-cached, thanks to `0a59bea`) data fetch, instead of a blank screen.

**`89` (task) — Fixed an SSR bailout**: `useSearchParams()` for reading edit-mode state was removed across all 7 storefront templates — that hook forces client-side rendering / a Suspense boundary when used carelessly, which can silently disable static optimization for the whole tree it's called in. Same category of bug as `0a59bea`'s `headers()` issue — worth searching for any other dynamic-API/hook usage that might have crept back in since.

**`5fbb4a1` — lazy-loading pass** (platform-wide, predates 4regn's own template but the convention is expected to carry through): `loading="lazy" decoding="async"` on every non-hero `<img>`, `fetchPriority="high" decoding="async"` on hero images specifically so the LCP image doesn't compete with everything else for bandwidth. Worth confirming 4regn's actual hero image currently has `fetchPriority="high"` set — given LCP is still ~10.5s (§1), this may not be applied correctly, or the hero image itself may just be too large a file.

**`56fc077` — Vercel Speed Insights added.** This means there's a **real field-data dashboard already available** in the Vercel project (not just synthetic Lighthouse runs) — check there first for actual visitor-experienced numbers before doing more synthetic testing.

**Nothing found in history that was tried and reverted for causing a bug**, except the `next/image` domain-whitelist regression above (§2, `2e008aa`) — that one's about correctness (broken images), not a performance regression.

---

## 3. Remaining bottlenecks

**LCP (~10.5s) is the headline number still unaddressed.** Nothing in the
commit history specifically targeted the Largest Contentful Paint element
itself (as opposed to overall render-blocking work). Likely candidates,
in order of suspicion, none independently verified against a fresh
trace:
1. **The actual LCP image** (probably the homepage hero) — check its file
   size and whether `next/image` with `fetchPriority="high"` is genuinely
   being applied to it, and what quality/format it's being served at.
2. **Supabase round-trip time** — `FourRegnStore.tsx` does several
   sequential `await` fetches in its load effect (seller → products →
   discount codes → promo badges → automatic BXGY discounts) rather than
   `Promise.all`-ing the independent ones. Worth checking whether this
   serializes real network latency.
3. **`FourRegnStore.tsx` itself is enormous** — several thousand lines,
   one client component handling home/collection/product/search/cart/
   checkout-handoff all in one file. This is a genuine bundle-size
   concern; nothing in the commit history has attempted to split it
   further than the lightbox extraction in `ce278c1`.

**Not independently measured from this session** (say so honestly rather
than guess): Vercel cold-start time, actual Supabase query latency in
production, checkout-flow-specific timing (place-order round trip,
gateway redirect latency). Pull real numbers from Vercel Speed Insights
(§2) and a fresh Network-tab trace before assuming any of these are the
problem.

---

## 4. 4REGN storefront specifics

- **Active template**: confirmed — `app/store/[slug]/FourRegnStore.tsx`, selected via `sellers.template === "4regn"`.
- **Product images**: **Supabase Storage**, bucket `product-images`. Confirmed via `scripts/migrate-4regn.ts` (line ~489): the migration script downloads each image from Shopify's original CDN and re-uploads it into this Supabase bucket, storing the resulting Supabase public URL in `products.image_url` — nothing on the live product pages points at Shopify's CDN anymore.
- **Hero/banner/logo images**: also Supabase Storage, uploaded via the dashboard's seller-upload routes.
- **Static local assets**: `public/checkout/*` (payment method icons — visa/mastercard/yoco/stitch/etc.), `public/fonts/*.woff2` (self-hosted Schibsted Grotesk), `public/setla/*` (SETLA's static pages + its own logo assets). These are served directly by Vercel's edge network, not Supabase.
- **Why this matters for `next/image`**: `next.config.ts`'s `remotePatterns` only whitelists `*.supabase.co` — this is WHY product/hero images can be safely converted to `next/image` (they're all genuinely on Supabase), and exactly why the one collection-tile field that wasn't (§2, seller-editable `collection_images`) broke when converted.
- **Assets that must not be casually replaced**: the payment method icon files in `public/checkout/` are referenced by exact filename directly in `FourRegnStore.tsx` (e.g. `/checkout/stitch.jpg`) — renaming/moving one without updating the reference breaks that icon silently (no build error, just a 404 image). Same for `public/fonts/*.woff2` (referenced by exact path in `globals.css`'s `@font-face`).

---

## 5. Safe optimization boundaries

**Safe to edit freely for performance:**
- Image handling: `<img>` → `next/image` conversions (check `next.config.ts` remotePatterns first per §2's warning), lazy-loading attributes, compressing/resizing files already in `public/`.
- Data fetching: narrowing `select("*")` to specific columns, `Promise.all`-ing independent fetches, adding caching (`revalidate`) to routes that don't have it.
- Code-splitting: `next/dynamic` + `ssr:false` for below-the-fold or interaction-gated components (the lightbox extraction in `ce278c1` is the template to follow).
- `loading.tsx` / route-segment-level UX during fetch.

**Be careful, understand before editing:**
- `middleware.ts` — runs on every single request; a slow or dynamic-API-touching change here has platform-wide latency impact, not just 4regn.
- Anything using `next/headers`'s `headers()`/`cookies()`, or `useSearchParams()` in a component that should be statically rendered — both have already caused real, hard-to-spot production slowdowns (§2). If you add either, verify with `x-vercel-cache` on the deployed response that it's not silently defeating caching again.

**Do NOT touch without explicit direction** (correctness-critical, not performance-related, but easy to accidentally break while "just optimizing a fetch"):
- Any file under `app/api/checkout/`, `app/api/setla/`, `app/api/unik/checkout/`, `lib/yoco.ts`, `lib/stitch.ts`, `lib/setla-instalments.ts`, `lib/unik-orders.ts`, `lib/automatic-discounts.ts` — all real-money payment/credit logic. `lib/automatic-discounts.ts` in particular is explicitly designed so the cart preview and the real server-side charge call the exact same function — "optimizing" one side without the other would let the displayed price and the real charge disagree.
- `CheckoutPageClient.tsx`'s and `FourRegnStore.tsx`'s cart-state management — narrowing a `select()` there needs to preserve every field the checkout submit payload / automatic-discount matching actually reads (e.g. `category`, needed for BXGY discount matching — see `4REGN_PLATFORM_HANDOFF.md` §9).
- `STITCH_CARD_CONSENT_ENABLED` — must stay unset/`false`. See `4REGN_PLATFORM_HANDOFF.md` §2 for why.

**Known fragile pattern, learn from it**: a bug shipped recently where a
data-fetching effect only ran on a code path the real production page
never actually takes (`initialSeller` was always provided server-side,
silently skipping the effect's entire body). Any time you see an
early-`return`-guarded effect, check which branch the *actual* production
render path takes before assuming the code inside it runs at all.

---

## 6. Deployment / source of truth

- **Production branch**: `claude/new-catalogstore-template-YRdMZ`.
- **Latest commit on that branch as of this document**: `36cdc1e2cc9a17c8c4b891b0c98ae92b59753983`.
- **Does Vercel auto-deploy from this branch?** Observed behavior this
  session strongly indicates yes (every push this session has gone live
  after a redeploy) — but I have no direct access to Vercel's dashboard to
  confirm the actual Production Branch setting. **Get a screenshot of
  Vercel's Project Settings → Git → Production Branch before doing
  anything**, not just this doc's word for it.
- **A real incident already happened on this exact project**: two
  different AI coding sessions deployed to the same Vercel project at the
  same time, and production ended up serving the wrong branch — the
  storefront theme visibly changed to the wrong one, and real collection
  images broke. This is documented in `4REGN_PLATFORM_HANDOFF.md` §9.
  **Strong recommendation: Codex should work from its own branch/worktree,
  never push directly to `claude/new-catalogstore-template-YRdMZ` while
  it's the live production branch**, and any Vercel-visible testing should
  go through a preview deployment, not production, until a human
  explicitly merges.
