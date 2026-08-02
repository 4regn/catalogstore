import SetlaAdminClient from "./SetlaAdminClient";

export const dynamic = "force-dynamic";

// No seller/slug lookup -- SETLA admin is cross-store, auth alone gates it.
export default function SetlaAdminPage() {
  return <SetlaAdminClient />;
}
