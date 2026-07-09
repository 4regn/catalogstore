"use client";

// Hero CTA destinations -- mirror the type the storefront templates switch
// on. Adding new targets here requires updating the storefront's switch
// statement too. Shared by the dashboard editor and the main dashboard's
// Hero Section controls so both surfaces stay in sync.
export type CtaTarget =
  | { type: "products" }
  | { type: "collection"; collection: string }
  | { type: "url"; url: string }
  | { type: "none" };

export const collectionSlugForCta = (name: string) =>
  name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

/* Lets the seller pick what a hero button does: scroll to products,
   navigate to a specific collection page, open a custom URL, or hide
   the button entirely. Reused for both primary and secondary CTAs.

   `dark` picks which surface's styling to use: the Online Visual Editor
   is dark-only (no theme toggle), while the main dashboard uses CSS
   custom properties that flip with the light/dark theme switch. Passing
   the wrong one here is what caused the "black box in light mode" bug --
   this component was hardcoded dark-only and used from both surfaces. */
export default function CtaTargetPicker({
  target,
  onChange,
  collections,
  dark = true,
}: {
  target: CtaTarget;
  onChange: (t: CtaTarget) => void;
  collections: string[];
  dark?: boolean;
}) {
  const baseInput: React.CSSProperties = dark
    ? {
        width: "100%", padding: "9px 11px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8, color: "#f5f5f5",
        fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif",
        outline: "none",
      }
    : {
        width: "100%", padding: "9px 11px",
        background: "var(--input-bg)",
        border: "1px solid var(--border)",
        borderRadius: 8, color: "var(--text)",
        fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif",
        outline: "none",
      };
  const labelMini: React.CSSProperties = dark
    ? {
        fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "rgba(245,245,245,0.35)",
        display: "block", marginBottom: 5,
      }
    : {
        fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--muted)",
        display: "block", marginBottom: 5,
      };
  const hint: React.CSSProperties = {
    fontSize: 10, marginTop: 4,
    color: dark ? "rgba(245,245,245,0.4)" : "var(--muted-2)",
  };
  return (
    <div>
      <label style={labelMini}>Link to</label>
      <select
        value={target.type}
        onChange={e => {
          const t = e.target.value as CtaTarget["type"];
          if (t === "products") onChange({ type: "products" });
          else if (t === "collection") onChange({ type: "collection", collection: target.type === "collection" ? target.collection : "" });
          else if (t === "url") onChange({ type: "url", url: target.type === "url" ? target.url : "" });
          else onChange({ type: "none" });
        }}
        style={baseInput}
      >
        <option value="products">↓ Scroll to products section</option>
        <option value="collection">Collection page</option>
        <option value="url">Custom URL</option>
        <option value="none">No link — hide button</option>
      </select>

      {target.type === "collection" && (
        <div style={{ marginTop: 8 }}>
          <label style={labelMini}>Collection</label>
          <select
            value={target.collection}
            onChange={e => onChange({ type: "collection", collection: e.target.value })}
            style={baseInput}
          >
            <option value="">— Choose a collection —</option>
            {collections.map(c => (
              <option key={c} value={collectionSlugForCta(c)}>{c}</option>
            ))}
          </select>
          {collections.length === 0 && (
            <div style={hint}>
              Add collections in the dashboard to link to them here.
            </div>
          )}
        </div>
      )}

      {target.type === "url" && (
        <div style={{ marginTop: 8 }}>
          <label style={labelMini}>URL</label>
          <input
            type="url"
            value={target.url}
            placeholder="https://..."
            onChange={e => onChange({ type: "url", url: e.target.value })}
            style={baseInput}
          />
        </div>
      )}
    </div>
  );
}
