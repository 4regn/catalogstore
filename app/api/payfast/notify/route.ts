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

    // Verify payment status
    if (data.payment_status !== "COMPLETE") {
      return NextResponse.json({ status: "ignored", reason: "payment not complete" });
    }

    // Get order info from custom_str1 (we'll pass order_id there)
    const orderId = data.custom_str1;
    if (!orderId) {
      return NextResponse.json({ status: "error", reason: "no order id" }, { status: 400 });
    }

    // Verify with PayFast (optional but recommended for production)
    // For now, update the order status
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        status: "confirmed",
      })
      .eq("id", orderId);

    if (error) {
      console.error("Failed to update order:", error);
      return NextResponse.json({ status: "error", reason: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("PayFast notify error:", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
