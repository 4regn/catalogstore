// Shared heading/body font pairing catalog. Single source of truth for the
// dashboard's typography picker, the SoftLuxury storefront, and its
// checkout flow so all three always agree on what a given font_pair key
// renders as.
export const FONT_PAIRS: Record<string, { heading: string; body: string; import: string }> = {
  "cormorant-jost": { heading: "'Cormorant Garamond', serif", body: "'Jost', sans-serif", import: "family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Jost:wght@300;400;500;600;700" },
  "playfair-lato": { heading: "'Playfair Display', serif", body: "'Lato', sans-serif", import: "family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Lato:wght@300;400;700" },
  "dm-serif-inter": { heading: "'DM Serif Display', serif", body: "'Inter', sans-serif", import: "family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500;600;700" },
  "libre-raleway": { heading: "'Libre Baskerville', serif", body: "'Raleway', sans-serif", import: "family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Raleway:wght@300;400;500;600;700" },
  "fraunces-outfit": { heading: "'Fraunces', serif", body: "'Outfit', sans-serif", import: "family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400&family=Outfit:wght@300;400;500;600;700" },
  "eb-garamond-source": { heading: "'EB Garamond', serif", body: "'Source Sans 3', sans-serif", import: "family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Source+Sans+3:wght@300;400;500;600;700" },
  "bodoni-montserrat": { heading: "'Bodoni Moda', serif", body: "'Montserrat', sans-serif", import: "family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;0,6..96,600;0,6..96,700;1,6..96,400&family=Montserrat:wght@300;400;500;600;700" },
  "josefin-sans": { heading: "'Josefin Sans', sans-serif", body: "'Josefin Sans', sans-serif", import: "family=Josefin+Sans:wght@100;200;300;400;500;600;700" },
  "tenor-work": { heading: "'Tenor Sans', sans-serif", body: "'Work Sans', sans-serif", import: "family=Tenor+Sans&family=Work+Sans:wght@300;400;500;600;700" },
  "cinzel-nunito": { heading: "'Cinzel', serif", body: "'Nunito Sans', sans-serif", import: "family=Cinzel:wght@400;500;600;700&family=Nunito+Sans:wght@300;400;500;600;700" },
  "spectral-manrope": { heading: "'Spectral', serif", body: "'Manrope', sans-serif", import: "family=Spectral:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Manrope:wght@300;400;500;600;700" },
  "unbounded-karla": { heading: "'Unbounded', sans-serif", body: "'Karla', sans-serif", import: "family=Unbounded:wght@400;500;600;700&family=Karla:wght@300;400;500;600;700" },
};

export const DEFAULT_FONT_PAIR_KEY = "cormorant-jost";

export function getFontPair(key: string | undefined | null) {
  return FONT_PAIRS[key || ""] || FONT_PAIRS[DEFAULT_FONT_PAIR_KEY];
}
