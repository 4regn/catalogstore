import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const { sellerId, email } = await req.json();

    if (!sellerId || !email)
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });

    const { error } = await getAdmin()
      .from("newsletter_subscribers")
      .upsert(
        { seller_id: sellerId, email: String(email).toLowerCase().trim() },
        { onConflict: "seller_id,email", ignoreDuplicates: true }
      );

    if (error) {
      console.error("Newsletter subscribe error:", error);
      return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Newsletter subscribe error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
