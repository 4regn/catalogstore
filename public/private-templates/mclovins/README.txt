McLOVIN'S APPLE TRADER — concept storefront
===========================================

Served at /private-templates/mclovins/index.html

WHAT THIS IS
------------
A single self-contained landing page. No build step, no framework — open index.html
directly or serve the folder statically. All imagery lives in ./assets as real files
(the earlier version inlined every photo as base64, which put the page at 2.5 MB;
it is now ~64 KB of HTML plus ~480 KB of images, loaded lazily below the fold).

ART DIRECTION
-------------
Ink-on-bone editorial catalogue. Near-black plates (hero, ledger, signal, footer)
alternate with warm bone paper sections, ruled with 1px hairlines instead of cards
and drop shadows. Corners are square by default; only buttons are pills.

  Type    Bodoni Moda   display headlines (italic for the accented word)
          Inter Tight   UI and body
          JetBrains Mono  section numbers, labels, all spec/metadata

  Colour  --ink   #0A0A0B     --bone  #F2F0EA
          --lime  #C6F227     --lav-deep #6E4CFF
          Lime is deliberately rationed — a dot, a hairline, one button, one
          table column. It is never a full-bleed panel.

Sections are numbered 01–08 in the mono kickers, mirroring a printed index.

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

PLACEHOLDER CONTENT — REPLACE BEFORE LAUNCH
-------------------------------------------
* Product listings in section 05 are samples. Storage, grade, battery health and
  "Price on request" are stand-ins for live inventory.
* Trust copy in section 02 (inspection, documentation, trade-in, support) describes
  intended policy, not verified operating practice. Confirm before publishing.
* The comparison table in section 06 uses publicly documented Apple specifications
  for iPhone SE/12/13/14/15/15 Pro.
* The photography came with the original concept file and is not McLovin's own.
  Third-party watermarks and competitor branding ("Photographer by Huamu",
  "www.pixelstudio.fr", a Nudient case ad) have been cropped out of the JPEGs, but
  these images are still unlicensed for commercial use. Replace them with your own
  shoot before this goes live.
* Buttons marked data-toast are inert and show a hint toast. The signal form does
  not submit anywhere — wire it to your list.

INTERACTION
-----------
* Hero: three slides, 6.4s crossfade with a slow scale drift; the rail doubles as a
  progress indicator and a manual control.
* Section 03: hovering a generation row floats its photograph beside the cursor
  (pointer devices at >=1181px only).
* Scroll-progress hairline, sticky masthead that flips from ink to bone, staggered
  IntersectionObserver reveals, hairline-ruled model marquee.
* Everything above is disabled under prefers-reduced-motion.

BROWSER NOTES
-------------
Fonts load from Google Fonts. Backdrop-filter is used on the stuck masthead and the
hero spec card; it degrades to a solid tint where unsupported.
