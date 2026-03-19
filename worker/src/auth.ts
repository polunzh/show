import type { Env } from "./types.ts";

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

export function unauthorizedResponse(requestId: string): Response {
  return Response.json(
    { error: "UNAUTHORIZED", message: "Invalid or missing deploy token", requestId },
    { status: 401 },
  );
}
