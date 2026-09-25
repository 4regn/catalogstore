import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../lib/store-url";
import { sellerMetadataTitle } from "../../../../lib/store-canonical-server";
import type { StoreReview } from "../fourRegnReviews";

export const revalidate = 3600;
export const dynamic = "force-static";

type Seller = { subdomain: string; store_name: string; logo_url?: string | null; template: string; whatsapp_number?: string | null; custom_domain_status?: string | null };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id, store_name, template, custom_domain_status")
    .eq("subdomain", slug)
    .maybeSingle();
  if (!seller || seller.template !== "4regn") return {};

  const { data: reviews } = await supabaseAdmin
    .from("store_reviews")
    .select("image_url")
    .eq("seller_id", seller.id)
    .limit(4);

  const title = `${seller.store_name} Reviews — Real Customer Testimonials`;
  const description = `Real ${seller.store_name} reviews from real customers — parcels arriving and outfits going on, straight from WhatsApp. Celebrating 7 years of ${seller.store_name}.`;

  return {
    title: sellerMetadataTitle(title, seller.custom_domain_status),
    description,
    alternates: { canonical: canonicalStoreUrl(slug, "/reviews") },
    openGraph: { title, description, images: (reviews ?? []).map((r) => r.image_url) },
  };
}

export default async function ReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id, subdomain, store_name, logo_url, template, whatsapp_number, custom_domain_status")
    .eq("subdomain", slug)
    .maybeSingle<Seller & { id: string }>();
  if (!seller || seller.template !== "4regn") notFound();

  // Full gallery, not capped -- unlike the homepage carousel (which only
  // ever shows a random few, see FourRegnReviewsCarousel.tsx), this page's
  // whole point is to be the complete set for anyone who wants to see
  // every one of them.
  const { data: reviewsData } = await supabaseAdmin
    .from("store_reviews")
    .select("id, image_url, quote")
    .eq("seller_id", seller.id)
    .order("created_at", { ascending: false });
  const reviews: StoreReview[] = reviewsData ?? [];

  const isSubdomain = await isStoreSubdomainRequest();
  const base = isSubdomain ? "" : `/store/${slug}`;
  const waNumber = seller.whatsapp_number?.replace(/\D/g, "");

  return (
    <main className="reviews-page">
      <style>{CSS}</style>
      <header>
        <a href={base || "/"} className="brand" aria-label={`${seller.store_name} home`}>
          {seller.logo_url ? <img src={seller.logo_url} alt={seller.store_name} /> : seller.store_name}
        </a>
        <a href={base || "/"}>Shop 4REGN</a>
      </header>

      <section className="hero">
        <div className="eyebrow">{seller.store_name} Reviews · 7 Years Running</div>
        <h1>Join the {seller.store_name} Family</h1>
        <p>
          These are some of the real messages and photos our customers send us on WhatsApp the
          moment their parcel arrives — no filters, no staging, just real reviews and testimonials
          from people getting their order and telling us about it. Seven years in, this is what
          we&rsquo;re most proud of.
        </p>
      </section>

      {reviews.length > 0 ? (
        <section className="grid">
          {reviews.map((r, i) => (
            <figure className="card" key={r.id}>
              <img src={r.image_url} alt={r.quote || `${seller.store_name} customer's WhatsApp message and photo after receiving their order`} loading={i < 2 ? "eager" : "lazy"} />
              {r.quote && (
                <figcaption>
                  <p>&ldquo;{r.quote}&rdquo;</p>
                  <div className="byline">
                    <span>Verified {seller.store_name} customer</span>
                    <span>Shared on WhatsApp</span>
                  </div>
                </figcaption>
              )}
            </figure>
          ))}
        </section>
      ) : (
        <p className="empty">More reviews are on the way &mdash; check back soon.</p>
      )}

      <section className="cta">
        <h2>Got your order? We&rsquo;d love to see it.</h2>
        {waNumber ? (
          <p>
            Send us a photo on <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer">WhatsApp</a> and you could see yours here next.
          </p>
        ) : (
          <p>Send us a photo when your order arrives and you could see yours here next.</p>
        )}
        <a className="shop" href={base || "/"}>Shop the collection</a>
      </section>

      <footer>{seller.store_name.toUpperCase()} · WE&apos;RE NOT FROM HERE</footer>
    </main>
  );
}

const CSS = `*{box-sizing:border-box}.reviews-page{min-height:100vh;background:#fdfdfb;color:#111}.reviews-page header{height:82px;padding:0 5vw;display:flex;align-items:center;justify-content:space-between;background:#fffffff0;border-bottom:1px solid #00000016;position:sticky;top:0;z-index:10;backdrop-filter:blur(14px)}.reviews-page header a{color:#111;text-decoration:none;text-transform:uppercase;letter-spacing:.15em;font-size:11px;font-weight:800}.reviews-page .brand{font-size:14px}.reviews-page .brand img{display:block;max-width:126px;max-height:40px}.hero{width:min(720px,calc(100% - 44px));margin:0 auto;padding:72px 0 12px;text-align:center}.hero .eyebrow{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#d64735;margin-bottom:14px}.hero h1{font:400 clamp(34px,5vw,56px)/1.02 Georgia,serif;letter-spacing:-.03em;margin:0 0 18px;text-transform:uppercase}.hero p{color:#5c5a56;line-height:1.7;font-size:15px;margin:0 auto}.grid{width:min(1180px,calc(100% - 44px));margin:64px auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:26px}.empty{text-align:center;color:#8c8a85;font-size:14px;margin:64px auto;padding:0 24px}.card{margin:0;background:#fff;border:1px solid #e9e7e2;border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(0,0,0,.05);display:flex;flex-direction:column}.card img{display:block;width:100%;aspect-ratio:auto;object-fit:cover;max-height:420px}.card figcaption{padding:22px 24px;display:flex;flex-direction:column;flex:1}.card p{font-size:15px;line-height:1.6;color:#1a1a1a;margin:0 0 18px;font-style:normal}.byline{display:flex;flex-direction:column;gap:2px;margin-top:auto;padding-top:14px;border-top:1px solid #eee}.byline span:first-child{font-size:11px;font-weight:800;letter-spacing:.02em}.byline span:last-child{font-size:10px;color:#918f8a}.cta{text-align:center;padding:36px 24px 90px}.cta h2{font:400 30px/1.1 Georgia,serif;margin:0 0 12px}.cta p{color:#5c5a56;font-size:14px;margin:0 0 26px}.cta p a{color:#111;font-weight:700}.cta .shop{display:inline-block;background:#111;color:#fff;text-decoration:none;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:800;padding:16px 34px;border-radius:999px}.reviews-page footer{border-top:1px solid #00000014;padding:26px 5vw 34px;color:#88847f;font-size:10px;letter-spacing:.08em;text-align:center;background:#ffffff73}@media(max-width:680px){.reviews-page header{height:72px;padding:0 22px}.hero{padding:44px 0 8px}.grid{margin:44px auto;gap:18px}.card p{font-size:14px}}`;
