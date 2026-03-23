import { NextRequest, NextResponse } from "next/server";

// Rate limit: max 10 preview generations per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  // ── AUTH CHECK ───────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Preview service not configured." },
      { status: 503 }
    );
  }

  // ── RATE LIMIT ───────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many previews generated. Please try again later." },
      { status: 429 }
    );
  }

  // ── PARSE BODY ───────────────────────────────────────────
  let body: {
    images: { base64: string; mediaType: string }[];
    template: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { images, template } = body;

  if (!images || !Array.isArray(images) || images.length < 4) {
    return NextResponse.json(
      { error: "Please upload at least 4 product photos." },
      { status: 400 }
    );
  }

  if (images.length > 10) {
    return NextResponse.json(
      { error: "Maximum 10 product photos allowed." },
      { status: 400 }
    );
  }

  // ── VALIDATE IMAGE TYPES ─────────────────────────────────
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  for (const img of images) {
    if (!allowedTypes.includes(img.mediaType)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, WebP, or GIF images are allowed." },
        { status: 400 }
      );
    }
    // Basic size check — base64 of 5MB = ~6.8M chars
    if (img.base64.length > 7_000_000) {
      return NextResponse.json(
        { error: "One or more images are too large. Max 5MB per image." },
        { status: 400 }
      );
    }
  }

  // ── BUILD MESSAGE FOR CLAUDE ─────────────────────────────
  // Send up to 6 images to keep token usage reasonable
  const imageContent = images.slice(0, 6).map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      data: img.base64,
    },
  }));

  const prompt = `You are helping a South African seller create a professional online store on CatalogStore.

I am showing you ${Math.min(images.length, 6)} product photos. Analyse them carefully — look at the style, colours, quality, and type of products.

Return ONLY a valid JSON object with NO markdown formatting, NO code blocks, NO explanation. Just raw JSON:

{
  "storeName": "SHORT PUNCHY NAME IN CAPS (2-3 words max)",
  "tagline": "Compelling tagline under 8 words",
  "storeSlug": "lowercase-hyphenated-store-name",
  "products": [
    {
      "name": "Product name (2-4 words)",
      "price": "RXX (realistic South African rand price based on the product type and quality)"
    }
  ],
  "insight1": { "label": "Style", "value": "One sentence about the aesthetic vibe of these products" },
  "insight2": { "label": "Target Market", "value": "One sentence about who would buy these" },
  "insight3": { "label": "Tip", "value": "One actionable tip to maximise sales for this type of product" }
}

Rules:
- Generate exactly ${Math.min(images.length, 6)} products, one per photo in order
- Store name and tagline should feel authentic — South African flavour if the products suit it
- Prices should be realistic for the South African market based on what you see
- Keep all values concise`;

  // ── CALL ANTHROPIC API (server-side only) ────────────────
  try {
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,           // ← API key only ever used here, server-side
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5-20251101",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              ...imageContent,
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const err = await anthropicResponse.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json(
        { error: "AI service temporarily unavailable. Please try again." },
        { status: 502 }
      );
    }

    const anthropicData = await anthropicResponse.json();
    const rawText = anthropicData.content?.[0]?.text ?? "";

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let storeData;
    try {
      storeData = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", cleaned);
      return NextResponse.json(
        { error: "AI returned an unexpected response. Please try again." },
        { status: 500 }
      );
    }

    // ── VALIDATE RESPONSE SHAPE ──────────────────────────────
    if (
      !storeData.storeName ||
      !storeData.tagline ||
      !storeData.storeSlug ||
      !Array.isArray(storeData.products) ||
      storeData.products.length === 0
    ) {
      return NextResponse.json(
        { error: "AI returned incomplete data. Please try again." },
        { status: 500 }
      );
    }

    // Return only the AI-generated data — no keys, no internals
    return NextResponse.json({ success: true, data: storeData });

  } catch (err) {
    console.error("Generate preview error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}