import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdmin } from "../../../../../lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

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

    const { data: managers, error } = await admin
      .from("brand_managers")
      .select("id, full_name, email, created_at")
      .eq("seller_id", seller.id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ managers: managers || [] });
  } catch (err) {
    console.error("Brand manager list error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
