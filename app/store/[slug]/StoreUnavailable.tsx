type Seller = {
  store_name?: string | null;
  whatsapp_number?: string | null;
  social_links?: { instagram?: string; facebook?: string; tiktok?: string; email?: string } | null;
  logo_url?: string | null;
};

// Quiet, neutral "this store is currently unavailable" page that renders in place
// of the storefront once a seller's subscription has expired. We intentionally don't
// surface why (it's between the seller and us) -- we just give customers a way to
// reach the seller directly so they can find out what's going on.
export default function StoreUnavailable({ seller }: { seller: Seller }) {
  const wa = seller.whatsapp_number?.replace(/[^0-9]/g, "");
  const email = seller.social_links?.email;
  const storeName = seller.store_name || "This store";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafaf7",
        color: "#1a1a1a",
        fontFamily: "'Schibsted Grotesk', -apple-system, system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
      }}
    >
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        {seller.logo_url && (
          <img
            src={seller.logo_url}
            alt={storeName}
            style={{
              width: 64,
              height: 64,
              objectFit: "contain",
              margin: "0 auto 24px",
              opacity: 0.5,
              filter: "grayscale(1)",
            }}
          />
        )}

        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(0,0,0,0.35)",
            marginBottom: 16,
          }}
        >
          {storeName}
        </div>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            margin: "0 0 16px",
          }}
        >
          This store is not available at the moment
        </h1>

        <p style={{ fontSize: 15, color: "rgba(0,0,0,0.55)", lineHeight: 1.5, margin: "0 0 32px" }}>
          Please contact the seller for updates.
        </p>

        {(wa || email) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            {wa && (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  padding: "14px 28px",
                  background: "#1a1a1a",
                  color: "#fff",
                  borderRadius: 100,
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: "none",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  minWidth: 220,
                }}
              >
                Contact on WhatsApp
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                style={{
                  display: "inline-block",
                  padding: "14px 28px",
                  background: "transparent",
                  color: "#1a1a1a",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: 100,
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: "none",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  minWidth: 220,
                }}
              >
                Email Seller
              </a>
            )}
          </div>
        )}

        <p
          style={{
            marginTop: 48,
            fontSize: 11,
            color: "rgba(0,0,0,0.3)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Powered by CatalogStore
        </p>
      </div>
    </div>
  );
}
