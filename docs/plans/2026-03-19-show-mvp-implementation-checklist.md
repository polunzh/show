# Show MVP Implementation Checklist

**Spec:** [2026-03-19-show-static-hosting-design.md](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md)
**Scope:** MVP only
**Goal:** Turn the current spec into the smallest shippable implementation without adding non-essential modules.

## Build Order

Implement in this order:

1. Worker foundations
2. Upload flow
3. Serve flow
4. Local `show` client
5. Cleanup and observability
6. Setup and agent wrapper
7. Tests and polish

This order matters because the local client should target a stable API, not invent it.

---

## 1. Worker Foundations

### Files

- `worker/src/index.ts`
- `worker/src/constants.ts`
- `worker/src/auth.ts`
- `worker/src/logging.ts`
- `worker/src/metadata.ts`
- `worker/wrangler.toml`

### Checklist

- Define the Worker bindings:
  - `SHOW_FILES` for R2
  - `SHOW_META` for KV
  - `DEPLOY_TOKEN` as secret
- Define shared constants:
  - max upload size
  - max extracted size
  - max file count
  - deployment TTL
  - cleanup timeout
  - failed cleanup grace period
- Implement token validation in `auth.ts`
- Implement request ID generation in `logging.ts`
- Implement structured log helpers
- Implement metadata read/write helpers in `metadata.ts`
- Wire route dispatch in `index.ts`

### Exit Criteria

- Worker can boot locally
- Secrets/bindings are defined in config
- Every request gets a `requestId`

---

## 2. Upload Flow

### Files

- `worker/src/upload.ts`
- `worker/src/metadata.ts`

### Checklist

- Parse `multipart/form-data`
- Validate `Authorization: Bearer <token>`
- Validate `Content-Length`
- Decompress `tar.gz`
- Validate archive contents:
  - no path traversal
  - file count within limit
  - extracted size within limit
  - allowed file types only
- Normalize deployment name into slug
- Generate `deploymentId`
- Build manifest
- Write metadata as `uploading`
- Write files to R2 with bounded concurrency
- Update metadata to `ready`
- On failure:
  - set metadata to `failed`
  - store `lastError`
  - store `lastRequestId`

### Response Contract

Success response must include:

```json
{
  "deploymentId": "...",
  "url": "...",
  "createdAt": "...",
  "expiresAt": "...",
  "mode": "static",
  "requestId": "..."
}
```

### Exit Criteria

- Uploading a valid static directory succeeds
- Invalid archives fail with stable error codes
- Partial write failures become `failed`, not orphaned success states

---

## 3. Serve Flow

### Files

- `worker/src/serve.ts`

### Checklist

- Resolve deployment ID from `Host`
- Load metadata from KV
- Reject if deployment is missing, not `ready`, or expired
- Resolve `/` to `index.html`
- For `mode=static`, serve exact file matches only
- For `mode=spa`, fall back to `index.html` when file is missing
- Set `Content-Type`
- Set cache headers based on remaining TTL
- Return clear HTML error pages for:
  - missing deployment
  - expired deployment
  - service unavailable

### Exit Criteria

- Static multi-page sites load correctly
- SPA deep links work when `mode=spa`
- Cache headers never exceed remaining lifetime

---

## 4. Local `show` Client

### Files

- `scripts/show.mjs`

### Checklist

- Implement subcommands:
  - `show deploy`
  - `show list`
  - `show inspect`
- Read local config:
  - API base URL
  - deploy token
- Maintain `~/.show/deployments.json`
- `show deploy`:
  - archive target dir
  - upload to Worker
  - persist local history entry
  - print human-readable output
  - support JSON output mode
- `show list`:
  - read local history only
  - group into `active` and `expired`
- `show inspect`:
  - accept URL or deployment ID
  - call protected inspect endpoint
  - print status and last error

### Exit Criteria

- A human can deploy without an AI Agent
- A script/agent can parse JSON output
- Local history survives multiple deployments

---

## 5. Cleanup and Observability

### Files

- `worker/src/cleanup.ts`
- `worker/src/logging.ts`

### Checklist

- Implement hourly Cron handler
- Page through KV with cursor-based listing
- For each deployment:
  - delete expired `ready`
  - delete stale `failed`
  - fail and clean stale `uploading`
- Emit structured log events:
  - `upload_received`
  - `upload_rejected`
  - `upload_completed`
  - `upload_failed`
  - `serve_hit`
  - `serve_miss`
  - `serve_expired`
  - `cleanup_deleted`
  - `cleanup_failed`

### Exit Criteria

- Cleanup works correctly beyond 1000 KV entries
- Logs contain enough context to debug real failures

---

## 6. Setup and Agent Wrapper

### Files

- setup script/tooling entrypoint
- `skills/show-deploy.md`

### Checklist

- Create R2 bucket
- Create KV namespace
- Generate deploy token
- Configure Worker secrets
- Configure Worker route `*.show.example.com/*`
- Write local client config
- Add agent wrapper that calls local `show`

### Exit Criteria

- A new instance can be created end-to-end
- Claude/Codex-style wrappers only call `show`, they do not duplicate logic

---

## 7. Tests and Polish

### Areas

- unit tests for slug generation
- unit tests for archive validation
- unit tests for metadata state transitions
- integration tests for upload -> serve -> expire flow
- integration tests for SPA fallback
- integration tests for cleanup pagination

### Checklist

- Add tests for valid and invalid upload archives
- Add tests for `static` vs `spa` behavior
- Add tests for local history writes
- Add tests for inspect error output
- Add tests for cleanup on `failed` and `uploading` timeouts

### Exit Criteria

- Happy path is covered
- The main failure modes are covered
- Cleanup behavior is covered

---

## Explicitly Deferred

Do not build these in MVP:

- user accounts
- remote deployment history
- remote delete
- per-user quotas
- `workers.dev` path fallback
- external logging/analytics pipeline
- custom domains per deployment
- `.wasm` support

---

## Suggested Milestones

### Milestone 1

Worker upload + serve works for `mode=static`.

### Milestone 2

Local `show deploy` and `show list` work.

### Milestone 3

`show inspect`, cleanup, and logs work.

### Milestone 4

SPA mode, setup flow, and agent wrapper work.
