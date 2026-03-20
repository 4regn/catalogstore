import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const data: Record<string, string> = {};
    params.forEach((value, key) => { data[key] = value; });

    const sellerId = data.custom_str1;
    const planId = data.custom_str2;
    const paymentStatus = data.payment_status;
    const token = data.token;

    if (!sellerId) {
      return NextResponse.json({ status: "error", reason: "no seller id" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (paymentStatus === "COMPLETE") {
      await supabase.from("sellers").update({
        subscription_status: "active",
        subscription_plan: planId || "starter",
        subscription_started_at: new Date().toISOString(),
        plan: planId || "starter",
        payfast_subscription_token: token || null,
      }).eq("id", sellerId);

      return NextResponse.json({ status: "ok", action: "activated" });
    }

    if (paymentStatus === "CANCELLED") {
      await supabase.from("sellers").update({
        subscription_status: "expired",
      }).eq("id", sellerId);

      return NextResponse.json({ status: "ok", action: "cancelled" });
    }

    return NextResponse.json({ status: "ignored", payment_status: paymentStatus });
  } catch (err) {
    console.error("Subscription notify error:", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
