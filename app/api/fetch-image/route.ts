import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("shopify.com") && !parsed.hostname.endsWith("shopifycdn.com")) {
      return NextResponse.json({ error: "Only Shopify image URLs allowed" }, { status: 400 });
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: resp.status });
    }

    const buffer = await resp.arrayBuffer();
    const contentType = resp.headers.get("content-type") || "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
