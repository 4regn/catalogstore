// Shared types for the dashboard. Pulled out so sub-panels (e.g. the
// template-content editor) can import the StoreConfig shape without dragging
// the whole 1800-line page.tsx into their build graph.

export interface StoreConfig {
  show_banner_text: boolean;
  show_marquee: boolean;
  show_collections: boolean;
  show_about: boolean;
  show_trust_bar: boolean;
  show_policies: boolean;
  show_newsletter: boolean;
  announcement: string;
  marquee_texts: string[];
  trust_items: { icon: string; title: string; desc: string }[];
  policy_items: { title: string; desc: string }[];

  // Template-specific text fields (Heirloom + Crown). All optional so legacy
  // seller rows keep loading. Storefronts already read these and fall back to
  // their hardcoded defaults when undefined.
  ticker_texts?: string[];

  // Heirloom hero
  hero_index?: string;
  hero_label?: string;
  hero_headline?: string;
  hero_body?: string;
  hero_cta_primary?: string;
  hero_cta_secondary?: string;

  // Heirloom flash-sale section
  flash_sale_label?: string;
  flash_sale_title?: string;

  // Heirloom newsletter section
  newsletter_label?: string;
  newsletter_title?: string;
  newsletter_sub?: string;

  // Crown hero
  hero_subtext?: string;

  // Crown circle (texture) strip
  circle_title?: string;
  circle_subtitle?: string;

  // Crown products + collections + about labels
  products_label?: string;
  products_heading?: string;
  about_label?: string;
  coll_label?: string;
  coll_subtitle?: string;

  // Crown closing CTA banner
  cta_headline?: string;
  cta_subtext?: string;

  // Crown promise section
  promise_label?: string;
  promise_title?: string;
  promise_items?: { num: string; title: string; desc: string }[];
}
