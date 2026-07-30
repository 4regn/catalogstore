type UnikLabsStoreProps = {
  initialSeller: {
    store_name?: string | null;
    tagline?: string | null;
    description?: string | null;
  };
};

const DEFAULT_DESCRIPTION =
  "UNIK Labs turns your own photos into custom AI-designed streetwear. Pick a style, upload your photos, and we print and ship a one-of-one tee or hoodie made just for you, anywhere in South Africa.";

/**
 * Private UNIK storefront bridge.
 *
 * The existing UNIK experience remains intact while its product, order and
 * payment calls are progressively moved onto Catalogstore's backend. Keeping
 * it behind the normal seller route means subscription checks and the private
 * template allowlist still run before anything is displayed.
 *
 * The real storefront markup lives in the static HTML loaded into the
 * iframe above, so this document -- the one Google's OAuth consent-screen
 * branding review actually visits -- previously rendered as an empty shell
 * with nothing but the iframe. The footer strip below is real, visible
 * content (name, description, privacy/terms links) rather than sr-only
 * text, kept as a slim single line so it doesn't compress the storefront's
 * own hero.
 */
export default function UnikLabsStore({ initialSeller }: UnikLabsStoreProps) {
  const name = initialSeller.store_name || "UNIK Labs";
  const description = initialSeller.tagline || initialSeller.description || DEFAULT_DESCRIPTION;

  return (
    <main
      style={{
        width: "100%",
        height: "100dvh",
        overflow: "hidden",
        background: "#050505",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <iframe
        src="/private-templates/unik-labs/index.html"
        title={`${name} storefront`}
        allow="clipboard-read; clipboard-write"
        style={{ width: "100%", flex: "1 1 auto", display: "block", border: 0, background: "#050505" }}
      />
      <div
        style={{
          flex: "0 0 auto",
          padding: "4px 14px",
          background: "#050505",
          borderTop: "1px solid rgba(255,255,255,.08)",
          fontFamily: "Arial, sans-serif",
          color: "rgba(255,255,255,.45)",
          lineHeight: 1.5,
          fontSize: 9,
        }}
      >
        <h1 style={{ display: "inline", margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>
          {name}
        </h1>
        <span style={{ marginLeft: 8 }}>{description}</span>
        {/* Google's OAuth branding review explicitly requires a visible
            homepage link to the privacy policy, matching the URL configured
            on the consent screen -- the one in the iframe's own footer
            doesn't count since it isn't part of this document. */}
        <a href="/privacy" style={{ marginLeft: 10, color: "rgba(255,255,255,.7)" }}>
          Privacy Policy
        </a>
        <a href="/terms" style={{ marginLeft: 8, color: "rgba(255,255,255,.7)" }}>
          Terms of Service
        </a>
      </div>
    </main>
  );
}
