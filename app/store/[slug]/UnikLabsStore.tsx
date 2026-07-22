type UnikLabsStoreProps = {
  initialSeller: {
    store_name?: string | null;
  };
};

/**
 * Private UNIK storefront bridge.
 *
 * The existing UNIK experience remains intact while its product, order and
 * payment calls are progressively moved onto Catalogstore's backend. Keeping
 * it behind the normal seller route means subscription checks and the private
 * template allowlist still run before anything is displayed.
 */
export default function UnikLabsStore({ initialSeller }: UnikLabsStoreProps) {
  return (
    <main style={{ width: "100%", height: "100dvh", overflow: "hidden", background: "#050505" }}>
      <iframe
        src="/private-templates/unik-labs/index.html"
        title={`${initialSeller.store_name || "UNIK"} storefront`}
        allow="clipboard-read; clipboard-write"
        style={{ width: "100%", height: "100%", display: "block", border: 0, background: "#050505" }}
      />
    </main>
  );
}
