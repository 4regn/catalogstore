import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("admin:" + ip, 5, 300);
    if (!rl.allowed) return NextResponse.json({ error: "Too many attempts. Try again in 5 minutes." }, { status: 429 });
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