import { RATE_LIMIT_PER_HOUR } from "./constants.ts";
import type { Env } from "./types.ts";

export function hasToken(env: Env): boolean {
  return typeof env.DEPLOY_TOKEN === "string" && env.DEPLOY_TOKEN.length > 0;
}

export function validateToken(request: Request, env: Env): boolean {
  const header = request.headers.get("Authorization");
  if (!header) return false;

  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return false;

  const provided = parts[1];
  const expected = env.DEPLOY_TOKEN;

  if (provided.length !== expected.length) return false;

  // Constant-time comparison via hash
  const encoder = new TextEncoder();
  const a = encoder.encode(provided);
  const b = encoder.encode(expected);

  let mismatch = a.length ^ b.length;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    mismatch |= a[i] ^ b[i];
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

export async function checkRateLimit(
  request: Request,
  kv: KVNamespace,
): Promise<{ allowed: boolean; remaining: number }> {
  const ip = getClientIP(request);
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
