import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
// Server-side admin client (uses service role — bypasses RLS, runs server-only)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fullName,
      email,
      phone,
      password,
      bankName,
      accountNumber,
      accountHolder,
      accountType,
      branchCode,
      slug: requestedSlug,
    } = body;

    // ─── 1. VALIDATE ───────────────────────────────────────
    if (!fullName || !email || !phone || !password)
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    if (password.length < 8)
      return NextResponse.json({ error: "Password too short" }, { status: 400 });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });

    if (!/^(\+27|0)[6-8][0-9]{8}$/.test(phone))
      return NextResponse.json({ error: "Invalid SA phone number" }, { status: 400 });

    if (!accountNumber || accountNumber.length < 6)
      return NextResponse.json({ error: "Invalid account number" }, { status: 400 });

    // ─── 2. CHECK FOR DUPLICATE EMAIL/PHONE ────────────────
    // Block if email/phone already exists as either a SELLER or an AFFILIATE.
    // The spec says: a person cannot be both, to prevent the self-discount exploit.

    // Check sellers table — run as two separate .eq queries so user input is
    // properly parameterized. The previous .or() interpolated raw values into
    // PostgREST filter syntax, which can be broken with a "," or ")".
    const [{ data: sellerByEmail }, { data: sellerByPhone }] = await Promise.all([
      getAdmin().from("sellers").select("id").eq("email", email).maybeSingle(),
      getAdmin().from("sellers").select("id").eq("phone", phone).maybeSingle(),
    ]);
    const existingSeller = sellerByEmail || sellerByPhone;

    if (existingSeller) {
      return NextResponse.json(
        {
          error:
            "This email or phone is already registered as a seller. Affiliates and sellers must use different accounts.",
        },
        { status: 409 }
      );
    }

    // Check affiliates table — same .eq-pair pattern as above for safety
    const [{ data: affByEmail }, { data: affByPhone }] = await Promise.all([
      getAdmin().from("affiliates").select("id").eq("email", email).maybeSingle(),
      getAdmin().from("affiliates").select("id").eq("phone", phone).maybeSingle(),
    ]);
    const existingAffiliate = affByEmail || affByPhone;

    if (existingAffiliate)
      return NextResponse.json(
        { error: "An affiliate account with this email or phone already exists." },
        { status: 409 }
      );

    // ─── 3. RESOLVE A UNIQUE SLUG ─────────────────────────
    let slug = requestedSlug || "";
    if (!slug) slug = "user";
    let candidateSlug = slug;
    let suffix = 1;
    while (true) {
      const { data: slugTaken } = await getAdmin()
        .from("affiliates")
        .select("id")
        .eq("slug", candidateSlug)
        .maybeSingle();
      if (!slugTaken) break;
      suffix += 1;
      candidateSlug = `${slug}${suffix}`;
      if (suffix > 99) {
        candidateSlug = `${slug}-${Date.now().toString(36)}`;
        break;
      }
    }
    slug = candidateSlug;

    // ─── 4. CREATE AUTH USER ──────────────────────────────
    const { data: authData, error: authErr } = await getAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm — gate withdrawals separately via affiliates.email_verified
      user_metadata: { full_name: fullName, role: "affiliate" },
    });

    if (authErr || !authData.user) {
      console.error("Auth error:", authErr);
      return NextResponse.json(
        { error: authErr?.message || "Failed to create user" },
        { status: 500 }
      );
    }

    // ─── 5. CREATE AFFILIATE RECORD ───────────────────────
    const { error: insertErr } = await getAdmin().from("affiliates").insert({
      user_id: authData.user.id,
      slug,
      full_name: fullName,
      email,
      phone,
      bank_name: bankName,
      account_number: accountNumber,
      account_holder: accountHolder,
      account_type: accountType,
      branch_code: branchCode,
      email_verified: false,
      status: "active",
    });

    if (insertErr) {
      // Rollback: delete the auth user we just created
      await getAdmin().auth.admin.deleteUser(authData.user.id);
      console.error("Affiliate insert error:", insertErr);
      return NextResponse.json(
        { error: insertErr.message || "Failed to create affiliate" },
        { status: 500 }
      );
    }

    // ─── 6. SEND VERIFICATION EMAIL (Resend) ──────────────
    // We'll wire this up properly in a later step — for now just log
    // TODO: send verification email + welcome email via Resend

    return NextResponse.json({
      ok: true,
      slug,
      referralLink: `https://catalogstore.co.za/?ref=${slug}`,
    });
  } catch (e: any) {
    console.error("Signup error:", e);
    return NextResponse.json(
      { error: e.message || "Internal error" },
      { status: 500 }
    );
  }
}
