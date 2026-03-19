import { gunzipSync } from "fflate";
import {
  ALLOWED_EXTENSIONS,
  MAX_EXTRACTED_SIZE,
  MAX_FILE_COUNT,
  MAX_UPLOAD_SIZE,
  DEPLOYMENT_TTL_MS,
  R2_CONCURRENCY,
} from "./constants.ts";
import { log } from "./logging.ts";
import { putMetadata } from "./metadata.ts";
import { slugify, generateDeploymentId } from "./slug.ts";
import { parseTar } from "./tar.ts";
import type { Env, DeploymentMode, DeploymentMetadata } from "./types.ts";

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function errorResponse(status: number, code: string, message: string, requestId: string): Response {
  return Response.json({ error: code, message, requestId }, { status });
}

export async function handleUpload(
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  log("upload_received", { requestId });

  // 1. Check Content-Length
  const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_UPLOAD_SIZE) {
    log("upload_rejected", { requestId, reason: "size_exceeded", contentLength });
    return errorResponse(
      413,
      "UPLOAD_TOO_LARGE",
      `Upload exceeds ${MAX_UPLOAD_SIZE / 1024 / 1024}MB limit`,
      requestId,
    );
  }

  // 2. Parse multipart form data
  let archiveBytes: ArrayBuffer;
  let deployName = "";
  let mode: DeploymentMode = "static";

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || typeof file === "string") {
      log("upload_rejected", { requestId, reason: "missing_file" });
      return errorResponse(400, "MISSING_FILE", "No file field in upload", requestId);
    }
    archiveBytes = await file.arrayBuffer();

    const nameField = formData.get("name");
    if (typeof nameField === "string") deployName = nameField;

    const modeField = formData.get("mode");
    if (modeField === "spa") mode = "spa";
  } catch {
    log("upload_rejected", { requestId, reason: "invalid_multipart" });
    return errorResponse(400, "INVALID_REQUEST", "Failed to parse multipart form data", requestId);
  }

  // 3. Recheck actual size
  if (archiveBytes.byteLength > MAX_UPLOAD_SIZE) {
    log("upload_rejected", { requestId, reason: "size_exceeded", size: archiveBytes.byteLength });
    return errorResponse(
      413,
      "UPLOAD_TOO_LARGE",
      `Upload exceeds ${MAX_UPLOAD_SIZE / 1024 / 1024}MB limit`,
      requestId,
    );
  }

  // 4. Decompress gzip
  let tarBuffer: Uint8Array;
  try {
    tarBuffer = gunzipSync(new Uint8Array(archiveBytes));
  } catch {
    log("upload_rejected", { requestId, reason: "corrupted_archive" });
    return errorResponse(400, "CORRUPTED_ARCHIVE", "Unable to decompress file", requestId);
  }

  // 5. Check extracted size
  if (tarBuffer.byteLength > MAX_EXTRACTED_SIZE) {
    log("upload_rejected", {
      requestId,
      reason: "extracted_too_large",
      size: tarBuffer.byteLength,
    });
    return errorResponse(
      400,
      "EXTRACTED_TOO_LARGE",
      `Extracted size exceeds ${MAX_EXTRACTED_SIZE / 1024 / 1024}MB limit`,
      requestId,
    );
  }

  // 6. Parse tar
  const entries = parseTar(tarBuffer);

  // 7. Validate entries
  if (entries.length === 0) {
    log("upload_rejected", { requestId, reason: "empty_archive" });
    return errorResponse(400, "EMPTY_ARCHIVE", "Archive contains no files", requestId);
  }

  if (entries.length > MAX_FILE_COUNT) {
    log("upload_rejected", { requestId, reason: "too_many_files", count: entries.length });
    return errorResponse(
      400,
      "TOO_MANY_FILES",
      `File count ${entries.length} exceeds ${MAX_FILE_COUNT} limit`,
      requestId,
    );
  }

  const disallowedFiles: string[] = [];
  for (const entry of entries) {
    // Path traversal check
    if (entry.name.includes("..")) {
      log("upload_rejected", { requestId, reason: "path_traversal", file: entry.name });
      return errorResponse(
        400,
        "PATH_TRAVERSAL",
        `Path traversal detected: ${entry.name}`,
        requestId,
      );
    }

    // File type check — extensionless files are allowed
    const ext = getExtension(entry.name);
    if (ext !== "" && !ALLOWED_EXTENSIONS.has(ext)) {
      disallowedFiles.push(entry.name);
    }
  }

  if (disallowedFiles.length > 0) {
    log("upload_rejected", { requestId, reason: "disallowed_file_types", files: disallowedFiles });
    return errorResponse(
      400,
      "DISALLOWED_FILE_TYPE",
      `Disallowed file types: ${disallowedFiles.join(", ")}`,
      requestId,
    );
  }

  // 8. Generate deployment ID
  const slug = slugify(deployName || "site");
  const deploymentId = generateDeploymentId(slug);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEPLOYMENT_TTL_MS);

  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  const fileList = entries.map((e) => e.name);

  // 9. Write metadata as uploading
  const metadata: DeploymentMetadata = {
    deploymentId,
    slug,
    status: "uploading",
    mode,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    fileCount: entries.length,
    totalSize,
    files: fileList,
    lastError: null,
    lastRequestId: requestId,
  };

  await putMetadata(env.SHOW_META, metadata);

  // 10. Write files to R2 with bounded concurrency
  try {
    for (let i = 0; i < entries.length; i += R2_CONCURRENCY) {
      const batch = entries.slice(i, i + R2_CONCURRENCY);
      await Promise.all(
        batch.map((entry) => env.SHOW_FILES.put(`${deploymentId}/${entry.name}`, entry.data)),
      );
    }

    // 11. Update metadata to ready
    metadata.status = "ready";
    metadata.lastRequestId = requestId;
    await putMetadata(env.SHOW_META, metadata);

    log("upload_completed", {
      requestId,
      deploymentId,
      fileCount: entries.length,
      totalSize,
      mode,
    });

    const url = `https://${deploymentId}.${env.BASE_DOMAIN}`;

    return Response.json({
      deploymentId,
      url,
      createdAt: metadata.createdAt,
      expiresAt: metadata.expiresAt,
      mode,
      requestId,
    });
  } catch (err) {
    // 12. On failure: mark as failed
    metadata.status = "failed";
    metadata.lastError = {
      code: "R2_WRITE_FAILED",
      message: err instanceof Error ? err.message : String(err),
    };
    metadata.lastRequestId = requestId;

    try {
      await putMetadata(env.SHOW_META, metadata);
    } catch {
      // Best effort — if KV write also fails, cron will eventually clean up
    }

    log("upload_failed", {
      requestId,
      deploymentId,
      error: metadata.lastError.message,
    });

    return errorResponse(
      500,
      "R2_WRITE_FAILED",
      "Failed while writing deployment files",
      requestId,
    );
  }
}
