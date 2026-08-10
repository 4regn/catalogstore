import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const MAX_IMAGES = 100;
const MAX_BASE64_LENGTH = 7_000_000;
const BATCH_SIZE = 5;

const normalizeType = (t: string) =>
  t === "image/heic" || t === "image/heif" ? "image/jpeg" : t;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI service not configured." }, { status: 503 });

  // Authenticate seller via Supabase
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { images: { base64: string; mediaType: string }[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const { images } = body;

  if (!images || !Array.isArray(images) || images.length === 0)
    return NextResponse.json({ error: "No images provided." }, { status: 400 });
  if (images.length > MAX_IMAGES)
    return NextResponse.json({ error: `Maximum ${MAX_IMAGES} images allowed.` }, { status: 400 });

  for (const img of images) {
    if (!ALLOWED_TYPES.includes(img.mediaType))
      return NextResponse.json({ error: "Only JPEG, PNG, WebP, GIF, HEIC, or HEIF images allowed." }, { status: 400 });
    if (img.base64.length > MAX_BASE64_LENGTH)
      return NextResponse.json({ error: "Images too large. Max 7MB each." }, { status: 400 });
  }

  try {
    const allProducts: { name: string; price: number; category: string }[] = [];

    // Process images in batches of 5
    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);

      const imageContent = batch.map((img) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: normalizeType(img.mediaType) as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: img.base64,
        },
      }));

      const prompt = `You are analyzing product photos for a South African e-commerce store. For each photo, provide the product name (2-4 words), a realistic price in South African Rand (number only, no R prefix), and a category. Return ONLY raw JSON array.

Format: [{ "name": "Product Name", "price": 299, "category": "Category" }]

Prices should be realistic for the South African market. Generate exactly ${batch.length} products for ${batch.length} images.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1200,
          messages: [{ role: "user", content: [...imageContent, { type: "text", text: prompt }] }],
        }),
      });

      if (!res.ok) {
        console.error("Anthropic error:", await res.text());
        return NextResponse.json({ error: "AI service unavailable. Please try again." }, { status: 502 });
      }

      const data = await res.json();
      const raw = (data.content?.[0]?.text ?? "").replace(/```json|```/g, "").trim();

      let products;
      try { products = JSON.parse(raw); }
      catch { return NextResponse.json({ error: "AI returned unexpected response. Try again." }, { status: 500 }); }

      if (!Array.isArray(products) || products.length === 0)
        return NextResponse.json({ error: "AI returned incomplete data. Try again." }, { status: 500 });

      allProducts.push(...products);
    }

    return NextResponse.json({ success: true, products: allProducts });
  } catch (err) {
    console.error("Bulk import AI error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
