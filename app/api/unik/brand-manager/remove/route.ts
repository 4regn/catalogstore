import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

/* Revokes a Brand Manager's dashboard access. Only deletes the
   brand_managers row (what actually gates access via
   requireUnikBrandManager) -- the underlying auth.users account is left
   alone, since that identity may be shared with other roles (e.g. the same
   email is also a storefront customer somewhere). To fully swap who has
   access -- testing with your own email, then handing it to the real
   person -- remove the test row here, then invite again with the real
   email; each invite creates its own row. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("brand-manager-remove:" + ip, 10, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { brand_manager_id, access_token } = await req.json();
    if (!brand_manager_id || !access_token) return NextResponse.json({ error: "Missing brand_manager_id or access_token" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${access_token}` } }, auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const admin = getAdmin();
    const { data: seller } = await admin.from("sellers").select("id").eq("id", userData.user.id).maybeSingle();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

    const { data: deleted, error } = await admin
      .from("brand_managers")
      .delete()
      .eq("id", brand_manager_id)
      .eq("seller_id", seller.id)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Brand manager remove error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
