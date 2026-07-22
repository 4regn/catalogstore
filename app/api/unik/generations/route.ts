import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getClientIP, rateLimit } from "../../../../lib/rate-limit";
import { requireUnikCustomer } from "../../../../lib/unik-customer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ipLimit = rateLimit(`unik-generation:${getClientIP(req)}`, 12, 60);
  if (!ipLimit.allowed) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });

  const auth = await requireUnikCustomer(req);
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;
  const { data, error } = await getAdmin().rpc("reserve_unik_generation", {
    p_seller_id: seller.id,
    p_auth_user_id: user.id,
  });
  const reservation = Array.isArray(data) ? data[0] : null;
  if (error) return NextResponse.json({ error: "Could not reserve a generation" }, { status: 500 });
  if (!reservation?.attempt_id) {
    return NextResponse.json({ error: "You have no generation slots available right now. Your successful generations reset on a rolling 24-hour basis.", limit: 3, used: reservation?.used_count || 0, remaining: 0 }, { status: 429 });
  }

  return NextResponse.json({
    attempt: { id: reservation.attempt_id, status: "started", created_at: new Date().toISOString() },
    limit: 3,
    used: reservation.used_count || 0,
    remaining: reservation.remaining_count,
  }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUnikCustomer(req);
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const attemptId = String(body.attemptId || "");
  const status = body.status === "failed" ? "failed" : "succeeded";
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return NextResponse.json({ error: "Invalid generation" }, { status: 400 });

  const admin = getAdmin();
  const { data: attempt, error } = await admin.from("unik_generation_attempts")
    .update({ status, completed_at: new Date().toISOString(), error_code: status === "failed" ? String(body.errorCode || "generation_failed").slice(0, 80) : null })
    .eq("id", attemptId).eq("seller_id", seller.id).eq("auth_user_id", user.id)
    .in("status", ["started", "processing"])
    .select("id, status, completed_at").maybeSingle();
  if (error || !attempt) return NextResponse.json({ error: "Generation was not found or already completed" }, { status: 409 });

  let design = null;
  if (status === "succeeded" && body.design && typeof body.design === "object") {
    const d = body.design;
    const { data } = await admin.from("unik_designs").insert({
      seller_id: seller.id,
      auth_user_id: user.id,
      generation_attempt_id: attemptId,
      source: "ai-studio",
      status: "generated",
      name: String(d.name || "UNIK AI Design").slice(0, 160),
      garment: String(d.garment || "").slice(0, 40) || null,
      colour: String(d.colour || "").slice(0, 40) || null,
      size: String(d.size || "").slice(0, 20) || null,
      style: String(d.style || "").slice(0, 80) || null,
      options: d.options && typeof d.options === "object" ? d.options : {},
      preview_url: typeof d.previewUrl === "string" ? d.previewUrl.slice(0, 1000) : null,
      mockup_url: typeof d.mockupUrl === "string" ? d.mockupUrl.slice(0, 1000) : null,
    }).select("id, status, created_at").single();
    design = data;
  }

  return NextResponse.json({ attempt, design }, { headers: { "Cache-Control": "private, no-store" } });
}
