import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../lib/rate-limit";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = rateLimit("seller-pub:" + ip, 30, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const { data: seller } = await supabase.from("sellers").select("*").eq("subdomain", slug).single();
  if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Strip sensitive keys before sending to client
  const cc = seller.checkout_config || {} as any;
  const safeCheckoutConfig = {
    eft_enabled: !!cc.eft_enabled,
    eft_bank_name: cc.eft_bank_name || "",
    eft_account_number: cc.eft_account_number || "",
    eft_account_name: cc.eft_account_name || "",
    eft_branch_code: cc.eft_branch_code || "",
    eft_account_type: cc.eft_account_type || "",
    eft_instructions: cc.eft_instructions || "",
    payfast_enabled: !!cc.payfast_enabled,
    // merchant_id and merchant_key are NEVER sent to client
    delivery_enabled: cc.delivery_enabled !== false,
    pickup_enabled: !!cc.pickup_enabled,
    pickup_address: cc.pickup_address || "",
    pickup_instructions: cc.pickup_instructions || "",
    shipping_options: cc.shipping_options || [],
  };

  return NextResponse.json({
    id: seller.id,
    store_name: seller.store_name,
    whatsapp_number: seller.whatsapp_number,
    subdomain: seller.subdomain,
    primary_color: seller.primary_color,
    logo_url: seller.logo_url,
    template: seller.template,
    checkout_config: safeCheckoutConfig,
  });
}