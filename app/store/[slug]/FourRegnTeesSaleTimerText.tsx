"use client";

import { useEffect, useState } from "react";

// Same end instant as FourRegnTeesSaleCountdown/the hero override in
// FourRegnStore.tsx. Deliberately its own tiny, self-contained ticking
// component (own useState/useInterval) rather than one shared "now" value
// lifted into FourRegnStore's own top-level state -- that earlier version
// forced the ENTIRE storefront component (every product card on a
// collection page included) to fully re-render once a second just to
// update this text, which is what made the Oversized Premium Tees
// collection page (many cards, each redoing their own work every render)
// feel like it had hung. Each instance of this component re-renders only
// itself on its own tick, however many of them are on the page at once.
const TEES_SALE_END = new Date("2026-09-01T00:00:00+02:00").getTime();

function useTeesSaleRemaining(): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setRemaining(TEES_SALE_END - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return remaining;
}

function formatCompact(ms: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return days > 0 ? `${days}d ${pad(hours)}h ${pad(minutes)}m` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function FourRegnTeesSaleTimerText({ className }: { className: string }) {
  const remaining = useTeesSaleRemaining();
  if (remaining === null || remaining <= 0) return null;
  return <div className={className}>Flash Sale Ends In {formatCompact(remaining)}</div>;
}
