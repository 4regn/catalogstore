McLOVIN'S APPLE TRADER — concept storefront
===========================================

Served at /private-templates/mclovins/index.html and /private-templates/mclovins/product.html

WHAT THIS IS
------------
Two self-contained pages, no build step, no framework — open either file directly or
serve the folder statically. All imagery lives in ./assets as real files (an earlier
version inlined every photo as base64, which put a single page at 2.5 MB; index.html
is now ~64 KB of HTML plus ~480 KB of images, loaded lazily below the fold).

  index.html    the storefront landing page
  product.html  the iPhone 15 Pro product page (see PAGES below)

Both pages share one design system — tokens, type, buttons, header, footer — copied
verbatim between the two <style> blocks. There's no shared stylesheet on purpose (no
build step to resolve one), so a token or component change made in one file needs to
be repeated in the other to stay in sync.

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

Section kickers (the small mono line above each heading) are plain labels — "The
standard", "The index" — not numbered. An earlier draft numbered them 01–08; that
was decorative, not real sequence information, so it was dropped. The one place
numbering IS kept is product.html's grading tiers (S / A / B), because that order
is a real, meaningful hierarchy.

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
state (click one, the battery-health meter, the description text and the matching
grading-tier card below all update) but there is nothing behind them — no price
actually changes, no config is persisted. That's deliberate: faking a price would
misrepresent what this page can do. "Ask for today's price" and both CTA buttons
are data-toast placeholders, same convention as the rest of the site.

The four gallery images are one photograph (assets/hero-titanium-pair.jpg) plus
three crops of it (assets/pdp-15pro-crop-*.jpg) standing in for a proper product
shoot — there's only one real titanium-pair photo in the asset set. The three
related-product cards reuse that same crop set for the same reason. Swap in real
per-listing photography before this goes live.

PLACEHOLDER CONTENT — REPLACE BEFORE LAUNCH
-------------------------------------------
* Product listings in index.html section 05, and the buy box / spec sheet / related
  cards on product.html, are samples. Storage, grade, battery health and "Price on
  request" are stand-ins for live inventory.
* Trust copy (inspection, documentation, trade-in, support, the 40-point check and
  90-day warranty on product.html) describes intended policy, not verified operating
  practice. Confirm before publishing.
* The comparison tables use publicly documented Apple specifications for
  iPhone SE/12/13/14/15/15 Pro/15 Pro Max.
* The photography came with the original concept file and is not McLovin's own.
  Third-party watermarks and competitor branding ("Photographer by Huamu",
  "www.pixelstudio.fr", a Nudient case ad) have been cropped out of the JPEGs, but
  these images are still unlicensed for commercial use. Replace them with your own
  shoot before this goes live.
* Buttons marked data-toast are inert and show a hint toast. The signal form on
  index.html does not submit anywhere — wire it to your list.

INTERACTION
-----------
index.html:
* Hero: three slides, 6.4s crossfade with a slow scale drift; the rail doubles as a
  progress indicator and a manual control.
* The generation index: hovering a row floats its photograph beside the cursor
  (pointer devices at >=1181px only).

Both pages:
* Scroll-progress hairline, sticky masthead that flips from ink to bone, staggered
  IntersectionObserver reveals, hairline-ruled model marquee (index.html only).
* product.html's gallery thumbnails swap the main image; the condition/storage/
  colour controls update the buy box and (for condition) the grading tiers below.
* Everything above is disabled under prefers-reduced-motion.

BROWSER NOTES
-------------
Fonts load from Google Fonts. Backdrop-filter is used on the stuck masthead and the
hero spec card; it degrades to a solid tint where unsupported.
