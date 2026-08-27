import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "How to Pay with Stitch Pay Later | 4REGN",
  description: "Learn how to shop 4REGN with Stitch Pay Later and choose a flexible repayment plan at checkout.",
  alternates: { canonical: "https://4regn.com/stitch-pay-later" },
  openGraph: {
    title: "How to Pay with Stitch Pay Later | 4REGN",
    description: "Shop now and choose a flexible Stitch Pay Later repayment plan at 4REGN checkout.",
    url: "https://4regn.com/stitch-pay-later",
    siteName: "4REGN",
    type: "website",
  },
};

const STEPS = [
  ["01", "bag", "Add your products", "Choose your size, colour and quantity, then continue to secure checkout."],
  ["02", "card", "Choose Stitch Pay Later", "Select Stitch at payment and follow the guided approval flow."],
  ["03", "check", "Confirm your plan", "Review your instalment schedule, confirm, and complete your 4REGN order."],
] as const;

const REQUIREMENTS = ["South African resident", "Valid South African ID", "Valid email address", "Complete approval at checkout"];
const LOGOS = [
  ["/checkout/visa.png", "Visa"],
  ["/checkout/mastercard.png", "Mastercard"],
  ["/checkout/applepay.png", "Apple Pay"],
  ["/checkout/capitecpay.png", "Capitec Pay"],
] as const;

function GuideIcon({ name }: { name: string }) {
  if (name === "bag") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3.5 5.5h2l1.7 9.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4l1.2-5.2H7.2"/><circle cx="10" cy="19" r="1"/><circle cx="17" cy="19" r="1"/></svg>;
  if (name === "card") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9h17"/></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 12l5 5L20 6"/><circle cx="12" cy="12" r="9"/></svg>;
}

function PaymentLogos() {
  return <div className={styles.logos} aria-label="Payment methods supported by Stitch Pay Later">
    {LOGOS.map(([src, alt]) => <span className={styles.logo} key={alt}><img src={src} alt={alt}/></span>)}
  </div>;
}

export default async function StitchPayLaterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== "4regn") notFound();

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.home} aria-label="Back to 4REGN home">← Back to 4REGN</Link>
      <Link href="/" aria-label="4REGN home"><img src="/checkout/stitch.png" alt="Stitch" className={styles.headerLogo}/></Link>
    </header>

    <article className={styles.guide}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <span className={styles.heroLogo}><img src="/checkout/stitch.png" alt="Stitch"/></span>
          <span className={styles.eyebrow}>Pay Later on 4REGN</span>
        </div>
        <div>
          <h1>How to pay with <span>Stitch Pay Later</span></h1>
          <p>Shop 4REGN today and split your purchase into flexible monthly instalments with Stitch Pay Later. Your available spend and repayment options are shown at checkout before you commit.</p>
          <div className={styles.pills}><span>2–6 monthly instalments</span><span>Clear payment schedule</span><span>Available at checkout</span></div>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.kicker}>How it works</div>
        <h2>Checkout stays simple.</h2>
        <p className={styles.intro}>You shop 4REGN exactly as normal. Stitch only steps in when you&apos;re ready to choose how you want to pay.</p>
        <div className={styles.steps}>
          {STEPS.map(([number, icon, title, copy]) => <article className={styles.step} key={number}>
            <div className={styles.stepNumber}>{number}</div><div className={styles.stepIcon}><GuideIcon name={icon}/></div><div><h3>{title}</h3><p>{copy}</p></div>
          </article>)}
        </div>

        <section className={styles.plan}>
          <div className={styles.planKicker}>Your plan is personal</div><h2>Pick what fits.</h2>
          <p>Stitch can show different repayment options depending on your approval and checkout total. Product pages show a 6-month estimate so you can plan before checkout.</p>
          <div className={styles.months} aria-label="Possible instalment lengths">{[2,3,4,5,6].map((term) => <div className={styles.month} key={term}><strong>{term}</strong><span>Instalments</span></div>)}</div>
        </section>

        <section className={styles.approval}>
          <div className={styles.kicker}>Before you start</div><h2>Have the basics ready.</h2>
          <p className={styles.intro}>The checkout flow is designed to be quick. Have your basic details ready so Stitch can complete the account and approval process.</p>
          <div className={styles.requirements}>{REQUIREMENTS.map((item) => <div className={styles.requirement} key={item}><i>✓</i><span>{item}</span></div>)}</div>
          <PaymentLogos/>
        </section>

        <section className={styles.message}><div className={styles.kicker}>The 4REGN way</div><h2>Decide with confidence.</h2><p className={styles.intro}>Find the product you want, see what Stitch can offer you, review the full repayment schedule and decide from there. No guessing what comes next.</p></section>
        <div className={styles.ctaRow}><Link href="/collections/oversized-premium-tees" className={styles.cta}>Shop 4REGN now →</Link><span>Eligibility, approval limits and available plans are determined by Stitch.</span></div>
      </section>
      <footer className={styles.footer}><img src="/checkout/stitch.png" alt="Stitch"/><span>Stitch Pay Later available at 4REGN checkout</span></footer>
    </article>
  </main>;
}
