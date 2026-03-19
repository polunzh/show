# Show — Temporary Static Hosting for AI Agents

**Date:** 2026-03-19
**Status:** Draft

## Overview

Show is a lightweight, self-hostable platform for publishing temporary static site previews from AI Agent workflows.

The MVP is intentionally narrow:

- Deploy a local static directory with one shell command.
- Return a public preview URL on a subdomain of the instance owner's domain.
- Expire each deployment after 48 hours.
- Let the deployer see what they have deployed from the current machine.
- Give humans enough diagnostics to understand failures.

Show is not trying to be a general-purpose hosting platform in MVP. It is a temporary preview tool.

---

## Product Contract (MVP)

The MVP makes these promises:

1. A deployer can run `show deploy ./dist` and receive a preview URL.
2. Uploads are protected by an instance-level deploy token. Anonymous public upload is not supported.
3. Each deployment gets a unique subdomain URL:

```text
{random-id}-{slug}.show.example.com
```

4. Deployments expire 48 hours after creation.
5. A deployer can view local deployment history from the same machine via `show list`.
6. A deployer can inspect deployment status and failure reason via `show inspect <url|deployment-id>`.
7. The platform supports:
   - static multi-page sites
   - SPA fallback when deployment mode is explicitly set to `spa`

The MVP does not promise:

- cross-device deployment history
- remote multi-user management
- custom domains per deployment
- generic `workers.dev` path-based fallback compatibility

---

## Goals

- One-command deployment for AI Agent workflows
- Zero-to-low operational burden for self-hosting
- Safe-by-default upload model for a single self-hosted instance
- Predictable expiration behavior
- Minimal human-operable diagnostics

## Non-Goals (MVP)

- Anonymous uploads
- User accounts
- Web dashboard
- Cross-device sync
- Per-user permissions
- Billing and quotas
- Real-time analytics
- Advanced CDN tuning
- Custom domain binding for each deployment
- Generic support for arbitrary path-based hosting on `workers.dev`

---

## Architecture

```text
AI Agent / Human
      │
      ▼  shell: show deploy ./dist --name my-project
 local shell client (`show`)
      │
      ├── stores local history in ~/.show/deployments.json
      │
      ▼  POST /upload
Cloudflare Worker (show-api)
  ├── POST /upload                     protected by deploy token
  ├── GET  /*                          serve deployment by subdomain
  ├── GET  /_admin/deployments/:id     protected inspect endpoint
  └── Cron Trigger                     expire and clean old deployments
      │
      ├── R2 Bucket (show-files)
      │    └── {deployment-id}/index.html
      │    └── {deployment-id}/assets/app.js
      │    └── ...
      │
      └── KV Namespace (show-meta)
           └── key: {deployment-id}
           └── value: deployment metadata + state + file manifest
```

### Required Modules

The MVP requires these modules and no more:

1. Upload Admission Module
2. Deployment State Module
3. Deployment History Module
4. Observability Module

Everything else stays out of scope.

---

## URL Model

### Deployment URL

```text
{random-id}-{slug}.show.example.com
```

Example:

```text
a3f9x2-my-project.show.example.com
```

### Hostname Rules

- `random-id` is 6 lowercase base36 characters
- `slug` is lowercase ASCII only
- allowed characters in `slug`: `a-z`, `0-9`, `-`
- multiple invalid characters collapse to a single `-`
- leading and trailing `-` are trimmed
- empty slug becomes `site`
- slug length is capped so the full left-most label stays within DNS limits

Example conversions:

| Input         | Slug          |
| ------------- | ------------- |
| `My Project`  | `my-project`  |
| `hello_world` | `hello-world` |
| `设计稿`      | `site`        |

---

## Local Client

Show uses a thin local Node.js script named `show`. It is still a script-level tool, not a compiled product CLI.

This is an intentional choice:

- `show deploy` needs archive creation and HTTP upload
- `show list` needs local JSON parsing
- `show inspect` needs HTTP requests and structured output

Doing this in pure shell would add avoidable complexity and external dependencies like `jq`.

### Commands

```bash
show deploy ./dist
show deploy ./dist --name my-project
show deploy ./dist --name my-spa --mode spa
show list
show inspect https://a3f9x2-my-project.show.example.com
```

### Command Responsibilities

#### `show deploy`

1. Read deploy token and API base URL from local config
2. Build a tar.gz archive from the target directory
3. Validate archive size before upload
4. POST to `/upload`
5. Save a local history entry
6. Print both human-readable and JSON output

#### `show list`

Reads `~/.show/deployments.json` and prints local deployment history grouped into:

- active
- expired

This is local-machine history only. It is not a remote control plane.

`show list` does not query the server. It is a pure local read.

If a local history entry is malformed, it may be shown with an inline warning, but that is not treated as a third lifecycle bucket.

#### `show inspect`

1. Accept a deployment URL or deployment ID
2. Resolve deployment ID
3. Call the protected inspect endpoint
4. Show current status, expiration, mode, and last known failure reason

### Local History File

Path:

```text
~/.show/deployments.json
```

Each entry stores:

```json
{
  "deploymentId": "a3f9x2-my-project",
  "url": "https://a3f9x2-my-project.show.example.com",
  "createdAt": "2026-03-19T15:30:00Z",
  "expiresAt": "2026-03-21T15:30:00Z",
  "sourcePath": "/Users/alice/project/dist",
  "deploymentName": "my-project",
  "mode": "static"
}
```

---

## Upload Admission Module

Uploads are protected by an instance-level deploy token.

### Why

This is the minimum safe boundary for MVP:

- prevents anonymous public uploads
- reduces abuse risk
- gives the instance owner a basic control point

### MVP Design

- setup generates a random deploy token
- token is stored in Worker secret config
- local `show` client stores the same token in local config
- `POST /upload` requires `Authorization: Bearer <deploy-token>`

This is not user auth. It is instance admission control.

---

## Agent Integration

AI Agent integration is not part of the runtime core, but it is part of the developer workflow.

### MVP approach

- the source of truth is the local `show` command
- Claude Code / Codex / other agents integrate by wrapping that command
- wrapper files live under `skills/` or equivalent integration docs

This keeps the hosting runtime small while still making agent usage first-class.

### Layering Rule

The layering is:

```text
Agent skill / tool wrapper
        ↓
local `show` command
        ↓
Show Worker API
```

That means:

- `show` is the product interface
- `skill` is an adapter for a specific AI Agent environment
- product logic must not live only inside a skill file

This allows:

- humans to run `show` directly
- multiple AI Agents to share the same local interface
- future agent integrations without rewriting deployment logic

---

## Deployment State Module

Each deployment has an explicit lifecycle state.

### States

- `uploading`
- `ready`
- `failed`
- `expired`

### Why

Without explicit state, partial failures leave orphan files and cleanup has no reliable basis.

### State Rules

- `uploading`: metadata exists, validation passed, file writes are in progress
- `ready`: all files written successfully and deployment is publicly servable
- `failed`: upload did not complete; deployment must not be served
- `expired`: deployment reached TTL and should not be served

### State Transition

```text
new -> uploading -> ready -> expired
                  -> failed
```

### Cleanup Rule

Cron deletes:

- expired deployments
- failed deployments older than a short grace period
- stuck `uploading` deployments older than a timeout

---

## Worker API

### `POST /upload`

Protected upload endpoint.

#### Request

```text
Authorization: Bearer <deploy-token>
Content-Type: multipart/form-data
Body:
  - file: tar.gz archive
  - name: optional deployment name
  - mode: optional, one of static | spa
```

#### Validation

Before writing anything:

1. Validate auth token
2. Validate `Content-Length <= 10MB`
3. Decompress and validate archive in memory/streaming mode
4. Validate:
   - total uncompressed size <= 10MB
   - file count <= 100
   - path traversal is rejected
   - filenames are normalized
   - file types are in the whitelist
5. Build the complete file manifest

#### Upload Flow

1. Generate `deploymentId`
2. Compute `expiresAt = createdAt + 48h`
3. Write KV metadata with:
   - `status = uploading`
   - manifest
   - mode
   - timestamps
4. Write files to R2 with bounded concurrency
5. Update metadata to `status = ready`
6. Return structured response

If file writes fail after metadata creation:

- update metadata to `status = failed`
- store `lastError`
- let Cron clean up remaining files

#### Success Response

```json
{
  "deploymentId": "a3f9x2-my-project",
  "url": "https://a3f9x2-my-project.show.example.com",
  "createdAt": "2026-03-19T15:30:00Z",
  "expiresAt": "2026-03-21T15:30:00Z",
  "mode": "static",
  "requestId": "req_01HXYZ..."
}
```

### `GET /*`

Serves deployment files by subdomain.

#### Request Resolution

1. Read deployment ID from `Host`
2. Load metadata from KV
3. Reject if:
   - metadata missing
   - status is not `ready`
   - `expiresAt <= now`
4. Resolve request path:
   - `/` -> `index.html`
   - normal file paths map directly
   - if mode is `spa` and the file does not exist, serve `index.html`
5. Read file from R2
6. Return with content type and cache headers

### `GET /_admin/deployments/:id`

Protected inspect endpoint.

#### Why it exists

Humans need a minimal diagnostic entry point that is better than guessing from `404` and `500`.

#### Protection

Requires the same deploy token as upload.

#### Response

```json
{
  "deploymentId": "a3f9x2-my-project",
  "status": "failed",
  "mode": "spa",
  "createdAt": "2026-03-19T15:30:00Z",
  "expiresAt": "2026-03-21T15:30:00Z",
  "fileCount": 12,
  "totalSize": 847000,
  "lastError": {
    "code": "R2_WRITE_FAILED",
    "message": "Failed while writing assets/app.js"
  },
  "requestId": "req_01HXYZ..."
}
```

### Cron Trigger

Runs hourly.

For each deployment:

- if `status = ready` and `expiresAt < now`, mark `expired` and delete files
- if `status = failed` and older than grace period, delete files and metadata
- if `status = uploading` and older than timeout, mark `failed` and delete files

KV listing must use cursor-based pagination until exhausted.

MVP note:

- active deployments are expected to stay well below 1000
- pagination is still required for correctness

---

## Data Model

### R2 Bucket: `show-files`

```text
a3f9x2-my-project/index.html
a3f9x2-my-project/style.css
a3f9x2-my-project/assets/logo.png
```

### KV Namespace: `show-meta`

```json
{
  "deploymentId": "a3f9x2-my-project",
  "slug": "my-project",
  "status": "ready",
  "mode": "static",
  "createdAt": "2026-03-19T15:30:00Z",
  "expiresAt": "2026-03-21T15:30:00Z",
  "fileCount": 12,
  "totalSize": 847000,
  "files": ["index.html", "style.css", "assets/logo.png"],
  "lastError": null,
  "lastRequestId": "req_01HXYZ..."
}
```

### Why store the manifest in KV

For MVP, the manifest is small enough to store directly in metadata because:

- max 100 files
- cleanup needs exact file names
- this avoids adding another manifest storage layer

---

## File Type Support

MVP whitelist:

- `.html`
- `.css`
- `.js`
- `.mjs`
- `.json`
- `.map`
- `.txt`
- `.xml`
- `.svg`
- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.webp`
- `.avif`
- `.ico`
- `.woff`
- `.woff2`
- `.ttf`
- `.otf`
- `.webmanifest`

Not supported in MVP:

- server-side runtimes
- arbitrary executable binaries
- uploads that require backend behavior

`.wasm` may be added later if real demand appears.

---

## Caching and Expiration

The cache strategy must not break the 48-hour expiration contract.

### Rules

- responses are cacheable
- cache TTL is capped by remaining time until `expiresAt`
- Worker must never emit cache headers that let content stay cached beyond expiration

### MVP Header Strategy

For each served file:

```text
Cache-Control: public, max-age={min(300, secondsUntilExpiry)}
X-Content-Type-Options: nosniff
```

This keeps caching useful while preserving predictable expiration behavior.

Long-lived 48-hour edge caching is explicitly out of scope for MVP because it conflicts with strict expiration.

---

## Observability Module

Show must be diagnosable by humans, not only by AI Agents.

### Minimum Observability

Every meaningful operation gets a `requestId`.

Structured Worker log events:

- `upload_received`
- `upload_rejected`
- `upload_completed`
- `upload_failed`
- `serve_hit`
- `serve_miss`
- `serve_expired`
- `cleanup_deleted`
- `cleanup_failed`

### Human Diagnostics

- API error responses include `requestId`
- metadata stores `lastError` and `lastRequestId`
- `show inspect` exposes current deployment state

### Explicit Non-Goal

No external log pipeline or analytics backend in MVP.

Cloudflare's built-in Worker logs are enough for first release.

---

## Error Handling

### Upload Errors

| Scenario                | Response |
| ----------------------- | -------- |
| Missing / invalid token | `401`    |
| Upload > 10MB           | `413`    |
| Invalid file types      | `400`    |
| Path traversal detected | `400`    |
| File count > 100        | `400`    |
| Corrupted tar.gz        | `400`    |
| Metadata write failure  | `500`    |
| R2 write failure        | `500`    |

All upload errors return:

- error code
- human-readable message
- `requestId`

### Serve Errors

| Scenario              | Response |
| --------------------- | -------- |
| Deployment not found  | `404`    |
| Deployment expired    | `404`    |
| Deployment not ready  | `404`    |
| File not found        | `404`    |
| Worker internal error | `500`    |

### Error Pages

MVP should use simple branded text/html error pages for:

- expired deployment
- missing deployment
- service unavailable

The goal is clarity, not a dashboard.

---

## Cost Control

MVP cost control is deliberately simple.

### Hard Limits

- upload token required
- max upload size = 10MB compressed
- max extracted size = 10MB
- max file count = 100
- 48-hour expiration

### Platform Controls

- Cloudflare rate limiting for `/upload`
- Cloudflare dashboard usage alerts
- Cloudflare free tier only

### Explicitly Not in MVP

- strong in-Worker quota accounting
- per-user usage limits
- automated billing logic
- KV-based circuit breakers used as hard admission control

These can be added only after there is real traffic and real operating data.

---

## Self-Hosting

### Setup Goal

A self-hosting user should be able to create one working instance with:

- one Cloudflare zone
- one Worker
- one KV namespace
- one R2 bucket
- one deploy token

### One-Command Setup

```bash
vp dlx create-show
```

The setup flow:

1. Prompt for Cloudflare API token
2. Prompt for domain name
3. Create R2 bucket
4. Create KV namespace
5. Generate deploy token
6. Configure Worker secrets and bindings
7. Configure Worker route for `*.show.example.com/*`
8. Deploy Worker
9. Write local client config

### Local Client Runtime

The generated `show` command is a small Node.js script wrapper.

MVP assumptions:

- Node.js is already required for local development in this repo
- the client should not depend on `bash + curl + jq`
- the setup flow can write a local executable shim that invokes the Node.js script

### Important Limitation

MVP requires subdomain-based hosting on a real domain.

Path-based fallback on `workers.dev` is not part of MVP because it breaks too many static sites with root-relative asset paths.

---

## Project Structure

```text
show/
├── package.json                 # root package manages app + worker dependencies in MVP
├── worker/
│   ├── src/
│   │   ├── index.ts
│   │   ├── upload.ts
│   │   ├── serve.ts
│   │   ├── inspect.ts
│   │   ├── cleanup.ts
│   │   ├── auth.ts
│   │   ├── metadata.ts
│   │   ├── logging.ts
│   │   └── constants.ts
│   └── wrangler.toml
│
├── scripts/
│   └── show.mjs
│
├── skills/
│   └── show-deploy.md          # optional agent wrapper that calls local `show`
│
├── src/                       # existing landing page
└── CLAUDE.md
```

### Package Management

In MVP, `worker/` does not have its own `package.json`.

To keep the repo simple:

- Worker dependencies are managed from the root `package.json`
- the local client script is also managed from the root package
- `worker/` is a source boundary, not a separate package boundary

If the project grows later, the worker can be split into its own package.

---

## Future Roadmap

Not in MVP, but reasonable later:

1. Remote delete command
2. Remote deployment listing by owner token
3. Custom expiration durations
4. `.wasm` support if needed
5. Web upload UI
6. Custom domains per deployment

---

## Implementation

For the MVP build order and task breakdown, see:

- [2026-03-19-show-mvp-implementation-checklist.md](/Users/zhenqiang/Documents/code/show/docs/plans/2026-03-19-show-mvp-implementation-checklist.md)
