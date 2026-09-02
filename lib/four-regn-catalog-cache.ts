import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "./supabase-admin";
import { fetchAllRows } from "./fetch-all-rows";

export const FOUR_REGN_CATALOG_COLUMNS =
  "id, name, price, old_price, category, image_url, images, handle, created_at, in_stock, tags";

const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";
const PROMO_BADGE_COLUMNS =
  "label, scope, product_id, collection_name, starts_at, ends_at";

export function getCachedFourRegnCatalog(slug: string, sellerId: string) {
  return unstable_cache(
    async () => {
      const [products, discountsRes, promoBadgesRes] = await Promise.all([
        fetchAllRows<any>(supabaseAdmin, "products", FOUR_REGN_CATALOG_COLUMNS, (q) =>
          q.eq("seller_id", sellerId).eq("status", "published").order("sort_order", { ascending: true })
        ),
        supabaseAdmin
          .from("discount_codes")
          .select(DISCOUNT_COLUMNS)
          .eq("seller_id", sellerId)
          .eq("active", true)
          .eq("show_countdown", true)
          .not("expires_at", "is", null),
        supabaseAdmin
          .from("product_promo_badges")
          .select(PROMO_BADGE_COLUMNS)
          .eq("seller_id", sellerId)
          .eq("active", true),
      ]);

      return {
        products,
        discounts: discountsRes.data ?? [],
        promoBadges: promoBadgesRes.data ?? [],
      };
    },
    // v4: FOUR_REGN_CATALOG_COLUMNS gained tags/images (Custom Upload
    // Studio products need both), and the 4 new product rows themselves
    // were inserted directly via SQL migration -- an out-of-band catalog
    // change, same reasoning as the v3 bump's own comment. Without
    // bumping this, the persistent Vercel Data Cache (survives
    // deployments) would keep serving the pre-migration snapshot -- the
    // exact "collection page says 0 products even though they exist"
    // report that prompted this fix -- for up to its own revalidate
    // window regardless of this code shipping.
    ["four-regn-catalog-v4", slug, sellerId],
    { revalidate: 3600, tags: [`storefront:${slug}`] }
  )();
}
