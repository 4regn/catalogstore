// Thin wrapper around Vercel's REST API for adding/checking/removing custom
// domains on this project. Requires two environment variables to actually
// work in production:
//   VERCEL_API_TOKEN  -- a Vercel personal/team access token with permission
//                        to manage domains on this project
//   VERCEL_PROJECT_ID -- this project's ID (Project Settings -> General)
//   VERCEL_TEAM_ID    -- optional, only needed if the project lives under a
//                        Vercel team rather than a personal account
//
// Until those are set, every function here throws a clear error rather than
// silently failing -- the Domains page surfaces that as "not configured yet"
// instead of a confusing generic failure.

const VERCEL_API = "https://api.vercel.com";

function requireEnv() {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    throw new Error(
      "Custom domain connection isn't configured yet -- VERCEL_API_TOKEN and VERCEL_PROJECT_ID need to be set in the environment."
    );
  }
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID || undefined };
}

function withTeam(path: string, teamId?: string) {
  if (!teamId) return `${VERCEL_API}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${VERCEL_API}${path}${sep}teamId=${encodeURIComponent(teamId)}`;
}

export type VercelDomainStatus = {
  domain: string;
  verified: boolean;
  misconfigured: boolean;
  // DNS records the seller needs to add at their own registrar. Populated
  // when the domain isn't verified yet.
  verificationRecords: { type: string; domain: string; value: string }[];
  requiredDnsRecords: { type: "A" | "CNAME"; name: string; value: string }[];
};

// Adds a domain to the Vercel project. Safe to call again for a domain
// that's already attached (Vercel returns its current state).
export async function addVercelDomain(domain: string): Promise<VercelDomainStatus> {
  const { token, projectId, teamId } = requireEnv();
  const res = await fetch(withTeam(`/v10/projects/${projectId}/domains`, teamId), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: domain }),
  });
  const data = await res.json();
  if (!res.ok && data?.error?.code !== "domain_already_in_use") {
    throw new Error(data?.error?.message || `Vercel rejected domain "${domain}"`);
  }
  return getVercelDomainStatus(domain);
}

// Pulls current verification + misconfiguration state for a domain already
// attached to the project.
export async function getVercelDomainStatus(domain: string): Promise<VercelDomainStatus> {
  const { token, projectId, teamId } = requireEnv();

  const [domainRes, configRes] = await Promise.all([
    fetch(withTeam(`/v9/projects/${projectId}/domains/${domain}`, teamId), {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(withTeam(`/v6/domains/${domain}/config`, teamId), {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  const domainData = await domainRes.json();
  const configData = await configRes.json();

  if (!domainRes.ok) {
    throw new Error(domainData?.error?.message || `Couldn't find domain "${domain}" on this project.`);
  }

  const isApex = domain.split(".").length === 2;
  return {
    domain,
    verified: !!domainData.verified,
    misconfigured: !!configData?.misconfigured,
    verificationRecords: (domainData.verification || []).map((v: any) => ({
      type: v.type,
      domain: v.domain,
      value: v.value,
    })),
    requiredDnsRecords: isApex
      ? [{ type: "A", name: "@", value: "76.76.21.21" }]
      : [{ type: "CNAME", name: domain.split(".")[0], value: "cname.vercel-dns.com" }],
  };
}

// Detaches a domain from the project. The seller's storefront automatically
// falls back to their catalogstore.co.za subdomain -- that route never
// depended on the custom domain existing.
export async function removeVercelDomain(domain: string): Promise<void> {
  const { token, projectId, teamId } = requireEnv();
  const res = await fetch(withTeam(`/v9/projects/${projectId}/domains/${domain}`, teamId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Couldn't remove domain "${domain}" from Vercel.`);
  }
}

export function isValidCustomDomain(domain: string): boolean {
  const cleaned = domain.trim().toLowerCase();
  // Basic hostname shape check -- at least one dot, valid label characters,
  // no protocol/path. Real validity is ultimately decided by Vercel/DNS.
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(cleaned)
    && !cleaned.endsWith(".catalogstore.co.za")
    && cleaned !== "catalogstore.co.za";
}
