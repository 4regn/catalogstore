import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { getVercelDomainStatus } from "../../../../lib/vercel-domains";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("domains-status:" + ip, 20, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { access_token } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${access_token}` } }, auth: { persistSession: false } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const sellerId = userData.user.id;

    const { data: seller } = await supabase.from("sellers").select("custom_domain").eq("id", sellerId).single();
    if (!seller?.custom_domain) return NextResponse.json({ status: null });

    let status;
    try {
      status = await getVercelDomainStatus(seller.custom_domain);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Couldn't check domain status." }, { status: 502 });
    }

    const dbStatus = status.verified && !status.misconfigured ? "verified" : status.misconfigured ? "misconfigured" : "pending";
    await supabase.from("sellers").update({ custom_domain_status: dbStatus }).eq("id", sellerId);

    return NextResponse.json({ status });
  } catch (err) {
    console.error("Domain status error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
