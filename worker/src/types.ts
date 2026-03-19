export interface Env {
  SHOW_FILES: R2Bucket;
  SHOW_META: KVNamespace;
  DEPLOY_TOKEN: string;
  BASE_DOMAIN: string;
}

export type DeploymentStatus = "uploading" | "ready" | "failed" | "expired";
export type DeploymentMode = "static" | "spa";

export interface DeploymentError {
  code: string;
  message: string;
}

export interface DeploymentMetadata {
  deploymentId: string;
  slug: string;
  status: DeploymentStatus;
  mode: DeploymentMode;
  createdAt: string;
  expiresAt: string;
  fileCount: number;
  totalSize: number;
  files: string[];
  lastError: DeploymentError | null;
  lastRequestId: string;
}
