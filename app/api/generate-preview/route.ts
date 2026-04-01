import { NextRequest, NextResponse } from "next/server";

const DAILY_LIMIT = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetsIn: number } {
  const now = Date.now();
  const resetAt = now + 24 * 60 * 60 * 1000; // 24 hours
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: DAILY_LIMIT - 1, resetsIn: 24 * 60 * 60 };
  }

  if (entry.count >= DAILY_LIMIT) {
    const resetsIn = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, resetsIn };
  }

  entry.count++;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count, resetsIn: Math.ceil((entry.resetAt - now) / 1000) };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Preview service not configured." }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const fingerprint = req.headers.get("x-device-fingerprint") ?? null;

  // Check both IP and device fingerprint — whichever hits the limit first blocks
  const ipResult = checkRateLimit(`ip:${ip}`);
  const fpResult = fingerprint ? checkRateLimit(`fp:${fingerprint}`) : { allowed: true, remaining: DAILY_LIMIT, resetsIn: 0 };

  if (!ipResult.allowed || !fpResult.allowed) {
    const result = !ipResult.allowed ? ipResult : fpResult;
    const hours = Math.floor(result.resetsIn / 3600);
    const mins = Math.floor((result.resetsIn % 3600) / 60);
    return NextResponse.json({
      error: `Daily limit reached. You've used all ${DAILY_LIMIT} free previews for today.`,
      resetsIn: result.resetsIn,
      resetsMessage: `Resets in ${hours}h ${mins}m`,
      limitReached: true,
    }, { status: 429 });
  }

  // Return remaining count with the response
  const remaining = Math.min(ipResult.remaining, fpResult.remaining);

  let body: {
    images: { base64: string; mediaType: string }[];
    template: string;
    brandColor?: string;
    brandDescription?: string;
    brandName?: string;
    storeCategory?: string;
    bannerImage?: { base64: string; mediaType: string } | null;
  };

  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const { images, brandColor, brandDescription, brandName, storeCategory, bannerImage } = body;

  if (!images || !Array.isArray(images) || images.length < 4)
    return NextResponse.json({ error: "Please upload at least 4 product photos." }, { status: 400 });
  if (images.length > 10)
    return NextResponse.json({ error: "Maximum 10 photos allowed." }, { status: 400 });

  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
  for (const img of images) {
    if (!allowed.includes(img.mediaType)) return NextResponse.json({ error: "Only JPEG, PNG, WebP or GIF allowed." }, { status: 400 });
    if (img.base64.length > 7_000_000) return NextResponse.json({ error: "Images too large. Max 5MB each." }, { status: 400 });
  }

  const bannerContent = bannerImage ? [{
    type: "image" as const,
    source: { type: "base64" as const, media_type: normalizeType(bannerImage.mediaType) as "image/jpeg"|"image/png"|"image/webp"|"image/gif", data: bannerImage.base64 },
  }] : [];

  // Normalize HEIC/HEIF to jpeg for Anthropic API compatibility
  const normalizeType = (t: string) => (t === "image/heic" || t === "image/heif") ? "image/jpeg" : t;

  const imageContent = images.slice(0, 6).map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.mediaType as "image/jpeg"|"image/png"|"image/webp"|"image/gif", data: img.base64 },
  }));

  const accentColor = brandColor ?? "#ff6b35";

  const isCrown = body.template === "crown";
  const prompt = `You are helping a South African seller build a store preview on CatalogStore.

${bannerImage ? "The FIRST image is the store banner/cover photo. The remaining images are product photos." : "All images are product photos."}

SELLER INFO:
- Brand name: ${brandName ? `"${brandName}" — USE THIS EXACT NAME. Do not add any words to it.` : "Not provided — generate a short punchy name from the products."}
- Store category: ${storeCategory || "Not specified — infer from products"}
- Brand accent color: ${accentColor}
- Brand description: ${brandDescription || "Not provided — infer from products"}

Analyse each product photo carefully. Look at the style, quality, and type of each product.

Return ONLY raw JSON — no markdown, no code blocks, no extra text:

{
  "storeName": "${brandName ? brandName : "SHORT PUNCHY NAME IN CAPS (2-3 words max)"}",
  "tagline": "${isCrown ? "Elegant, poetic tagline under 6 words — think luxury editorial, e.g. Wear your crown. or Built for the bold." : "Compelling tagline under 8 words that matches the brand vibe"}",
  "storeSlug": "${brandName ? brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : "lowercase-hyphenated-name"}",
  "brandColor": "${accentColor}",
  "products": [
    {
      "name": "Product name (2-4 words, based on what you see in the photo)",
      "price": "RXX (realistic South African rand price for this type of product)",
      "category": "Exact visual category e.g. Tees, Jackets, Caps, Sneakers, Dresses, Accessories, Hoodies"
    }
  ],
  "collections": [
    {
      "name": "Collection name (the category name)",
      "productIndexes": [0, 1]
    }
  ],
  "aboutText": "${isCrown ? "2-3 sentences of refined, editorial brand copy. Sophisticated tone — think luxury brand website. Do NOT use the description verbatim. No hype, no exclamation marks. Example: 'Built for those who believe in the art of dressing well. Every piece is sourced with intention and worn with purpose.'" : "2-3 sentences of polished brand copy written like a real brand — do NOT copy the description verbatim, rewrite it in a compelling, professional tone"}",
  "insight1": { "label": "Style", "value": "One sentence about the aesthetic vibe" },
  "insight2": { "label": "Target Market", "value": "One sentence about who buys these" },
  "insight3": { "label": "Tip", "value": "One actionable sales tip for this product type in South Africa" }
}

STRICT RULES:
- storeName must be EXACTLY "${brandName || "a short generated name"}" — no additions, no changes
- storeSlug must be derived ONLY from the brand name
- Generate exactly ${Math.min(images.length, 6)} products (one per product photo, in order${bannerImage ? " — skip the first banner image" : ""})
- Group products into collections by visual category — if you see tees AND jackets, make 2 separate collections
- productIndexes are 0-based indexes into the products array
- brandColor must be exactly: "${accentColor}"
- aboutText must be rewritten as polished brand copy — never copy the seller description word for word
- Prices must be realistic for the South African market based on the product type and quality`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        messages: [{ role: "user", content: [...bannerContent, ...imageContent, { type: "text", text: prompt }] }],
      }),
    });

    if (!res.ok) {
      console.error("Anthropic error:", await res.text());
      return NextResponse.json({ error: "AI service unavailable. Please try again." }, { status: 502 });
    }

    const data = await res.json();
    const raw = (data.content?.[0]?.text ?? "").replace(/```json|```/g, "").trim();

    let storeData;
    try { storeData = JSON.parse(raw); }
    catch { return NextResponse.json({ error: "AI returned unexpected response. Try again." }, { status: 500 }); }

    if (!storeData.storeName || !storeData.tagline || !storeData.storeSlug || !Array.isArray(storeData.products) || !storeData.products.length)
      return NextResponse.json({ error: "AI returned incomplete data. Try again." }, { status: 500 });

    // Safety net — force exact brand name if provided
    if (brandName && brandName.trim()) {
      storeData.storeName = brandName.trim().toUpperCase();
      storeData.storeSlug = brandName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    // Ensure brandColor is correct
    storeData.brandColor = accentColor;

    // Ensure collections exists
    if (!Array.isArray(storeData.collections) || !storeData.collections.length) {
      storeData.collections = [{ name: "All Products", productIndexes: storeData.products.map((_: unknown, i: number) => i) }];
    }

    return NextResponse.json({ success: true, data: storeData, remaining, dailyLimit: DAILY_LIMIT });

  } catch (err) {
    console.error("Preview error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
