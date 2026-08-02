import SetlaAdminLoginClient from "./SetlaAdminLoginClient";

export const dynamic = "force-dynamic";

// No seller/slug lookup, unlike Brand Manager/Partner login -- SETLA is
// cross-store, not scoped to a single seller's route tree.
export default function SetlaAdminLoginPage() {
  return <SetlaAdminLoginClient />;
}
