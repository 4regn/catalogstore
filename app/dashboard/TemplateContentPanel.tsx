"use client";

// Template-aware "Hero & Sections" panel for the dashboard editor. Surfaces
// the per-template text fields the storefront components already read from
// seller.store_config (config.hero_headline, config.cta_subtext, etc.) --
// without this panel, sellers on Heirloom or Crown could never customise
// their hero copy, CTA labels, section headings, newsletter copy, or promise
// items, even though the storefronts fully support it.
//
// Two templates supported in this pass: heirloom + crown. Glass Chrome and
// Soft Luxury show a "coming soon" stub for now -- their storefronts still
// hardcode most of this text, so plumbing them up is a separate effort.

import type { StoreConfig } from "./types";

type Props = {
  template: string;
  config: StoreConfig;
  onChange: (next: StoreConfig) => void;
};

const N = "#ff6b35";

const fieldGroupStyle: React.CSSProperties = {
  padding: "20px 18px",
  background: "rgba(255,255,255,0.015)",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 14,
  marginBottom: 14,
};
const groupTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: N,
  marginBottom: 4,
};
const groupDescStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(245,245,245,0.35)",
  marginBottom: 16,
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(245,245,245,0.4)",
  marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  color: "#f5f5f5",
  fontSize: 13,
  fontFamily: "'Schibsted Grotesk', sans-serif",
  outline: "none",
};
const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 64,
  lineHeight: 1.5,
};
const fieldRowStyle: React.CSSProperties = { marginBottom: 12 };
const smallBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 100,
  color: "rgba(245,245,245,0.35)",
  fontFamily: "'Schibsted Grotesk', sans-serif",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginTop: 4,
};
const removeBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "rgba(255,61,110,0.06)",
  border: "1px solid rgba(255,61,110,0.12)",
  color: "#ff3d6e",
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

function TextField({ label, value, placeholder, hint, onChange, multiline }: {
  label: string;
  value: string | undefined;
  placeholder?: string;
  hint?: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div style={fieldRowStyle}>
      <label style={labelStyle}>{label}</label>
      {multiline ? (
        <textarea
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={textareaStyle}
        />
      ) : (
        <input
          type="text"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
      {hint && <div style={{ fontSize: 10, color: "rgba(245,245,245,0.22)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function TickerRepeater({ value, onChange, placeholder }: {
  value: string[] | undefined;
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const list = value && value.length ? value : [""];
  const set = (i: number, v: string) => {
    const next = [...list];
    next[i] = v;
    onChange(next);
  };
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  const add = () => onChange([...list, ""]);
  return (
    <div>
      {list.map((txt, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            value={txt}
            placeholder={placeholder}
            onChange={(e) => set(i, e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          {list.length > 1 && (
            <button onClick={() => remove(i)} style={removeBtnStyle} type="button">&times;</button>
          )}
        </div>
      ))}
      <button onClick={add} style={smallBtnStyle} type="button">+ Add Message</button>
    </div>
  );
}

function PromiseRepeater({ value, onChange }: {
  value: { num: string; title: string; desc: string }[] | undefined;
  onChange: (v: { num: string; title: string; desc: string }[]) => void;
}) {
  const list = value && value.length ? value : [
    { num: "01", title: "Quality Materials", desc: "Sourced and inspected by hand before they ship." },
    { num: "02", title: "Fast Dispatch", desc: "Orders leave the studio within 48 hours." },
    { num: "03", title: "Easy Returns", desc: "14 days to change your mind, no questions." },
    { num: "04", title: "Secure Payment", desc: "Card, EFT, Apple Pay, or WhatsApp." },
  ];
  const set = (i: number, patch: Partial<{ num: string; title: string; desc: string }>) => {
    const next = [...list];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  const add = () => onChange([...list, { num: String(list.length + 1).padStart(2, "0"), title: "", desc: "" }]);
  return (
    <div>
      {list.map((it, i) => (
        <div key={i} style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
            <input type="text" placeholder="01" value={it.num} onChange={(e) => set(i, { num: e.target.value })} style={{ ...inputStyle, width: 60, textAlign: "center" }} />
            <input type="text" placeholder="Title" value={it.title} onChange={(e) => set(i, { title: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            {list.length > 1 && (
              <button onClick={() => remove(i)} style={removeBtnStyle} type="button">&times;</button>
            )}
          </div>
          <textarea placeholder="Description shown under the title" value={it.desc} onChange={(e) => set(i, { desc: e.target.value })} rows={2} style={textareaStyle} />
        </div>
      ))}
      {list.length < 6 && <button onClick={add} style={smallBtnStyle} type="button">+ Add Promise</button>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// HEIRLOOM PANEL
function HeirloomPanel({ config, onChange }: { config: StoreConfig; onChange: (c: StoreConfig) => void }) {
  const set = (patch: Partial<StoreConfig>) => onChange({ ...config, ...patch });
  return (
    <>
      <div style={fieldGroupStyle}>
        <div style={groupTitleStyle}>Hero Section</div>
        <div style={groupDescStyle}>The headline, body, and CTA at the very top of your store. Leave a field empty to use the default.</div>
        <TextField label="Hero eyebrow (release tag)" value={config.hero_index} placeholder="e.g. 01 — The Edit" onChange={(v) => set({ hero_index: v })} />
        <TextField label="Hero label" value={config.hero_label} placeholder="e.g. Pick of the Week" onChange={(v) => set({ hero_label: v })} />
        <TextField label="Hero headline" value={config.hero_headline} placeholder="e.g. Built to outlast the season." multiline onChange={(v) => set({ hero_headline: v })} hint="Use a line break for the visual stack. Use the word you want italicised inside double underscores: __outlast__." />
        <TextField label="Hero body" value={config.hero_body} placeholder="Short paragraph describing what makes this drop different." multiline onChange={(v) => set({ hero_body: v })} />
        <TextField label="Primary CTA button" value={config.hero_cta_primary} placeholder="e.g. Shop the Drop" onChange={(v) => set({ hero_cta_primary: v })} />
        <TextField label="Secondary CTA button" value={config.hero_cta_secondary} placeholder="e.g. Join Waitlist" onChange={(v) => set({ hero_cta_secondary: v })} />
      </div>

      <div style={fieldGroupStyle}>
        <div style={groupTitleStyle}>Ticker</div>
        <div style={groupDescStyle}>Scrolling messages between the hero and the product grid. 3–5 short lines work best.</div>
        <TickerRepeater value={config.ticker_texts} onChange={(v) => set({ ticker_texts: v })} placeholder="e.g. Free Delivery Over R800" />
      </div>

      <div style={fieldGroupStyle}>
        <div style={groupTitleStyle}>Flash-Sale Strip</div>
        <div style={groupDescStyle}>Label + title above the discounted products row.</div>
        <TextField label="Flash sale label" value={config.flash_sale_label} placeholder="e.g. Limited Time" onChange={(v) => set({ flash_sale_label: v })} />
        <TextField label="Flash sale title" value={config.flash_sale_title} placeholder="e.g. Flash Sale" onChange={(v) => set({ flash_sale_title: v })} />
      </div>

      <div style={fieldGroupStyle}>
        <div style={groupTitleStyle}>Newsletter Block</div>
        <div style={groupDescStyle}>Email-capture section near the bottom of the store. Skip if you don&apos;t collect emails.</div>
        <TextField label="Newsletter label" value={config.newsletter_label} placeholder="e.g. Stay Posted" onChange={(v) => set({ newsletter_label: v })} />
        <TextField label="Newsletter title" value={config.newsletter_title} placeholder="e.g. First in line for the next drop." onChange={(v) => set({ newsletter_title: v })} />
        <TextField label="Newsletter body" value={config.newsletter_sub} placeholder="What sellers receive when they sign up." multiline onChange={(v) => set({ newsletter_sub: v })} />
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────
// CROWN PANEL
function CrownPanel({ config, onChange }: { config: StoreConfig; onChange: (c: StoreConfig) => void }) {
  const set = (patch: Partial<StoreConfig>) => onChange({ ...config, ...patch });
  return (
    <>
      <div style={fieldGroupStyle}>
        <div style={groupTitleStyle}>Hero Section</div>
        <div style={groupDescStyle}>The line above the store name in the dark hero. Tagline + description below it come from the main fields.</div>
        <TextField label="Hero subtext" value={config.hero_subtext} placeholder="e.g. Premium Hair Collection · SA Delivered" onChange={(v) => set({ hero_subtext: v })} />
      </div>

      <div style={fieldGroupStyle}>
        <div style={groupTitleStyle}>Texture / Category Strip</div>
        <div style={groupDescStyle}>The circular strip below the hero. Shown as &quot;Shop by Texture&quot; by default.</div>
        <TextField label="Strip title" value={config.circle_title} placeholder="e.g. Shop by Texture" onChange={(v) => set({ circle_title: v })} />
        <TextField label="Strip subtitle" value={config.circle_subtitle} placeholder="e.g. Find your signature look" onChange={(v) => set({ circle_subtitle: v })} />
      </div>

      <div style={fieldGroupStyle}>
        <div style={groupTitleStyle}>Section Labels</div>
        <div style={groupDescStyle}>Eyebrow + heading shown above each main section of the store.</div>
        <TextField label="Products eyebrow" value={config.products_label} placeholder="e.g. The Edit" onChange={(v) => set({ products_label: v })} />
        <TextField label="Products heading" value={config.products_heading} placeholder="e.g. Latest arrivals" onChange={(v) => set({ products_heading: v })} />
        <TextField label="Collections eyebrow" value={config.coll_label} placeholder="e.g. Featured Collections" onChange={(v) => set({ coll_label: v })} />
        <TextField label="Collections subtitle" value={config.coll_subtitle} placeholder="e.g. Find your signature look" onChange={(v) => set({ coll_subtitle: v })} />
        <TextField label="About-section eyebrow" value={config.about_label} placeholder="e.g. Our Story" onChange={(v) => set({ about_label: v })} />
      </div>

      <div style={fieldGroupStyle}>
        <div style={groupTitleStyle}>Closing CTA Banner</div>
        <div style={groupDescStyle}>Big call-to-action above the footer.</div>
        <TextField label="CTA headline" value={config.cta_headline} placeholder="e.g. Your next look starts here" onChange={(v) => set({ cta_headline: v })} />
        <TextField label="CTA subtext" value={config.cta_subtext} placeholder="Short copy under the headline." multiline onChange={(v) => set({ cta_subtext: v })} />
      </div>

      <div style={fieldGroupStyle}>
        <div style={groupTitleStyle}>Ticker</div>
        <div style={groupDescStyle}>Scrolling messages above the hero. 3–4 short lines work best.</div>
        <TickerRepeater value={config.ticker_texts} onChange={(v) => set({ ticker_texts: v })} placeholder="e.g. FREE DELIVERY ON ORDERS OVER R800" />
      </div>

      <div style={fieldGroupStyle}>
        <div style={groupTitleStyle}>Our Promise (4-item grid)</div>
        <div style={groupDescStyle}>The four numbered cards below the products grid. Each has a number, title, and short description.</div>
        <TextField label="Section eyebrow" value={config.promise_label} placeholder="e.g. Our Promise" onChange={(v) => set({ promise_label: v })} />
        <TextField label="Section title" value={config.promise_title} placeholder="e.g. Built on trust, delivered with care" onChange={(v) => set({ promise_title: v })} />
        <PromiseRepeater value={config.promise_items} onChange={(v) => set({ promise_items: v })} />
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────
export default function TemplateContentPanel({ template, config, onChange }: Props) {
  if (template === "heirloom") return <HeirloomPanel config={config} onChange={onChange} />;
  if (template === "crown") return <CrownPanel config={config} onChange={onChange} />;
  return (
    <div style={{ padding: "20px 18px", background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, textAlign: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(245,245,245,0.6)", marginBottom: 6 }}>Template content editor coming soon</div>
      <div style={{ fontSize: 11, color: "rgba(245,245,245,0.32)", lineHeight: 1.6 }}>
        Hero copy + section headings for this template are still hardcoded. We&apos;re unlocking per-template editing one template at a time.
        Heirloom and Crown are ready now — pick one of those if you want full control over every line of copy.
      </div>
    </div>
  );
}
