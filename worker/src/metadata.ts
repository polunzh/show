import { DEPLOYMENT_TTL_MS } from "./constants.ts";
import type { DeploymentMetadata } from "./types.ts";

export async function getMetadata(
  kv: KVNamespace,
  deploymentId: string,
): Promise<DeploymentMetadata | null> {
  const raw = await kv.get(deploymentId);
  if (!raw) return null;
  return JSON.parse(raw) as DeploymentMetadata;
}

export async function putMetadata(kv: KVNamespace, meta: DeploymentMetadata): Promise<void> {
  // TTL = deployment TTL + 1 hour buffer so cron runs before KV auto-deletes
  const ttlSeconds = Math.ceil(DEPLOYMENT_TTL_MS / 1000) + 3600;
  await kv.put(meta.deploymentId, JSON.stringify(meta), {
    expirationTtl: ttlSeconds,
  });
}

export async function* listDeployments(kv: KVNamespace): AsyncGenerator<DeploymentMetadata> {
  let cursor: string | undefined;
  do {
    const result = await kv.list({ cursor });
    for (const key of result.keys) {
      // Skip internal keys
      if (key.name.startsWith("_")) continue;
      const meta = await getMetadata(kv, key.name);
      if (meta) yield meta;
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
}
