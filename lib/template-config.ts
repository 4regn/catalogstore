// Splits store_config fields into "global" (shared across every template a
// seller might pick -- business identity, contact info, policies) and
// "template-scoped" (visual styling/content that's genuinely different per
// theme: colors, hero copy, marquee, font pair, layout toggles). Each
// template's scoped fields are stored independently in
// sellers.template_configs[templateId], so switching templates no longer
// overwrites another template's saved customization.
export const TEMPLATE_SCOPED_KEYS = [
  // colors
  "bg_color", "text_color", "muted_color",
  "hero_text_color", "circle_text_color", "products_text_color", "about_text_color",
  "coll_text_color", "cta_text_color", "trust_text_color",
  "footer_text_color", "footer_bg_color", "footer_muted_color",
  "promo_bg_color", "promo_bg_style", "promo_text_color", "promo_timer_color",
  "sale_pill_color", "percent_off_pill_color", "show_percent_off_pill",
  "header_transparent", "header_transparent_color", "header_border",
  // typography
  "font_pair",
  // hero content/layout
  "hero_title", "hero_subtext", "hero_cta", "hero_cta_target",
  "hero_image", "hero_video_url", "hero_image_position", "hero_image_behavior", "hero_layout",
  "hero_text_position", "hero_button_style", "hero_button_color", "hero_button_size", "hero_headline_style", "hero_image_fade",
  "hero_split_image_2",
  "header_style",
  "hero_index", "hero_label", "hero_headline", "hero_headline_em", "hero_body",
  "hero_cta_primary", "hero_cta_secondary", "hero_cta_primary_target", "hero_cta_secondary_target",
  "hero_countdown_label", "hero_sale_headline",
  // sections
  "circle_title", "circle_subtitle",
  "products_label", "products_heading", "product_card_ratio", "products_collapsed",
  "about_label", "about_title", "about_image",
  "coll_label", "coll_subtitle", "collections_layout", "collection_images", "collections_collapsed",
  "ticker_texts", "ticker_speed", "marquee_texts", "marquee_speed",
  "promise_label", "promise_title", "promise_items", "promise_images",
  "footer_tagline", "footer_col1_label", "footer_col2_label", "footer_col3_label",
  "footer_support_links", "footer_pay_links",
  // section visibility toggles
  "show_banner_text", "show_marquee", "show_collections", "show_about",
  "show_trust_bar", "show_policies", "show_newsletter",
  "featured_product_id", "flash_sale_label", "flash_sale_title", "show_flash_sale",
  "newsletter_label", "newsletter_title", "newsletter_sub", "newsletter_copyright",
] as const;

const SCOPED_SET = new Set<string>(TEMPLATE_SCOPED_KEYS);

export function pickTemplateFields(config: Record<string, any> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(config || {})) {
    if (SCOPED_SET.has(key)) out[key] = (config as any)[key];
  }
  return out;
}

export function omitTemplateFields(config: Record<string, any> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(config || {})) {
    if (!SCOPED_SET.has(key)) out[key] = (config as any)[key];
  }
  return out;
}

/* The config a template should actually render with: global fields (as
   they are today) merged with this template's saved scoped fields --
   falling back to the legacy flat store_config's scoped subset for
   whichever template the seller was on before this migration shipped, so
   nobody's current look changes the moment this ships. */
export function effectiveStoreConfig(seller: {
  store_config?: Record<string, any> | null;
  template_configs?: Record<string, any> | null;
  template?: string | null;
}): Record<string, any> {
  const flat = seller.store_config || {};
  const globalPart = omitTemplateFields(flat);
  const template = seller.template || "";
  const scoped = seller.template_configs?.[template];
  const templatePart = scoped !== undefined ? scoped : pickTemplateFields(flat);
  return { ...globalPart, ...templatePart };
}
