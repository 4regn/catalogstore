import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";

const RAILWAY_FALLBACK = "https://4regn-sms-production.up.railway.app/generate";
const GARMENTS = new Set(["tee", "hoodie"]);
const COLOURS = new Set(["black", "white"]);
const SUBJECTS = new Set(["artist", "personal"]);
const STYLES = new Set(["TOUR_POSTER", "BOOTLEG", "EDITORIAL", "CHROME", "GIANT_FACE", "BLING_ERA", "PAPER_CUT", "VTG_BOOTLEG"]);

export type UnikGenerationInput = {
  garment: "tee" | "hoodie";
  colour: "black" | "white";
  subject: "artist" | "personal";
  style: string;
  name: string;
  tagline: string;
  size: string;
  photos: string[];
};

function text(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

export function parseGenerationInput(body: unknown): UnikGenerationInput {
  if (!body || typeof body !== "object") throw new Error("Invalid generation request");
  const source = body as Record<string, unknown>;
  const garment = text(source.garment, 20).toLowerCase();
  const colour = text(source.colour, 20).toLowerCase();
  const subject = text(source.subject, 20).toLowerCase();
  const style = text(source.style, 40).toUpperCase();
  const name = text(source.name, 80);
  const tagline = text(source.tagline, 100);
  const size = text(source.size, 8).toUpperCase();
  const photos = Array.isArray(source.photos) ? source.photos.map((photo) => String(photo || "")) : [];

  if (!GARMENTS.has(garment) || !COLOURS.has(colour) || !SUBJECTS.has(subject) || !STYLES.has(style)) throw new Error("Choose valid design options");
  if (!name) throw new Error("Add a name for your design");
  if (!/^(XS|S|M|L|XL|XXL)$/.test(size)) throw new Error("Choose a valid garment size");
  if (!photos.length || photos.length > 5 || (style === "GIANT_FACE" && photos.length !== 1)) throw new Error(style === "GIANT_FACE" ? "Giant Face needs exactly one photo" : "Upload between one and five photos");

  let total = 0;
  const cleaned = photos.map((photo) => {
    const raw = photo.includes(",") ? photo.slice(photo.indexOf(",") + 1) : photo;
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) throw new Error("One of the uploaded photos is invalid");
    total += raw.length;
    return raw;
  });
  if (total > 4_200_000) throw new Error("Your photos are too large. Remove one or use smaller photos.");

  return { garment: garment as "tee" | "hoodie", colour: colour as "black" | "white", subject: subject as "artist" | "personal", style, name, tagline, size, photos: cleaned };
}

export function buildUnikPrompt(input: UnikGenerationInput) {
  const name = input.name.toUpperCase();
  const tagline = input.tagline.trim().toUpperCase();
  const count = input.photos.length;
  const background = input.colour === "black" ? "pure black #0A0A0A" : "pure white #FFFFFF";
  const subjectRule = input.subject === "artist" ? "Treat the subject as an artist, but do not invent instruments, stages, locations or biography." : "This is a personal portrait. Do not add performance, concert, microphone or stage references.";
  const photoRules = `PHOTO RULES:\n- ${count} reference photo(s) attached. Use EACH exactly once, except stylistic close crops may come from the same visible portrait.\n- Use ONLY the people in the uploaded photos. Never substitute another face.\n- Preserve identity, facial features, skin tone and expression.\n- Do not infer private details or location.\n- ${subjectRule}\n`;
  const footer = `\nGARMENT: The finished graphic is intended for a ${input.colour} ${input.garment}.\nOUTPUT: A single print-ready portrait 3:4 artwork, no garment, no model, no mockup, no border. ${background} must bleed cleanly to every edge.`;
  const line = tagline || (input.subject === "artist" ? "THE ICON" : "ONE OF ONE");

  const styles: Record<string, string> = {
    TOUR_POSTER: `DESIGN: Vintage distressed tour-poster streetwear graphic on ${background}. Layer all photos into a bold hero-led collage with raw overlap, heavy film grain and subtle halftone. Top typography: massive condensed caps \"${name}\". Supporting line: \"${line}\". Use red #C8392B as the single accent with cream and black. Add no fake dates, venues, setlists or advisory labels.`,
    BOOTLEG: `DESIGN: Authentic late-1990s bootleg rap-shirt graphic on ${background}. Build a dense mosaic with one dominant hero and supporting portraits, deep grain, distressed ink and high contrast. Top: oversized outlined caps \"${name}\". Bottom: \"${line}\". Use electric blue #1E90FF as the single accent.`,
    EDITORIAL: `DESIGN: Premium editorial art-zine collage on ${background}. Use torn-paper edges, layered angles, a mix of colour and monochrome, and one large hero portrait. Overlap massive typography \"${name}\" with the composition and add handwritten \"${line}\" below. One muted accent only.`,
    CHROME: `DESIGN: Luxury dark streetwear portrait composition on near-black. Use two or three portraits with a cinematic central hero, extreme contrast and sharp highlights. Create genuinely dimensional chrome metallic typography \"${name}\" with realistic reflection and depth; add chrome script \"${line}\". Use a restrained deep-red accent.`,
    GIANT_FACE: `DESIGN: Monumental giant-face portrait graphic. Use the single reference as the only identity source. The face fills 85-90% of the canvas, slightly off-centre, cropped boldly, with no neck or body. Screen-print duotone with one warm accent, near-white highlights, pure-black shadows, heavy halftone and aged texture. Put a small signature-style \"${name}\" at bottom right${tagline ? ` with tiny \"${tagline}\" beneath` : ""}.`,
    BLING_ERA: `DESIGN: Loud early-2000s Bling Era bootleg graphic on pure black. One dominant full-colour airbrushed hero, supporting portraits and one circular inset. Add 4-6 four-point sparkles and a radial glow selected from pink/purple, teal/blue, amber/gold or deep red based on the photos. Top typography: massive rhinestone, gold 3D or chrome \"${name}\". Bottom handwritten script: \"${line}\".`,
    PAPER_CUT: `DESIGN: Contemporary paper-cut portrait collage on ${background}. Use a large central cut-out face with a few deliberately enlarged facial details in layered paper circles or torn shapes. Add fine hand-drawn annotation marks and one acid-lime accent. Keep the composition artful and premium, never distorted. Small restrained typography may read \"${name}\" and \"${line}\".`,
    VTG_BOOTLEG: `DESIGN: Collector-grade vintage bootleg portrait graphic on ${background}. Use a central hero surrounded by the remaining portraits, sepia or sun-faded tones, lightning or star texture, distressed screen-print grain and dramatic old-merch typography. Top: \"${name}\". Bottom: \"${line}\". Do not invent dates, venues or factual claims.`,
  };
  return `${photoRules}\n${styles[input.style]}${footer}`;
}

export async function callRailwayGeneration(input: UnikGenerationInput) {
  const endpoint = process.env.UNIK_RAILWAY_GENERATE_URL || RAILWAY_FALLBACK;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.UNIK_RAILWAY_SECRET) headers.Authorization = `Bearer ${process.env.UNIK_RAILWAY_SECRET}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ photos: input.photos, prompt: buildUnikPrompt(input) }), signal: controller.signal, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `Generation provider returned ${response.status}`);
    if (typeof payload.image !== "string" || payload.image.length < 1000) throw new Error("The generation provider returned no artwork");
    const raw = payload.image.includes(",") ? payload.image.slice(payload.image.indexOf(",") + 1) : payload.image;
    const buffer = Buffer.from(raw, "base64");
    if (buffer.length > 20 * 1024 * 1024) throw new Error("Generated artwork is too large");
    // Railway may return JPEG or WebP bytes even though the response field is
    // named `image`. Normalise the asset before storing and processing it.
    return sharp(buffer).rotate().png().toBuffer();
  } finally {
    clearTimeout(timer);
  }
}

function watermarkSvg(width: number, height: number) {
  const tileW = Math.max(240, Math.round(width / 3));
  const tileH = Math.max(150, Math.round(height / 5));
  let marks = "";
  for (let y = -tileH; y < height + tileH; y += tileH) {
    for (let x = -tileW; x < width + tileW; x += tileW) {
      marks += `<text x="${x}" y="${y}" transform="rotate(-24 ${x} ${y})" fill="white" fill-opacity=".2" stroke="black" stroke-opacity=".14" stroke-width="2" font-family="Arial, sans-serif" font-size="${Math.round(tileW / 7)}" font-weight="700" letter-spacing="5">UNIK LABS</text>`;
    }
  }
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${marks}</svg>`);
}

export async function makeWatermarkedPreview(clean: Buffer) {
  const image = sharp(clean).rotate();
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1365;
  return image.composite([{ input: watermarkSvg(width, height), blend: "over" }]).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

export async function makeMockup(clean: Buffer, input: UnikGenerationInput) {
  const basePath = path.join(process.cwd(), "public", "private-templates", "unik-labs", "assets", "dark-studio", `${input.garment}-${input.colour}-model.jpg`);
  const base = sharp(basePath);
  const metadata = await base.metadata();
  const width = metadata.width || 400;
  const height = metadata.height || 600;
  const zoneWidth = Math.round(width * (input.garment === "hoodie" ? 0.43 : 0.44));
  const zoneHeight = Math.round(height * (input.garment === "hoodie" ? 0.31 : 0.34));
  const artwork = await sharp(clean).rotate().resize({ width: zoneWidth, height: zoneHeight, fit: "inside", withoutEnlargement: false }).png().toBuffer();
  const artMeta = await sharp(artwork).metadata();
  const left = Math.round(width * 0.5 - (artMeta.width || zoneWidth) / 2);
  const top = Math.round(height * (input.garment === "hoodie" ? 0.405 : 0.39));
  return base.composite([{ input: artwork, left, top, blend: "over" }]).jpeg({ quality: 91, mozjpeg: true }).toBuffer();
}

export function newDesignId() {
  return crypto.randomUUID();
}
