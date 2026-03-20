import { FAILED_GRACE_MS, UPLOAD_TIMEOUT_MS } from "./constants.ts";
import { log } from "./logging.ts";
import { listDeployments, putMetadata } from "./metadata.ts";
import type { Env } from "./types.ts";

const R2_BATCH_DELETE_LIMIT = 1000;

async function deleteR2Files(r2: R2Bucket, deploymentId: string, files: string[]): Promise<void> {
  const keys = files.map((file) => `${deploymentId}/${file}`);
  for (let i = 0; i < keys.length; i += R2_BATCH_DELETE_LIMIT) {
    await r2.delete(keys.slice(i, i + R2_BATCH_DELETE_LIMIT));
  }
}

export async function handleCleanup(env: Env): Promise<void> {
  log("cleanup_started", {});

  const now = Date.now();
  let processed = 0;
  let cleaned = 0;
  let failed = 0;

  for await (const meta of listDeployments(env.SHOW_META)) {
    processed++;
    const createdAt = new Date(meta.createdAt).getTime();
    const expiresAt = new Date(meta.expiresAt).getTime();

    try {
      // Expired ready deployments
      if (meta.status === "ready" && expiresAt < now) {
        await deleteR2Files(env.SHOW_FILES, meta.deploymentId, meta.files);
        meta.status = "expired";
        await putMetadata(env.SHOW_META, meta);
        cleaned++;
        log("cleanup_deleted", {
          deploymentId: meta.deploymentId,
          reason: "expired",
        });
        continue;
      }

      // Stale failed deployments — delete files and KV
      if (meta.status === "failed" && createdAt + FAILED_GRACE_MS < now) {
        await deleteR2Files(env.SHOW_FILES, meta.deploymentId, meta.files);
        await env.SHOW_META.delete(meta.deploymentId);
        cleaned++;
        log("cleanup_deleted", {
          deploymentId: meta.deploymentId,
          reason: "failed_cleanup",
        });
        continue;
      }

      // Stuck uploading deployments
      if (meta.status === "uploading" && createdAt + UPLOAD_TIMEOUT_MS < now) {
        await deleteR2Files(env.SHOW_FILES, meta.deploymentId, meta.files);
        meta.status = "failed";
        meta.lastError = {
          code: "UPLOAD_TIMEOUT",
          message: "Upload did not complete within timeout",
        };
        await putMetadata(env.SHOW_META, meta);
        cleaned++;
        log("cleanup_timeout", {
          deploymentId: meta.deploymentId,
        });
        continue;
      }
    } catch (err) {
      failed++;
      log("cleanup_failed", {
        deploymentId: meta.deploymentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log("cleanup_completed", { processed, cleaned, failed });
}
