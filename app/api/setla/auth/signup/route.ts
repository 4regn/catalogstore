import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

const COOKIE = "setla-customer-access";

function setSessionCookie(response: NextResponse, accessToken: string, maxAgeSeconds: number) {
  response.cookies.set(COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

/* Public signup for a SETLA customer. signup.html/login.html are plain
   static pages with no Supabase SDK loaded (unlike the React account
   pages elsewhere in this app), so the whole sign-up-and-sign-in round
   trip happens server-side in this one call: create the auth.users row,
   then immediately mint a real session with the same admin client (this
   works the same way unik/auth/refresh's refreshSession() call already
   does server-side -- signInWithPassword is just another auth.* method
   on the same client, not an admin-only one) and set the cookie, so the
   customer lands straight in apply.html already signed in. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    if (!rateLimit("setla-signup:" + ip, 5, 60).allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const firstName = String(body.firstName || "").trim().slice(0, 80);
    const lastName = String(body.lastName || "").trim().slice(0, 80);
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!firstName || !lastName || !email || !phone || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (!/^(\+27|0)[6-8][0-9]{8}$/.test(phone)) {
      return NextResponse.json({ error: "Enter a valid South African phone number" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords don't match" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: existingCustomer } = await admin.from("setla_customers").select("id").eq("email", email).maybeSingle();
    if (existingCustomer) return NextResponse.json({ error: "An account already exists for this email. Log in instead." }, { status: 409 });

    let authUserId: string;
    let reusedExistingAccount = false;
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${firstName} ${lastName}`.trim(), role: "setla_customer" },
    });
    if (authErr || !created?.user) {
      // Same reasoning as partners/apply/route.ts: this endpoint is public
      // and unauthenticated, so a typed password is never applied to an
      // identity that already existed for some other reason (a UNIK
      // customer account under the same email, most commonly) -- that
      // would let anyone hijack an arbitrary email's account by "signing
      // up" with it. A real reset email goes out instead, and this
      // request can't auto-sign-in (we don't know their real password).
      const message = authErr?.message || "";
      if (!/already.*(registered|exists)|already exists|email_exists/i.test(message)) {
        return NextResponse.json({ error: message || "Could not create your account" }, { status: 500 });
      }
      let match: { id: string } | undefined;
      for (let page = 1; page <= 20 && !match; page++) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr || !list?.users?.length) break;
        match = list.users.find((u) => (u.email || "").toLowerCase() === email);
        if (list.users.length < 1000) break;
      }
      if (!match) return NextResponse.json({ error: "Could not find or create that account" }, { status: 500 });
      authUserId = match.id;
      reusedExistingAccount = true;
      await admin.auth.resetPasswordForEmail(email, { redirectTo: `${new URL(req.url).origin}/setla/reset-password.html` }).catch(() => {});
    } else {
      authUserId = created.user.id;
    }

    const { data: existingByAuthId } = await admin.from("setla_customers").select("id").eq("auth_user_id", authUserId).maybeSingle();
    if (existingByAuthId) return NextResponse.json({ error: "An account already exists for this email. Log in instead." }, { status: 409 });

    const { error: insertErr } = await admin.from("setla_customers").insert({
      auth_user_id: authUserId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
    });
    if (insertErr) {
      if (!reusedExistingAccount) await admin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ error: insertErr.message || "Could not create your account" }, { status: 500 });
    }

    if (reusedExistingAccount) {
      return NextResponse.json({
        success: true,
        reusedExistingAccount: true,
        message: "You already had an account under this email. We've sent a link to set your SETLA password -- check your email, then log in.",
      });
    }

    const { data: signInData, error: signInErr } = await admin.auth.signInWithPassword({ email, password });
    if (signInErr || !signInData.session) {
      // The account exists either way -- just tell them to log in manually
      // rather than fail the whole signup over a sign-in hiccup.
      return NextResponse.json({ success: true, reusedExistingAccount: false, autoLoginFailed: true });
    }

    const response = NextResponse.json({ success: true, reusedExistingAccount: false, refreshToken: signInData.session.refresh_token });
    setSessionCookie(response, signInData.session.access_token, 55 * 60);
    return response;
  } catch (err) {
    console.error("SETLA signup error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
