export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
export const MAX_EXTRACTED_SIZE = 10 * 1024 * 1024;
export const MAX_FILE_COUNT = 100;
export const DEPLOYMENT_TTL_MS = 48 * 60 * 60 * 1000;
export const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
export const FAILED_GRACE_MS = 60 * 60 * 1000;
export const MAX_CACHE_AGE = 300;
export const R2_CONCURRENCY = 5;
export const RATE_LIMIT_PER_HOUR = 5;
export const ID_LENGTH = 6;
export const MAX_SLUG_LENGTH = 56;

export const ALLOWED_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".map",
  ".txt",
  ".xml",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".webmanifest",
]);

export function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot).toLowerCase() : "";
}

export const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".webmanifest": "application/manifest+json",
};
