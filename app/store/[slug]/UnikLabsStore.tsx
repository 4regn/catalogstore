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
 * iframe below, so this document -- the one Google's OAuth consent-screen
 * branding review actually visits -- previously rendered as an empty shell
 * with nothing but the iframe. A visually-hidden h1/p pair was tried first
 * and didn't clear review, which means the check looks at what's actually
 * rendered on screen, not just what's present in the DOM -- so this strip
 * is a real, visible line above the iframe rather than sr-only text.
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
      <div
        style={{
          flex: "0 0 auto",
          padding: "10px 18px",
          background: "#050505",
          borderBottom: "1px solid rgba(255,255,255,.1)",
          fontFamily: "Arial, sans-serif",
          color: "#fff",
          lineHeight: 1.4,
        }}
      >
        <h1 style={{ display: "inline", margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
          {name}
        </h1>
        <p style={{ display: "inline", margin: "0 0 0 10px", fontSize: 11, color: "rgba(255,255,255,.65)" }}>
          {description}
        </p>
      </div>
      <iframe
        src="/private-templates/unik-labs/index.html"
        title={`${name} storefront`}
        allow="clipboard-read; clipboard-write"
        style={{ width: "100%", flex: "1 1 auto", display: "block", border: 0, background: "#050505" }}
      />
    </main>
  );
}
