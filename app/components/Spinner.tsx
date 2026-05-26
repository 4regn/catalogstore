"use client";

/* Shared loading spinner. Use across editor, dashboard, checkout, etc. so
   every loading state looks the same instead of each component inventing
   its own circle. */

interface SpinnerProps {
  size?: number;
  color?: string;
  /* Optional label that shows below the spinner */
  label?: string;
  /* Fills the parent — for full-page loading screens */
  fullscreen?: boolean;
  /* Background when fullscreen. Defaults to the site's near-black. */
  background?: string;
}

export default function Spinner({
  size = 32,
  color = "#ff6b35",
  label,
  fullscreen = false,
  background = "#030303",
}: SpinnerProps) {
  const ring = (
    <>
      <div
        role="status"
        aria-label={label || "Loading"}
        style={{
          width: size,
          height: size,
          border: `${Math.max(2, Math.round(size / 14))}px solid rgba(255,255,255,0.08)`,
          borderTopColor: color,
          borderRadius: "50%",
          animation: "cs-spin 0.9s linear infinite",
        }}
      />
      {label && (
        <div style={{
          marginTop: 14,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(245,245,245,0.4)",
          fontFamily: "'Schibsted Grotesk', sans-serif",
        }}>
          {label}
        </div>
      )}
      <style>{`@keyframes cs-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );

  if (!fullscreen) return ring;

  return (
    <div
      style={{
        minHeight: "100vh",
        background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
      }}
    >
      {ring}
    </div>
  );
}
