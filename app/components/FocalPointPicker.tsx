"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// Parses either a legacy "top"/"center"/"bottom" keyword or an "X% Y%" pair.
export function parseFocalPoint(value: string): { x: number; y: number } {
  if (value === "top") return { x: 50, y: 0 };
  if (value === "bottom") return { x: 50, y: 100 };
  if (!value || value === "center") return { x: 50, y: 50 };
  const m = value.match(/^([\d.]+)%\s+([\d.]+)%$/);
  if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
  return { x: 50, y: 50 };
}

// Click-or-drag focal point picker: shows the banner at roughly the aspect
// ratio it renders on a real desktop hero, and lets sellers place the exact
// point that should stay visible, instead of guessing from Top/Center/Bottom
// presets. Value is stored as a CSS object-position "X% Y%" string.
export default function FocalPointPicker({ value, onChange, imageUrl }: { value: string; onChange: (v: string) => void; imageUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pos = parseFocalPoint(value);

  const updateFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    onChange(`${x.toFixed(0)}% ${y.toFixed(0)}%`);
  }, [onChange]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => updateFromPoint(e.clientX, e.clientY);
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, updateFromPoint]);

  return (
    <div>
      <div
        ref={containerRef}
        onMouseDown={(e) => { setDragging(true); updateFromPoint(e.clientX, e.clientY); }}
        style={{ position: "relative", width: "100%", aspectRatio: "17 / 9", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)", cursor: imageUrl ? "crosshair" : "default", background: "#0a0a0e", userSelect: "none" }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(245,245,245,0.35)", fontSize: 12, textAlign: "center", padding: 20 }}>Upload a banner above to set its focal point</div>
        )}
        {imageUrl && <>
          <div style={{ position: "absolute", left: `${pos.x}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: `${pos.y}%`, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)", width: 22, height: 22, borderRadius: "50%", border: "2px solid #fff", background: "rgba(255,255,255,0.18)", boxShadow: "0 0 0 1.5px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.45)", pointerEvents: "none" }} />
        </>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{Math.round(pos.x)}% {Math.round(pos.y)}%</span>
        <button onClick={() => onChange("50% 50%")} style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em" }}>Reset to Center</button>
      </div>
    </div>
  );
}
