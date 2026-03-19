import { log } from "./logging.ts";
import { getMetadata } from "./metadata.ts";
import type { Env } from "./types.ts";

export async function handleInspect(
  env: Env,
  requestId: string,
  deploymentId: string,
): Promise<Response> {
  const meta = await getMetadata(env.SHOW_META, deploymentId);

  if (!meta) {
    log("inspect_miss", { requestId, deploymentId });
    return Response.json(
      { error: "NOT_FOUND", message: "Deployment not found", requestId },
      { status: 404 },
    );
  }

  log("inspect_hit", { requestId, deploymentId, status: meta.status });

  return Response.json({
    deploymentId: meta.deploymentId,
    status: meta.status,
    mode: meta.mode,
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
    fileCount: meta.fileCount,
    totalSize: meta.totalSize,
    lastError: meta.lastError,
    requestId,
  });
}
