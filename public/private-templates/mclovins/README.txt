McLOVIN'S APPLE TRADER — concept storefront
===========================================

Served at /private-templates/mclovins/index.html, /private-templates/mclovins/product.html
and /private-templates/mclovins/collection.html

WHAT THIS IS
------------
Three self-contained pages, no build step, no framework — open any file directly or
serve the folder statically. All imagery lives in ./assets as real files (an earlier
version inlined every photo as base64, which put a single page at 2.5 MB; index.html
is now ~64 KB of HTML plus ~480 KB of images, loaded lazily below the fold).

  index.html       the storefront landing page
  product.html     the iPhone 15 Pro product page (see PAGES below)
  collection.html  the full iPhone Sale 2026 price list, every model (see PAGES below)

All three pages share one design system — tokens, type, buttons, header, footer —
copied verbatim between their <style> blocks. There's no shared stylesheet on purpose
(no build step to resolve one), so a token or component change made in one file needs
to be repeated in the other two to stay in sync.

ART DIRECTION
-------------
Ink-on-bone editorial catalogue. Near-black plates (hero, ledger, signal, footer)
alternate with warm bone paper sections, ruled with 1px hairlines instead of cards
and drop shadows. Corners are square by default; only buttons are pills.

  Type    Bricolage Grotesque  display headlines (upright; emphasis is a weight
                               jump to 800, never italic)
          Inter Tight          UI and body
          JetBrains Mono       section labels, all spec/metadata

  Colour  --ink   #0A0A0B     --bone  #F2F0EA
          --lime  #C6F227     --lav-deep #6E4CFF
          Lime is deliberately rationed — a dot, a hairline, one button, one
          table column. It is never a full-bleed panel.

Section kickers (the small mono line that used to sit above each heading — "The
standard", "The index") are gone entirely now, sitewide. An earlier draft numbered
them 01–08, then de-numbered them to plain labels; both were decorative, not real
sequence information, so the whole kicker line was dropped. The one place numbering
IS kept is product.html's grading tiers (S / A / B), because that order is a real,
meaningful hierarchy.

LOGO
----
The mark is an SVG rebuild of the supplied McLovin's logo: black apple with the
split black/lime leaf, the camera module inset on the left, and the M monogram
carrying the lime -> white -> lavender gradient. It is defined once as an inline
<symbol id="mcl-mark"> in index.html and referenced with <use> in the header and
footer, so it stays crisp at any size and reads on both light and dark grounds.
The wordmark ("McLovin's" + the sparkle + the ruled APPLE TRADER line) is live HTML
text in Inter Tight, not an image, so it scales and recolours with the theme.

  assets/brand/mclovins-mark.svg   standalone copy of the mark (not used by the
                                   page — kept for decks, socials, print)
  assets/brand/favicon.svg         flat single-colour variant, wired as the favicon

To swap in the original raster master instead, drop it at
assets/brand/mclovins-logo.png and replace the <svg class="mark"> element in the
.brand block with:
  <img class="mark" src="assets/brand/mclovins-logo.png" alt="McLovin's Apple Trader">

PAGES
-----
product.html is a single worked example — iPhone 15 Pro — not a template engine;
there's no product ID or routing, so a second real listing means copying the file
and editing it by hand. It links back into index.html by anchor (#index, #selected,
#ledger, #standard) and index.html links into it from two places: the hero's
floating spec card ("On the floor") and the ledger's iPhone 15 Pro column header.

Layout: breadcrumb -> gallery + buy box -> full spec sheet -> grading tiers
(Sealed / Grade A / Grade B) -> a compare panel scoped to the two neighbouring
models -> three related Pro-line cards -> footer.

The condition pills, storage pills and colour swatches in the buy box are live UI
state. Condition and storage now also drive a real price lookup (see PRICING below):
switching between them updates the battery-health meter, the description text, the
matching grading-tier card, AND the price and both WhatsApp CTAs. Colour is cosmetic
only — the price list doesn't break prices out by colour, so it just relabels the
config in the WhatsApp message text.

The four gallery images are one photograph (assets/hero-titanium-pair.jpg) plus
three crops of it (assets/pdp-15pro-crop-*.jpg) standing in for a proper product
shoot — there's only one real titanium-pair photo in the asset set. The three
related-product cards reuse that same crop set for the same reason. Swap in real
per-listing photography before this goes live.

collection.html is the full "iPhone Sale 2026" price list — every model the seller
sent, X through 17 Pro Max, ~90 individual storage/condition price points across
8 era sections (jump nav at the top). It was generated, not hand-typed: pricedata.py
holds the source data (RAW, a flat list of model/storage/sealed/price tuples, and
ERAS, the 8 series groupings) that a one-off script templated into the HTML. That
script itself wasn't kept — pricedata.py is — so the fastest way to add or correct
a price is to edit pricedata.py and re-run the same kind of generation (era section
loop -> one row per model -> one chip per price point, each chip's href a
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

Every "Enquire" / "Chat on WhatsApp" / price-chip / "ask" control site-wide is a real
link to https://wa.me/27748171165 (the seller's real contact number) with a
pre-filled message describing what was clicked — not a mailto or a form, an actual
WhatsApp deep link. There is no CMS or inventory system behind any of this: updating
a price means editing the PRICES table (product.html), the relevant card's markup
(index.html), or the relevant chip (collection.html) by hand.

PLACEHOLDER CONTENT — REPLACE BEFORE LAUNCH
-------------------------------------------
* Everything about the listings other than price is still illustrative: exact
  colourways offered, which grades are actually in stock, storage beyond what's
  priced. Confirm real availability before launch.
* Trust copy (inspection and documentation in index.html's "What we never skip",
  the 40-point check and 90-day warranty on product.html) describes intended
  policy, not verified operating practice. Confirm before publishing. That section
  originally also claimed trade-ins and 24/7 support; both were cut since neither
  is confirmed, rather than left as unverified claims.
* The comparison tables use publicly documented Apple specifications for
  iPhone SE/12/13/14/15/15 Pro/15 Pro Max.
* The photography came with the original concept file and is not McLovin's own.
  Third-party watermarks and competitor branding ("Photographer by Huamu",
  "www.pixelstudio.fr", a Nudient case ad) have been cropped out of the JPEGs, but
  these images are still unlicensed for commercial use. Replace them with your own
  shoot before this goes live.
* The only remaining data-toast placeholder on any of the three pages is the mobile
  burger menu (no drawer built yet). Every other button that used to be a placeholder
  is now a real wa.me link (see PRICING) or a real in-page/cross-page anchor. The
  signal form on index.html still does not submit anywhere — wire it to your list.

INTERACTION
-----------
index.html:
* Hero: three slides, 6.4s crossfade with a slow scale drift; the rail doubles as a
  progress indicator and a manual control.
* The generation index: hovering a row floats its photograph beside the cursor
  (pointer devices at >=1181px only).

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
Fonts load from Google Fonts. Backdrop-filter is used on the stuck masthead and the
hero spec card; it degrades to a solid tint where unsupported.
