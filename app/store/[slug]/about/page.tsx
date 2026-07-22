import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";

export const metadata: Metadata = { title: "About UNIK Labs" };

export default async function AboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  return (
    <UnikInfoLayout kicker="About UNIK Labs" title="Design without the blank canvas.">
      <p>
        UNIK Labs exists to make professional apparel design more accessible. Instead of starting
        with complicated design software, creators can choose a professionally prepared template,
        upload their own images and use AI to turn an idea into apparel-ready artwork.
      </p>
      <p>
        Customers can preview their design on a garment before ordering it for printing on UNIK
        Labs T-shirts and hoodies.
      </p>
      <p>
        Whether someone is creating a personal piece, a gift or artwork for a clothing brand, UNIK
        Labs simplifies the journey from an idea to a finished garment.
      </p>
      <p>
        Built in Durban, South Africa, UNIK Labs combines artificial intelligence, creative tools
        and apparel production in one platform.
      </p>
      <h2 id="our-story">Our story</h2>
      <p>
        UNIK Labs started with a simple observation: turning a personal idea into something you can
        actually wear usually meant either learning design software or settling for a generic print.
        We built UNIK Labs to close that gap — pairing AI-assisted design with our own garment
        printing, so the distance between an idea and a finished piece is as short as possible.
      </p>
    </UnikInfoLayout>
  );
}
