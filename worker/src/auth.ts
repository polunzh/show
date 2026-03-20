import { RATE_LIMIT_PER_HOUR } from "./constants.ts";
import type { Env } from "./types.ts";

export function hasToken(env: Env): boolean {
  return typeof env.DEPLOY_TOKEN === "string" && env.DEPLOY_TOKEN.length > 0;
}

export async function validateToken(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get("Authorization");
  if (!header) return false;

  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return false;

  const provided = parts[1];
  const expected = env.DEPLOY_TOKEN;

  // Constant-time comparison via SHA-256 digest to avoid leaking token length
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);

  const aBytes = new Uint8Array(a);
  const bBytes = new Uint8Array(b);
  let mismatch = 0;
  for (let i = 0; i < aBytes.length; i++) {
    mismatch |= aBytes[i] ^ bBytes[i];
  }
  return mismatch === 0;
}

function getClientIP(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

function getRateLimitKey(ip: string): string {
  const hour = Math.floor(Date.now() / 3_600_000);
  return `ratelimit:${ip}:${hour}`;
}

// NOTE: KV-based rate limiting has an inherent TOCTOU race — concurrent requests
// may read the same count before any write lands. This is a soft limit; a burst
// could exceed RATE_LIMIT_PER_HOUR by a small factor. Acceptable for the current
// scale. For strict enforcement, migrate to Durable Objects or the Rate Limiting binding.
export async function checkRateLimit(
  request: Request,
  kv: KVNamespace,
): Promise<{ allowed: boolean; remaining: number }> {
  const ip = getClientIP(request);
  if (ip === "unknown") {
    return { allowed: false, remaining: 0 };
  }
  const key = getRateLimitKey(ip);

  const current = parseInt((await kv.get(key)) ?? "0", 10);
  if (current >= RATE_LIMIT_PER_HOUR) {
    return { allowed: false, remaining: 0 };
  }

  await kv.put(key, String(current + 1), { expirationTtl: 3600 });
  return { allowed: true, remaining: RATE_LIMIT_PER_HOUR - current - 1 };
}

export function unauthorizedResponse(requestId: string): Response {
  return Response.json(
    { error: "UNAUTHORIZED", message: "Invalid or missing deploy token", requestId },
    { status: 401 },
  );
}

export function rateLimitedResponse(requestId: string): Response {
  return Response.json(
    {
      error: "RATE_LIMITED",
      message: `Upload limit exceeded (${RATE_LIMIT_PER_HOUR} per hour). Try again later.`,
      requestId,
    },
    { status: 429, headers: { "Retry-After": "3600" } },
  );
}
