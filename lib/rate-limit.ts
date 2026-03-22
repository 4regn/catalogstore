// Simple in-memory rate limiter for Vercel serverless
// Resets when function cold-starts, but catches burst abuse

const requests = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, maxRequests: number, windowSeconds: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = requests.get(key);

  // Clean old entries periodically
  if (requests.size > 10000) {
    for (const [k, v] of requests) {
      if (v.resetAt < now) requests.delete(k);
    }
  }

  if (!entry || entry.resetAt < now) {
    requests.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count };
}

export function getClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const real = req.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || real || "unknown";
}