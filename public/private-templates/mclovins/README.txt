McLOVIN'S APPLE TRADER — concept storefront
===========================================

Served at /private-templates/mclovins/index.html, /private-templates/mclovins/product.html
and /private-templates/mclovins/collection.html

WHAT THIS IS
------------
Three self-contained pages, no build step, no framework — open any file directly or
serve the folder statically. All imagery lives in ./assets as real files (an earlier
version inlined every photo as base64, which put a single page at 2.5 MB). Total
assets/ is now ~4 MB, almost all of it the 31-file product catalogue (see PAGES);
every image loads lazily below the fold.

  index.html       the storefront landing page
  product.html     the iPhone 15 Pro product page (see PAGES below)
  collection.html  the full iPhone Sale 2026 price list, every model (see PAGES below)

All three pages share one design system — tokens, type, buttons, header, footer —
copied verbatim between their <style> blocks. There's no shared stylesheet on purpose
(no build step to resolve one), so a token or component change made in one file needs
to be repeated in the other two to stay in sync.

ART DIRECTION
-------------
Ink-on-white editorial catalogue. Near-black plates (hero, ledger, signal, footer)
alternate with pure-white sections, ruled with 1px hairlines instead of cards
and drop shadows. Corners are square by default; only buttons are pills.

  Type    Bricolage Grotesque  display headlines (upright; emphasis is a weight
                               jump to 800, never italic)
          Inter Tight          UI and body
          JetBrains Mono       section labels, all spec/metadata

  Colour  --ink   #0A0A0B     --bone  #FFFFFF
          --lime  #C6F227     --lav-deep #6E4CFF
          Lime is deliberately rationed — a dot, a hairline, one button, one
          table column. It is never a full-bleed panel. --bone was originally a
          warm off-white (#F2F0EA); it's pure white now, sitewide, including the
          sticky header's translucent tint once it's stuck (that was hardcoded to
          the old value and needed its own fix to stay in sync).

Section kickers (the small mono line that used to sit above each heading — "The
standard", "The index") are gone entirely now, sitewide. An earlier draft numbered
them 01–08, then de-numbered them to plain labels; both were decorative, not real
sequence information, so the whole kicker line was dropped. The one place numbering
IS kept is product.html's grading tiers (S / A / B), because that order is a real,
meaningful hierarchy.

Two full homepage sections were later cut outright, not just their kickers: "The
Standard" (the "what we never skip" trust grid) and "The Index" (the six-row
shop-by-generation list with the cursor-follow hover image). Early-stage call —
the business needs to sell, and both sections were reasoned to cost more screen
space than they earned this early. Their CSS and the index-list's cursor-follow
JS were removed with them, not just hidden, so there's no dead weight sitting
behind the scenes. Nothing in the codebase references their old anchors (#standard,
#index) any more — nav, footers and cross-page links on all three pages were swept
for both (collection.html's own header nav still had live "The Index" / "The
Standard" links pointing at those removed anchors until this pass caught it —
index.html and product.html had already been fixed).

LOGO
----
The header/footer mark is no longer a hand-built SVG — it's the seller's actual
approved logo artwork, supplied as two horizontal lockups (icon + "McLovin's /
APPLE TRADER" wordmark, baked into one image each):

  assets/logo-white.png   full-colour-on-transparent, white ink — for dark grounds
  assets/logo-black.png   same lockup, black ink — for white/light grounds

Every header (index.html, product.html, collection.html) renders both as stacked
<img> elements inside .brand and swaps which one shows with CSS, keyed off the
same header.stuck class that already flips the header from ink to bone on scroll:

  .brand .logo-img.dark{display:none}
  header.stuck .brand .logo-img.light{display:none}
  header.stuck .brand .logo-img.dark{display:block}

No JS involved — it's the same mechanism the header already used for its
ink/bone colour flip, just applied to which logo image is visible. Footers sit on
a permanently dark background, so they only ever use logo-white.png, no swap.

The old inline <symbol id="mcl-mark">, the CSS-built "McLovin's" wordmark text,
and the sparkle icon are gone from all three pages — dead code removed with them,
not hidden. assets/brand/mclovins-mark.svg (the earlier hand-built mark) is still
in the repo but nothing references it now; keep it only if you still want a
standalone vector for decks/socials/print.

assets/brand/favicon-mark.png is new too — the icon half of logo-black.png,
cropped tight and re-padded into a square, since the brief was explicit about
reusing the approved artwork rather than re-tracing it into a new SVG. It
replaces the old hand-drawn assets/brand/favicon.svg as the <link rel="icon">
target on all three pages (only index.html had a favicon link before this pass —
product.html and collection.html now carry one too, for consistency).

PAGES
-----
product.html is a single worked example — iPhone 15 Pro — not a template engine;
there's no product ID or routing, so a second real listing means copying the file
and editing it by hand. It links back into index.html by anchor (#selected,
#ledger) and index.html links into it from two places: the hero's floating spec
card ("On the floor") and the ledger's iPhone 15 Pro column header.

Layout: breadcrumb -> gallery + buy box -> full spec sheet -> grading tiers
(Sealed / Grade A / Grade B) -> a compare panel scoped to the two neighbouring
models -> three related Pro-line cards -> footer.

The condition pills, storage pills and colour swatches in the buy box are live UI
state. Condition and storage now also drive a real price lookup (see PRICING below):
switching between them updates the battery-health meter, the description text, the
matching grading-tier card, AND the price (now the biggest thing in the buy box —
a bare "PRICE" mono label over a big display-weight figure, not the small mono
line it used to be) and both CTA buttons' hrefs. Colour is cosmetic only — the
price list doesn't break prices out by colour, so it just relabels the config in
the WhatsApp message text.

The buy box has no "ask for price" link any more, and its two buttons are labelled
Add to cart / Buy now, not Enquire / Chat on WhatsApp. Nothing behind them changed
though: both are still wa.me links, not a real cart or checkout — there is no
payment flow, this is a WhatsApp-commerce pattern (extremely common for solo
sellers in this market), not an actual e-commerce backend. The labels changed
because the seller works during the day and can't chat live; a visitor tapping
"Buy now" gets a pre-filled "I want to buy this now, how do I pay?" message
instead of an open-ended enquiry, which reads as a completed action on the
visitor's side even though a human still has to close the loop on WhatsApp. Don't
mistake the relabelling for a real cart existing — it doesn't, and calling it
"Add to cart" without that caveat somewhere visible (this file, if nowhere else)
would be misleading. Every "Enquire" button elsewhere on the site (index.html's
Selected cards, product.html's related-product cards) was renamed to "Add to
cart" the same way, for the same reason, even though only the buy box was named
explicitly — the goal (sell without a live human on the other end) applies
everywhere a product is shown, not just the one page.

The four gallery images are the seller's own real iPhone 15 Pro photo
(assets/products/iphone-15-pro.jpg — front and back together, correct colour) plus
three crops of that same file (pdp-15pro-front/back/camera.jpg) standing in for a
full product shoot's worth of angles. Every model referenced anywhere on the site
now uses its correct, seller-supplied photo from assets/products/ — no more
off-model or mismatched-colour stand-ins.

collection.html is the full "iPhone Sale 2026" price list — every model the seller
sent, X through 17 Pro Max, ~90 individual storage/condition price points across
8 era sections (jump nav at the top), each row carrying its own real product
thumbnail from assets/products/. It was generated, not hand-typed: pricedata.py
holds the source data (RAW, a flat list of model/storage/sealed/price tuples, and
ERAS, the 8 series groupings) that a one-off script templated into the HTML. That
script itself wasn't kept — pricedata.py is — so the fastest way to add or correct
a price is to edit pricedata.py and re-run the same kind of generation (era section
loop -> one row per model, thumbnail path lowercase-and-hyphenate the model name
into assets/products/<slug>.jpg -> one chip per price point, each chip's href a
wa.me link built from the model/storage/condition/price). Editing collection.html
directly works too, but the chip's visible text and its wa.me "text=" param both
encode the price, so a manual edit has to update both or the WhatsApp message will
misquote what the chip shows. Every price on the page is its own tappable chip —
clicking one opens WhatsApp with that exact model, storage, condition and price
pre-filled. A circular "ask" button on each row covers anything not on the chart
(a colour, a condition, a config).

PRICING
-------
Prices site-wide come from one real price list the seller sent (an "iPhone Sale 2026"
promo, "until further notice") — everything else about the products (colours offered,
exact storage tiers) is still illustrative. Two things to know about the source data:

* It only ever distinguishes sealed vs not-sealed, never a cosmetic A/B split. So
  every "From RX" figure on index.html and on product.html's related/compare cards
  is the lowest price in the list for that model, not tied to a specific grade.
  product.html's buy box is the one place price is genuinely config-aware: its
  PRICES table (in the script, search "real pricing + WhatsApp") is keyed by
  storage x condition, sourced from the two iPhone 15 Pro lines in the list
  (128GB and 256GB, both sealed only). Pick 512GB, 1TB, or either certified grade
  and the price row correctly falls back to "Contact for price" — there is no real
  number for that combination, so none is shown.
* The full list (iPhone X through 17 Pro Max, ~90 price points) lives on
  collection.html — see PAGES above. index.html and product.html only wire in the
  handful of SKUs they already reference (13, 14, 14 Pro, 15 Pro, 15 Pro Max, 16,
  16 Pro, 11, the Pro Range card); they intentionally stay curated rather than
  trying to surface the whole catalogue inline.

Every "Add to cart" / "Buy now" / price-chip / "ask" control site-wide is a real
link to https://wa.me/27748171165 (the seller's real contact number) with a
pre-filled message describing what was clicked — not a mailto or a form, an actual
WhatsApp deep link, and not a real cart or checkout despite the button labels (see
PAGES above). There is no CMS or inventory system behind any of this: updating a
price means editing the PRICES table (product.html), the relevant card's markup
(index.html), or the relevant chip (collection.html) by hand.

PLACEHOLDER CONTENT — REPLACE BEFORE LAUNCH
-------------------------------------------
* Everything about the listings other than price is still illustrative: exact
  colourways offered, which grades are actually in stock, storage beyond what's
  priced. Confirm real availability before launch.
* Trust copy still on the site (the 40-point check and 90-day warranty on
  product.html) describes intended policy, not verified operating practice.
  Confirm before publishing. index.html used to carry a trust-grid section
  ("What we never skip": Inspected, Documented, Traded fairly, Answered) making
  four such claims; it's gone now (see ART DIRECTION), and two of its four claims
  — trade-ins and 24/7 support — were already cut before that, since neither was
  confirmed and this business doesn't do trade-ins at all (see below).
* This is a sell-only business — it does not take trade-ins. Every mention of
  trading in a device (the hero headline, "Trade-ins welcome" in the ticker, a
  "trade-in windows" phrase in the Signal section, "buy and trade Apple devices"
  in the footer tagline) has been removed. "McLovin's Apple Trader" and the
  "APPLE TRADER" sub-brand line stay — that's the shop's actual name, not a claim
  about trading in devices, and isn't affected by this. The hero headline is now
  "Apple, properly checked." (was "Apple, properly traded.") for the same reason.
* The comparison tables use publicly documented Apple specifications for
  iPhone SE/12/13/14/15/15 Pro/15 Pro Max.
* Product-card images (index.html's Selected cards, product.html's related-product
  cards — same shared .prod-media CSS in both files) used to crop the top and
  bottom off every phone: the card had a fixed height while the real photos are
  4:5, so object-fit:cover cut into them. Fixed by giving the card an aspect-ratio
  of 4:5 (matching the photos exactly) and switching to object-fit:contain, so the
  full device shows with no cropping and no letterboxing, on a white background
  that reads as continuous with the photo's own white studio background.
* Per-model product photography (assets/products/, 31 files, one JPEG per iPhone
  X through 17 Pro Max — front and back on white, correct colour) came from the
  seller and is used across all three pages: product.html's gallery and related
  cards, index.html's Selected cards and generation-index hover images, and every
  thumbnail on collection.html. Converted from PNG to JPEG on the way in (same
  visual quality, ~39 MB down to ~4 MB) — nothing else was altered.
* The remaining editorial/lifestyle photography (the "In the wild" lookbook plates,
  the camera macro in "The edit") came with the original concept file and is not
  McLovin's own. Third-party watermarks and competitor branding ("Photographer by
  Huamu", "www.pixelstudio.fr", a Nudient case ad) have been cropped out of the
  JPEGs, but these images are still unlicensed for commercial use. Replace them
  with your own shoot before this goes live — the per-model catalogue shots don't
  need this, only the mood/lifestyle imagery. The hero background (three floating
  iPhones on a purple gradient, assets/hero/) is separate — it was supplied
  directly by the seller as the approved hero creative, alongside the logo files,
  so it's treated here as cleared for use; confirm that's actually the case
  (in-house render vs. stock/Apple marketing asset) before launch if you're not
  certain where it originated.
* The only remaining data-toast placeholder on any of the three pages is the mobile
  burger menu (no drawer built yet). Every other button that used to be a placeholder
  is now a real wa.me link (see PRICING) or a real in-page/cross-page anchor. The
  signal form on index.html still does not submit anywhere — wire it to your list.

INTERACTION
-----------
index.html:
* Hero: rebuilt to be a pixel-exact match of the reference file the seller supplied
  (mclovins_hero_pixel_matched_v2.html), not a re-skin of it — same full-bleed photo
  (assets/hero/hero-desktop.jpg, assets/hero/hero-mobile.jpg, swapped via a
  <picture>/<source> breakpoint, no JS), same aspect-ratio-locked full-viewport
  height, same copy verbatim ("iPhone for every version of you." / "Find the
  iPhone that fits how you live, create and connect — from everyday essentials to
  the latest Pro models." / "Explore iPhones" CTA with an arrow-line SVG, not the
  text glyph used elsewhere on the site), same thin (300-weight) system-font
  (-apple-system/SF Pro) typography scoped to just this section — every other
  heading on the site stays Bricolage Grotesque — and the same absolute left/top
  percentage positioning as the source file, not the flex-centred layout used
  before. The old three-slide crossfading rail, its 6.4s auto-advance timer, the
  scrim gradient, and the floating "On the floor / iPhone 15 Pro" spec card are
  gone entirely, since none of them exist in the reference.

  One deliberate deviation: the reference file's hero has its own header baked in
  (logo, an "iPhone / Accessories / New Arrivals / About" nav, and search/account/
  bag icons, all inert placeholders — even in the source file they're href="#"
  with no real destination). That's dropped here in favour of the site's existing
  real header, which already sits in the same place, already overlays the hero
  visually (solid ink at the top blending into the photo's own dark gradient), and
  already links to real sections (Selected/Compare/Price List) instead of pages
  that don't exist on this site. Everything else — the image, the copy, the type,
  the button, the layout math — is reproduced as sent. If the placeholder nav/icon
  row was wanted too, that's a quick follow-up, just flag it.

  Also worth flagging: "iPhone for every version of you." is Apple's own real
  marketing tagline for iphone, not original copy — it's used here verbatim
  because that's what the reference file specified, but a reseller's storefront
  running Apple's own ad copy word-for-word (on top of a hero styled to closely
  resemble Apple's own product page) is worth a second look before this goes
  live, alongside the existing trademark disclaimer already in the footer.

collection.html:
* A jump-nav row of era chips scrolls to each series section (plain anchor links,
  no JS — scroll-margin-top on the section keeps the sticky header from covering
  the target heading).

All three pages:
* Scroll-progress hairline, sticky masthead that flips from ink to bone, staggered
  IntersectionObserver reveals, hairline-ruled model marquee (index.html only).
* product.html's gallery thumbnails swap the main image; the condition/storage/
  colour controls update the buy box and (for condition) the grading tiers below.
* Everything above is disabled under prefers-reduced-motion.

BROWSER NOTES
-------------
Fonts load from Google Fonts. Backdrop-filter is used on the stuck masthead; it
degrades to a solid tint where unsupported.
