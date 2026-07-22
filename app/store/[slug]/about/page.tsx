import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const metadata: Metadata = { title: "About UNIK Labs" };

const HOW_IT_WORKS = [
  { title: "Choose a Template", body: "Browse a growing collection of professionally designed AI templates built specifically for apparel." },
  { title: "Upload Your Images", body: "Upload the images you'd like to incorporate into your design. If you already have artwork ready, simply use the Custom Upload option instead." },
  { title: "Let AI Create", body: "Our AI transforms your uploaded content into unique apparel-ready artwork based on your selected template." },
  { title: "Preview Before You Order", body: "View both your final design and a realistic garment mockup before completing your purchase. This gives you confidence in what you're ordering before production begins." },
  { title: "Printed for You", body: "Once your order is confirmed, we'll print your design on one of our premium garments and prepare it for delivery." },
];

const DIFFERENTIATORS = [
  { title: "AI Built for Apparel", body: "Unlike general-purpose AI image generators, our templates are designed specifically for clothing, helping produce artwork that looks great on wearable products." },
  { title: "Professional Templates", body: "Start with carefully designed layouts created to deliver consistent, high-quality results while still allowing room for creativity." },
  { title: "Preview Before Production", body: "See exactly how your design will look on a garment before placing your order." },
  { title: "Premium Garments", body: "Every order is printed on garments supplied by UNIK Labs to ensure consistent quality and printing results." },
  { title: "No Design Experience Required", body: "Whether you're an experienced designer or creating custom apparel for the very first time, UNIK Labs is designed to make the process simple and enjoyable." },
];

export default async function AboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();
  return (
    <UnikInfoLayout kicker="About UNIK Labs" title="Design without the blank canvas." wide basePath={basePath}>
      <p>At UNIK Labs, we believe creating custom apparel should be exciting, not overwhelming.</p>
      <p>
        Traditional design software often comes with a steep learning curve, making it difficult
        for many people to bring their ideas to life. UNIK Labs was built to remove that barrier
        by combining artificial intelligence with thoughtfully crafted design tools, allowing
        anyone to create professional-looking apparel without needing advanced design skills.
      </p>
      <p>
        Whether you&rsquo;re designing for yourself, creating a meaningful gift or launching your
        own clothing brand, UNIK Labs helps turn your ideas into wearable creations in just a few
        simple steps.
      </p>
      <p>
        Built in Durban, South Africa, UNIK Labs brings together AI-powered creativity and premium
        apparel production in one seamless experience.
      </p>

      <h2>Our Mission</h2>
      <p>To make professional apparel design accessible to everyone through the power of artificial intelligence.</p>
      <p>
        We&rsquo;re building tools that remove creative barriers, giving anyone the ability to
        transform ideas into high-quality, wearable designs without needing expensive software or
        years of design experience.
      </p>

      <h2>Our Vision</h2>
      <p>To become the world&rsquo;s most accessible AI-powered apparel creation platform.</p>
      <p>
        We envision a future where anyone, anywhere can create custom clothing that reflects their
        personality, creativity and brand with just a few clicks.
      </p>

      <h2 id="our-story">Why UNIK Labs?</h2>
      <p>Most custom apparel platforms require you to already have a finished design.</p>
      <p>Most AI image generators create beautiful artwork &mdash; but not artwork that&rsquo;s ready for apparel.</p>
      <p>UNIK Labs bridges that gap.</p>
      <p>
        Our platform combines professionally designed templates, artificial intelligence and
        premium garment printing into one seamless workflow, making it easier than ever to create
        clothing you&rsquo;ll actually want to wear.
      </p>

      <h2>How It Works</h2>
      <ol className="ui-steps">
        {HOW_IT_WORKS.map((step) => (
          <li key={step.title}><div><strong>{step.title}</strong><span>{step.body}</span></div></li>
        ))}
      </ol>

      <h2>What Makes UNIK Labs Different?</h2>
      <div className="ui-features">
        {DIFFERENTIATORS.map((item) => (
          <div className="ui-feature" key={item.title}><strong>{item.title}</strong><span>{item.body}</span></div>
        ))}
      </div>

      <h2>Built for Creators</h2>
      <p>UNIK Labs is for anyone with an idea.</p>
      <p>Whether you&rsquo;re creating:</p>
      <ul>
        <li>Personal apparel</li>
        <li>Gifts</li>
        <li>Clothing brands</li>
        <li>Merchandise</li>
        <li>Event apparel</li>
        <li>Team apparel</li>
        <li>Limited-edition collections</li>
      </ul>
      <p>Our goal is to give you the tools to create something uniquely yours.</p>

      <h2>Looking Ahead</h2>
      <p>We&rsquo;re just getting started.</p>
      <p>
        As UNIK Labs continues to evolve, we&rsquo;ll keep expanding the platform with new AI
        templates, creative tools, apparel options and features designed to make custom apparel
        creation even more accessible.
      </p>
      <p>Our mission remains the same:</p>
      <p>To help people turn ideas into clothing they&rsquo;ll be proud to wear.</p>

      <div className="ui-cta">
        <h2>Ready to create something unique?</h2>
        <p>Start designing today with our AI Design Studio or upload your own artwork and let us bring your vision to life.</p>
        <div className="ui-cta-actions">
          <a className="ui-cta-primary" href="/private-templates/unik-labs/studio.html">Launch AI Design Studio</a>
          <a className="ui-cta-secondary" href="/private-templates/unik-labs/upload.html">Custom Upload</a>
        </div>
      </div>
    </UnikInfoLayout>
  );
}
