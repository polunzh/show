import { MIME_TYPES } from "./constants.ts";
import type { Env } from "./types.ts";

const R2_PREFIX = "_homepage/";

function getExtension(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot >= 0 ? filePath.slice(dot).toLowerCase() : "";
}

export async function handleHomepage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let filePath = url.pathname.replace(/^\//, "") || "index.html";
  if (filePath.endsWith("/")) filePath += "index.html";

  const r2Key = `${R2_PREFIX}${filePath}`;
  const object = await env.SHOW_FILES.get(r2Key);

  if (!object) {
    // Try index.html for directory-like paths
    if (!filePath.includes(".")) {
      const indexKey = `${R2_PREFIX}${filePath}/index.html`;
      const indexObject = await env.SHOW_FILES.get(indexKey);
      if (indexObject) {
        return new Response(indexObject.body, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  }

  const ext = getExtension(filePath);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
