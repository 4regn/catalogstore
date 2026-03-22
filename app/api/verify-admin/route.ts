import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    const correctPin = process.env.ADMIN_PIN;
    
    if (!correctPin) {
      return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    }

    if (pin === correctPin) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}