import { MAX_CACHE_AGE, MIME_TYPES, getExtension } from "./constants.ts";
import { log } from "./logging.ts";
import { getMetadata } from "./metadata.ts";
import type { Env } from "./types.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorPage(status: number, title: string, message: string): Response {
  const t = escapeHtml(title);
  const m = escapeHtml(message);
  const html = `<!DOCTYPE html>
<html><head><title>${t} — Show</title></head>
<body style="font-family:system-ui;max-width:600px;margin:80px auto;text-align:center">
<h1>${t}</h1>
<p>${m}</p>
<p style="color:#888;font-size:14px">Powered by Show</p>
</body></html>`;

  return new Response(html, {
    status,
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
    return errorPage(404, "Not Found", "This deployment does not exist.");
  }

  if (meta.status !== "ready") {
    log("serve_miss", { requestId, deploymentId, status: meta.status });
    if (meta.status === "uploading") {
      return errorPage(
        503,
        "Uploading",
        "This deployment is still uploading. Please try again shortly.",
      );
    }
    if (meta.status === "failed") {
      return errorPage(502, "Upload Failed", "This deployment failed to upload.");
    }
    return errorPage(410, "Expired", "This deployment has expired.");
  }

  const now = Date.now();
  const expiresAt = new Date(meta.expiresAt).getTime();
  if (expiresAt <= now) {
    log("serve_expired", { requestId, deploymentId });
    return errorPage(410, "Expired", "This deployment has expired.");
  }

  // Resolve path
  const url = new URL(request.url);
  let filePath = url.pathname.replace(/^\//, "") || "index.html";
  if (filePath.endsWith("/")) filePath += "index.html";

  if (filePath.includes("..") || filePath.includes("\\") || filePath.includes("\0")) {
    return errorPage(400, "Bad Request", "Invalid path.");
  }

  // Check if file exists in manifest
  const fileExists = meta.files.includes(filePath);

  if (!fileExists) {
    if (meta.mode === "spa") {
      // SPA fallback: serve index.html for non-file paths
      filePath = "index.html";
    } else {
      log("serve_miss", { requestId, deploymentId, path: filePath });
      return errorPage(404, "Not Found", "This file does not exist.");
    }
  }

  // Fetch from R2
  const r2Key = `${deploymentId}/${filePath}`;
  const object = await env.SHOW_FILES.get(r2Key);

  if (!object) {
    log("serve_miss", { requestId, deploymentId, path: filePath, reason: "r2_missing" });
    return errorPage(404, "Not Found", "This file does not exist.");
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
      "Content-Length": String(object.size),
      "Cache-Control": `public, max-age=${maxAge}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
