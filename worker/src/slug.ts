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
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);

  let randomId = "";
  for (let i = 0; i < ID_LENGTH; i++) {
    randomId += chars[bytes[i] % chars.length];
  }

  return `${randomId}-${slug}`;
}
