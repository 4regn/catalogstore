import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { removeVercelDomain } from "../../../../lib/vercel-domains";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("domains-remove:" + ip, 5, 60);
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
    if (!seller?.custom_domain) return NextResponse.json({ success: true });

    try {
      await removeVercelDomain(seller.custom_domain);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Couldn't remove that domain from Vercel." }, { status: 502 });
    }

    // Falls back to the catalogstore.co.za subdomain automatically -- that
    // route never depended on custom_domain being set.
    const { error: updateErr } = await supabase.from("sellers").update({ custom_domain: null, custom_domain_status: null }).eq("id", sellerId);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Domain remove error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
