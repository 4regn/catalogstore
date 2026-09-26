import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../lib/store-url";
import { sellerMetadataTitle } from "../../../../lib/store-canonical-server";

export const revalidate = 3600;
export const dynamic = "force-static";

type Seller = { subdomain: string; store_name: string; logo_url?: string | null; template: string; custom_domain_status?: string | null };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, template, custom_domain_status")
    .eq("subdomain", slug)
    .maybeSingle();
  if (!seller || seller.template !== "4regn") return {};

  const title = `${seller.store_name} Lay-Buy — Pay a Deposit, Take Your Time`;
  const description = `Shop now, pay over time. Pay a 30% deposit at checkout, clear the rest within 6 months from your ${seller.store_name} account. No credit check, no interest.`;

  return {
    title: sellerMetadataTitle(title, seller.custom_domain_status),
    description,
    alternates: { canonical: canonicalStoreUrl(slug, "/laybuy") },
    openGraph: { title, description },
  };
}

const FAQ = [
  { q: "Is there a credit check?", a: "No. Lay-Buy isn't a credit or BNPL product — you're simply paying for your own order in stages, on your own terms." },
  { q: "What's the minimum deposit?", a: "30% of your order total, paid securely at checkout to lock your order in." },
  { q: "Can I pay more than the minimum?", a: "Yes — at checkout you can choose any amount from 30% up to the full total, if you'd rather get more of it out of the way upfront." },
  { q: "Is there a deadline to finish paying?", a: "Yes — 6 months from the day your deposit lands. Pay off your balance in any amount, any time within that window, from your account." },
  { q: "What happens if I don't finish paying in time?", a: "Your Lay-Buy plan expires and the order is cancelled. The deposit already paid isn't refunded, so it's worth staying on top of your balance." },
  { q: "When does my order ship?", a: "The moment your balance hits zero, your order goes into production and out the door. Nothing ships before it's fully paid." },
  { q: "Can I use Lay-Buy on any order?", a: "Yes — it's available as a payment option on any order at checkout." },
];

export default async function LaybuyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("subdomain, store_name, logo_url, template, custom_domain_status")
    .eq("subdomain", slug)
    .maybeSingle<Seller>();
  if (!seller || seller.template !== "4regn") notFound();

  const isSubdomain = await isStoreSubdomainRequest();
  const base = isSubdomain ? "" : `/store/${slug}`;

  return (
    <main className="laybuy-page">
      <style>{CSS}</style>
      <header>
        <a href={base || "/"} className="brand" aria-label={`${seller.store_name} home`}>
          {seller.logo_url ? <img src={seller.logo_url} alt={seller.store_name} /> : seller.store_name}
        </a>
        <a href={`${base}/account`}>My account</a>
      </header>

      <section className="hero">
        <div className="eyebrow">No Credit Check &middot; Pay Over Time</div>
        <h1>{seller.store_name} Lay-Buy</h1>
        <p>
          Pay a 30% deposit today, clear the rest within 6 months, and we&rsquo;ll ship the
          moment it&rsquo;s fully paid. No interest, no credit check &mdash; just your order,
          paid off on your own terms.
        </p>
        <div className="hero-ctas">
          <a className="shop" href={base || "/"}>Shop the collection</a>
          <a className="login" href={`${base}/account`}>Already started? Log in to your account</a>
        </div>
      </section>

      <section className="example">
        <div className="example-card">
          <span className="example-label">On a R1,000 order</span>
          <div className="example-split">
            <div><strong>R300</strong><span>due today (30%)</span></div>
            <div className="example-arrow">&rarr;</div>
            <div><strong>R700</strong><span>paid off within 6 months</span></div>
          </div>
        </div>
      </section>

      <section className="notice">
        <div className="notice-card">
          <strong>Your deposit reserves your order &mdash; it doesn&rsquo;t ship it.</strong>
          <p>Paying your deposit locks your items in at today&rsquo;s price and takes them off the shelf for you. Nothing goes into production or gets shipped until your balance is paid in full. There&rsquo;s no partial delivery on a partial payment.</p>
        </div>
      </section>

      <section className="steps">
        <div className="steps-inner">
          <div className="step">
            <span className="step-num">01</span>
            <h3>Choose Lay-Buy at checkout</h3>
            <p>Add your items to cart, select 4REGN Lay-Buy as your payment method, and pay a 30% deposit &mdash; or more, if you&rsquo;d like &mdash; to lock your order in.</p>
          </div>
          <div className="step">
            <span className="step-num">02</span>
            <h3>Top up whenever you like</h3>
            <p>Log into your {seller.store_name} account and pay off your balance in any amount, any time within 6 months. No interest, no penalties for paying it off early.</p>
          </div>
          <div className="step">
            <span className="step-num">03</span>
            <h3>We ship once it&rsquo;s paid off</h3>
            <p>The moment your balance hits zero, your order goes straight into production and out the door.</p>
          </div>
        </div>
      </section>

      <section className="faq">
        <h2>Questions</h2>
        <div className="faq-list">
          {FAQ.map((item) => (
            <div className="faq-item" key={item.q}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta">
        <h2>Ready when you are.</h2>
        <p>Build your cart, choose Lay-Buy at checkout, and take your time.</p>
        <a className="shop" href={base || "/"}>Shop the collection</a>
      </section>

      <footer>{seller.store_name.toUpperCase()} &middot; WE&apos;RE NOT FROM HERE</footer>
    </main>
  );
}

const CSS = `*{box-sizing:border-box}.laybuy-page{min-height:100vh;background:#fdfdfb;color:#111}.laybuy-page header{height:82px;padding:0 5vw;display:flex;align-items:center;justify-content:space-between;background:#fffffff0;border-bottom:1px solid #00000016;position:sticky;top:0;z-index:10;backdrop-filter:blur(14px)}.laybuy-page header a{color:#111;text-decoration:none;text-transform:uppercase;letter-spacing:.15em;font-size:11px;font-weight:800}.laybuy-page .brand{font-size:14px}.laybuy-page .brand img{display:block;max-width:126px;max-height:40px}.hero{width:min(720px,calc(100% - 44px));margin:0 auto;padding:76px 0 8px;text-align:center}.hero .eyebrow{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#d64735;margin-bottom:14px}.hero h1{font:400 clamp(38px,6vw,64px)/1.02 Georgia,serif;letter-spacing:-.03em;margin:0 0 18px;text-transform:uppercase}.hero p{color:#5c5a56;line-height:1.7;font-size:15px;margin:0 auto 30px;max-width:560px}.hero-ctas{display:flex;flex-direction:column;align-items:center;gap:14px}.hero-ctas .shop{display:inline-block;background:#111;color:#fff;text-decoration:none;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:800;padding:16px 34px;border-radius:999px}.hero-ctas .login{color:#5c5a56;font-size:12px;text-decoration:underline;text-underline-offset:3px}.example{width:min(560px,calc(100% - 44px));margin:48px auto 0}.example-card{background:#111;color:#fff;border-radius:20px;padding:30px 28px}.example-label{display:block;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:18px;text-align:center}.example-split{display:flex;align-items:center;justify-content:center;gap:20px;text-align:center}.example-split strong{display:block;font:400 34px Georgia,serif}.example-split span{display:block;font-size:11px;color:rgba(255,255,255,.6);margin-top:4px;max-width:130px}.example-arrow{color:rgba(255,255,255,.35);font-size:20px}.notice{width:min(560px,calc(100% - 44px));margin:20px auto 0}.notice-card{border:1.5px solid #d64735;background:#fdf3f1;border-radius:16px;padding:22px 24px}.notice-card strong{display:block;font-size:14px;font-weight:800;color:#a8351f;margin-bottom:8px}.notice-card p{margin:0;color:#6b4038;font-size:12.5px;line-height:1.65}.steps{width:min(1080px,calc(100% - 44px));margin:80px auto}.steps-inner{display:grid;grid-template-columns:repeat(3,1fr);gap:36px}.step{padding:0}.step-num{display:block;font:400 15px Georgia,serif;color:#d64735;margin-bottom:12px}.step h3{font-size:16px;font-weight:700;margin:0 0 10px;letter-spacing:-.01em}.step p{color:#5c5a56;font-size:13.5px;line-height:1.65;margin:0}.faq{width:min(760px,calc(100% - 44px));margin:0 auto 80px}.faq h2{font:400 30px/1.1 Georgia,serif;margin:0 0 30px;text-align:center}.faq-list{display:flex;flex-direction:column;gap:22px}.faq-item{padding-bottom:22px;border-bottom:1px solid #e9e7e2}.faq-item:last-child{border-bottom:none}.faq-item h3{font-size:14px;font-weight:700;margin:0 0 8px}.faq-item p{color:#5c5a56;font-size:13.5px;line-height:1.65;margin:0}.cta{text-align:center;padding:36px 24px 90px;border-top:1px solid #e9e7e2}.cta h2{font:400 30px/1.1 Georgia,serif;margin:0 0 12px}.cta p{color:#5c5a56;font-size:14px;margin:0 0 26px}.cta .shop{display:inline-block;background:#111;color:#fff;text-decoration:none;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:800;padding:16px 34px;border-radius:999px}.laybuy-page footer{border-top:1px solid #00000014;padding:26px 5vw 34px;color:#88847f;font-size:10px;letter-spacing:.08em;text-align:center;background:#ffffff73}@media(max-width:760px){.laybuy-page header{height:72px;padding:0 22px}.hero{padding:48px 0 8px}.steps-inner{grid-template-columns:1fr;gap:34px}.example-split{gap:14px}.example-split strong{font-size:28px}}`;
