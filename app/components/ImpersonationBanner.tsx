"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

/* Mounted in the root layout. Reads the cs_impersonating cookie (set
   server-side by /api/admin/impersonate/[id]) and shows a fixed-top
   purple bar with the seller's store name + an "Exit Assist" button.

   We never render anything when the cookie is absent, so legitimate
   sellers don't see this. */

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const row = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="));
  return row ? decodeURIComponent(row.split("=").slice(1).join("=")) : "";
}

export default function ImpersonationBanner() {
  const [sellerId, setSellerId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const id = readCookie("cs_impersonating");
    const email = readCookie("cs_admin_email");
    if (!id) return;
    setSellerId(id);
    setAdminEmail(email);
    /* Best-effort fetch of the store name so the banner reads cleanly */
    (async () => {
      const { data } = await supabase.from("sellers").select("store_name").eq("id", id).single();
      if (data?.store_name) setStoreName(data.store_name);
    })();
  }, []);

  if (!sellerId) return null;

  const handleExit = async () => {
    if (exiting) return;
    setExiting(true);
    try {
      await fetch("/api/admin/impersonate/exit", { method: "POST" });
      /* Sign out of the seller's session so the next page load doesn't
         leak any seller-context queries from the supabase client cache */
      await supabase.auth.signOut();
      /* Send the admin back to /admin where they re-enter the PIN. */
      window.location.href = "/admin";
    } catch {
      setExiting(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      zIndex: 9999,
      background: "linear-gradient(90deg, #6d28d9 0%, #8b5cf6 100%)",
      borderBottom: "1px solid rgba(0,0,0,0.2)",
      padding: "8px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      fontFamily: "'Schibsted Grotesk', sans-serif",
      fontSize: 12,
      fontWeight: 700,
      color: "#fff",
      letterSpacing: "0.04em",
      flexWrap: "wrap",
      boxShadow: "0 2px 12px rgba(109,40,217,0.25)",
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", boxShadow: "0 0 8px #fff", animation: "csImpPulse 2s ease-in-out infinite" }} />
        ADMIN ASSIST · acting as <strong style={{ color: "#fff" }}>{storeName || "seller"}</strong>
        {adminEmail && <span style={{ opacity: 0.7, fontWeight: 500, fontSize: 11 }}>(signed in as {adminEmail})</span>}
      </span>
      <button
        onClick={handleExit}
        disabled={exiting}
        style={{
          padding: "6px 16px",
          background: "rgba(255,255,255,0.18)",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 8,
          color: "#fff",
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: exiting ? "not-allowed" : "pointer",
          opacity: exiting ? 0.6 : 1,
        }}>
        {exiting ? "Exiting…" : "Exit Assist"}
      </button>
      <style>{`@keyframes csImpPulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  );
}
