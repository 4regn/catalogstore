"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";

const SoftLuxury = dynamic(() => import("./SoftLuxuryStore"), { ssr: false });
const GlassChrome = dynamic(() => import("./GlassChromeStore"), { ssr: false });

export default function StoreRouter() {
  const params = useParams();
  const slug = params.slug as string;
  const [template, setTemplate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.from("sellers").select("template").eq("subdomain", slug).single();
      setTemplate(data?.template || "soft-luxury");
      setLoading(false);
    };
    check();
  }, [slug]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#030305" }}>
      <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.06)", borderTopColor: "rgba(255,255,255,0.3)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (template === "glass-futuristic" || template === "glass-chrome") return <GlassChrome />;
  return <SoftLuxury />;
}