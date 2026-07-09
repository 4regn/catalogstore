import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { addVercelDomain, isValidCustomDomain } from "../../../../lib/vercel-domains";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("domains-connect:" + ip, 5, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { domain, access_token } = await req.json();
    if (!domain || !access_token) return NextResponse.json({ error: "Missing domain or access_token" }, { status: 400 });

    const cleanDomain = String(domain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!isValidCustomDomain(cleanDomain)) {
      return NextResponse.json({ error: "That doesn't look like a valid domain (e.g. yourstore.co.za)." }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${access_token}` } }, auth: { persistSession: false } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const sellerId = userData.user.id;

    const { data: seller } = await supabase.from("sellers").select("subscription_status, subscription_plan").eq("id", sellerId).single();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });
    if (seller.subscription_status === "free") {
      return NextResponse.json({ error: "Custom domains are a Pro plan feature." }, { status: 403 });
    }

    let status;
    try {
      status = await addVercelDomain(cleanDomain);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Couldn't connect that domain." }, { status: 502 });
    }

    const dbStatus = status.verified && !status.misconfigured ? "verified" : status.misconfigured ? "misconfigured" : "pending";
    const { error: updateErr } = await supabase
      .from("sellers")
      .update({ custom_domain: cleanDomain, custom_domain_status: dbStatus })
      .eq("id", sellerId);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error("Domain connect error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
