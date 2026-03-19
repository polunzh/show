import { MAX_CACHE_AGE, MIME_TYPES } from "./constants.ts";
import { log } from "./logging.ts";
import { getMetadata } from "./metadata.ts";
import type { Env } from "./types.ts";

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot).toLowerCase() : "";
}

function errorPage(title: string, message: string): Response {
  const html = `<!DOCTYPE html>
<html><head><title>${title} — Show</title></head>
<body style="font-family:system-ui;max-width:600px;margin:80px auto;text-align:center">
<h1>${title}</h1>
<p>${message}</p>
<p style="color:#888;font-size:14px">Powered by Show</p>
</body></html>`;

  return new Response(html, {
    status: title === "Service Unavailable" ? 503 : 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handleServe(
  request: Request,
  env: Env,
  requestId: string,
  deploymentId: string,
): Promise<Response> {
  const meta = await getMetadata(env.SHOW_META, deploymentId);

  if (!meta) {
    log("serve_miss", { requestId, deploymentId });
    return errorPage("Not Found", "This deployment does not exist.");
  }

  if (meta.status !== "ready") {
    log("serve_miss", { requestId, deploymentId, status: meta.status });
    return errorPage("Not Available", "This deployment is not available.");
  }

  const now = Date.now();
  const expiresAt = new Date(meta.expiresAt).getTime();
  if (expiresAt <= now) {
    log("serve_expired", { requestId, deploymentId });
    return errorPage("Expired", "This deployment has expired.");
  }

  // Resolve path
  const url = new URL(request.url);
  let filePath = url.pathname.replace(/^\//, "") || "index.html";
  if (filePath.endsWith("/")) filePath += "index.html";

  // Check if file exists in manifest
  const fileExists = meta.files.includes(filePath);

  if (!fileExists) {
    if (meta.mode === "spa") {
      // SPA fallback: serve index.html for non-file paths
      filePath = "index.html";
    } else {
      log("serve_miss", { requestId, deploymentId, path: filePath });
      return errorPage("Not Found", "This file does not exist.");
    }
  }

  // Fetch from R2
  const r2Key = `${deploymentId}/${filePath}`;
  const object = await env.SHOW_FILES.get(r2Key);

  if (!object) {
    log("serve_miss", { requestId, deploymentId, path: filePath, reason: "r2_missing" });
    return errorPage("Not Found", "This file does not exist.");
  }

  // Content-Type
  const ext = getExtension(filePath);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  // Cache headers — cap at remaining TTL
  const secondsUntilExpiry = Math.floor((expiresAt - now) / 1000);
  const maxAge = Math.max(0, Math.min(MAX_CACHE_AGE, secondsUntilExpiry));

  log("serve_hit", { requestId, deploymentId, path: filePath });

  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": `public, max-age=${maxAge}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
