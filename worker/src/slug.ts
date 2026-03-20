import { ID_LENGTH, MAX_SLUG_LENGTH } from "./constants.ts";

export function slugify(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) slug = "site";
  if (slug.length > MAX_SLUG_LENGTH) slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");

  return slug;
}

export function generateDeploymentId(slug: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  // 252 is the largest multiple of 36 below 256 — reject bytes >= 252 to avoid modulo bias
  const maxValid = 252;

  let randomId = "";
  while (randomId.length < ID_LENGTH) {
    const bytes = new Uint8Array(ID_LENGTH * 2);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length && randomId.length < ID_LENGTH; i++) {
      if (bytes[i] < maxValid) {
        randomId += chars[bytes[i] % chars.length];
      }
    }
  }

  return `${randomId}-${slug}`;
}
