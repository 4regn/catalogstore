import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { sendEmail } from "../../../../lib/email";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

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
      customSlug,
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
    // customSlug = the affiliate explicitly chose their referral code. It must
    // be available as-is — we error rather than silently renaming it, since
    // the whole point is a code they picked (their brand, their handle).
    let slug: string;
    if (customSlug) {
      const cleaned = String(customSlug).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
      if (cleaned.length < 2) {
        return NextResponse.json(
          { error: "Custom referral code must be at least 2 characters (letters, numbers, - or _)." },
          { status: 400 }
        );
      }
      const { data: slugTaken } = await getAdmin()
        .from("affiliates")
        .select("id")
        .eq("slug", cleaned)
        .maybeSingle();
      if (slugTaken) {
        return NextResponse.json(
          { error: "That referral code is already taken — try another one." },
          { status: 409 }
        );
      }
      slug = cleaned;
    } else {
      // Auto-generated from full name: silently suffix until unique.
      let base = requestedSlug || "user";
      let candidateSlug = base;
      let suffix = 1;
      while (true) {
        const { data: slugTaken } = await getAdmin()
          .from("affiliates")
          .select("id")
          .eq("slug", candidateSlug)
          .maybeSingle();
        if (!slugTaken) break;
        suffix += 1;
        candidateSlug = `${base}${suffix}`;
        if (suffix > 99) {
          candidateSlug = `${base}-${Date.now().toString(36)}`;
          break;
        }
      }
      slug = candidateSlug;
    }

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
    const emailVerificationToken = crypto.randomUUID();
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
      email_verification_token: emailVerificationToken,
      email_verification_sent_at: new Date().toISOString(),
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

    // ─── 6. SEND WELCOME + VERIFICATION EMAIL (Resend) ────
    // Verification is separate from Supabase Auth's own email_confirm
    // (already true above, so they can log in immediately) -- it gates
    // withdrawals specifically (affiliates.email_verified), so a signup
    // typo'd email can't collect a real payout. Non-blocking: a failed
    // send shouldn't fail the signup itself, same reasoning as every
    // other notify-*-style call in this codebase.
    const verifyUrl = `${APP_ORIGIN}/api/affiliate/verify-email?token=${emailVerificationToken}`;
    sendEmail({
      to: email,
      subject: "Welcome to the CatalogStore Affiliate Program",
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
          <h2 style="margin:0 0 12px">Welcome, ${fullName.split(" ")[0] || fullName}!</h2>
          <p style="margin:0 0 16px;line-height:1.6">Your affiliate account is ready. Your referral link:</p>
          <p style="margin:0 0 20px"><a href="https://catalogstore.co.za/?ref=${slug}" style="color:#ff6b35;font-weight:600">catalogstore.co.za/?ref=${slug}</a></p>
          <p style="margin:0 0 16px;line-height:1.6">One more step before you can request a withdrawal: confirm this is really your email address.</p>
          <p style="margin:0 0 20px"><a href="${verifyUrl}" style="display:inline-block;padding:12px 28px;background:#ff6b35;color:#fff;text-decoration:none;border-radius:100px;font-weight:700">Verify my email</a></p>
          <p style="margin:0;font-size:13px;color:#666">If that button doesn't work, paste this link into your browser: ${verifyUrl}</p>
        </div>
      `,
    }).catch(() => {});

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
