# Show — Lightweight Static Hosting Platform

**Date:** 2026-03-19
**Status:** Draft

## Overview

Show is a lightweight, self-hostable static website hosting platform built entirely on Cloudflare's free tier. Users deploy static sites via AI Agent skills (Claude Code, Codex, OpenCode, etc.), and each deployment gets a unique subdomain URL that expires after 48 hours.

## Goals

- Deploy static sites with a single shell command, callable from any AI Agent
- Zero cost — runs entirely within Cloudflare free tier limits
- Easy to self-host — one-command setup for open source users
- Secure by default with multiple protection layers

## Non-Goals (MVP)

- User authentication (planned for later)
- Custom domain support (planned for later)
- Persistent hosting (all deployments expire)
- Web UI for uploading

---

## Architecture

```
AI Agent (Claude Code / Codex / OpenCode)
       │
       ▼  shell: show-deploy ./dist --name my-project
  show-deploy.sh
       │
       ▼  POST /upload (tar.gz + name)
 Cloudflare Worker (show-api)
  ├── POST /upload    ← receive and unpack static files
  ├── GET  /*         ← wildcard route, serve files by subdomain
  └── Cron Trigger    ← hourly, clean up expired projects
       │
       ├── R2 Bucket (show-files)
       │    └── {project-id}/index.html
       │    └── {project-id}/style.css
       │    └── {project-id}/...
       │
       └── KV Namespace (show-meta)
            └── key: {project-id}
            └── value: { name, createdAt, expiresAt, fileCount, totalSize }
```

### URL Format

```
{random-id}-{project-name}.show.yourdomain.com
```

Example: `a3f9x2-my-project.show.example.com`

The random ID prefix prevents enumeration of deployed sites.

---

## Deployment Method — Agent Skill

No standalone CLI. The deployment script (`show-deploy.sh`) is a simple shell script callable from any AI Agent that can execute bash.

### `show-deploy.sh` (~30 lines)

1. Pack target directory into tar.gz
2. Validate size <= 10MB
3. `curl` POST to Worker API
4. Output the returned URL and expiration time

### Agent Integration

| Platform | Integration |
|----------|------------|
| Claude Code | Skill file (`.claude/skills/show-deploy.md`) with trigger words |
| Codex | Tool description referencing the shell script |
| OpenCode | Same pattern, tool/skill description |

The skill triggers on phrases like "deploy to show", "upload to show".

### Usage

```bash
# Deploy a directory
show-deploy ./dist

# Deploy with a custom project name
show-deploy ./dist --name my-project
```

### Output

```
Live at: https://a3f9x2-my-project.show.example.com
Expires: 2026-03-21 15:30 UTC (48h)
```

---

## Worker API

### `POST /upload`

```
Content-Type: multipart/form-data
Body:
  - file: tar.gz archive
  - name: project name (optional)
```

**Processing flow:**

1. Validate `Content-Length` <= 10MB
2. Decompress tar.gz with streaming validation:
   - Total uncompressed size <= 10MB
   - File count <= 100
   - File types on whitelist only
   - No path traversal (`..` or absolute paths)
3. Generate project ID: `{6-char-random}-{name || dir-name}`
4. Write files to R2 in parallel (`Promise.all`)
5. Write metadata to KV
6. Return JSON response:

```json
{
  "url": "https://a3f9x2-my-project.show.example.com",
  "expiresAt": "2026-03-21T15:30:00Z"
}
```

### `GET /*` (wildcard route on `*.show.yourdomain.com`)

1. Extract project ID from `Host` header
2. Check KV for project existence and expiration
3. Map URL path to R2 key (`/` defaults to `index.html`)
4. Read file from R2, set correct `Content-Type` and security headers
5. Return file with cache headers, or 404 if not found / expired

### Cron Trigger (hourly)

1. List all projects in KV
2. Find projects where `expiresAt < now`
3. Delete corresponding R2 files and KV records

---

## Data Model

### R2 Bucket: `show-files`

```
a3f9x2-my-project/index.html
a3f9x2-my-project/style.css
a3f9x2-my-project/assets/logo.png
b7k1m4-demo/index.html
```

### KV Namespace: `show-meta`

```
Key:   a3f9x2-my-project
Value: {
  "name": "my-project",
  "projectId": "a3f9x2-my-project",
  "createdAt": "2026-03-19T15:30:00Z",
  "expiresAt": "2026-03-21T15:30:00Z",
  "fileCount": 12,
  "totalSize": 847000
}
```

### Usage Counters (KV)

```
Key:   _usage:daily:2026-03-19
Value: { "uploads": 15, "r2Writes": 150 }

Key:   _usage:monthly:2026-03
Value: { "r2StorageBytes": 8500000, "totalProjects": 42 }
```

---

## Security

### Upload Validation (Worker)

1. **Request size limit** — reject requests > 10MB before unpacking
2. **Decompression bomb protection** — stream-count cumulative size, abort if > 10MB
3. **File count limit** — max 100 files per project
4. **File type whitelist** — `.html`, `.css`, `.js`, `.json`, `.svg`, `.png`, `.jpg`, `.gif`, `.webp`, `.ico`, `.woff`, `.woff2`, `.txt`, `.xml`
5. **Path traversal protection** — reject entries containing `..` or absolute paths

### Response Security (Worker)

- `Content-Type` set strictly by file extension
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`

### Platform Level (Cloudflare free)

- Rate limiting rules (e.g., 10 uploads/min per IP)
- DDoS protection (built-in)

---

## Cost Control — Multi-Layer Protection

### Layer 1: Cloudflare Free Tier Guarantee

Cloudflare free plans do not auto-upgrade to paid billing. Exceeding limits returns errors, not invoices. Critical: do not enable any paid plan or usage-based billing.

### Layer 2: Worker Usage Tracking & Circuit Breaker

Thresholds set at 70% of free tier limits:

| Metric | Free Limit | Breaker Threshold | Action |
|--------|-----------|-------------------|--------|
| Daily uploads | - | 50 | Reject new uploads |
| KV daily writes | 1,000 | 700 | Reject new uploads |
| R2 total storage | 10 GB | 7 GB | Reject new uploads |
| Worker daily requests | 100,000 | 70,000 | Return static 429 page |

### Layer 3: CDN Caching

All static file responses include `Cache-Control: public, max-age=172800`. Cached requests hit Cloudflare edge nodes and consume zero Worker/R2 quota. This is the most effective cost reduction mechanism.

### Layer 4: Dashboard Alerts

Configure Cloudflare usage email notifications at 50% and 80% thresholds.

---

## Performance

### MVP (do these)

1. **Cache-Control headers** — `public, max-age=172800` on all static responses; Cloudflare CDN caches at 300+ edge nodes worldwide
2. **Parallel R2 writes** — `Promise.all` when writing files during upload

### Future (when needed)

- **KV metadata caching** — use Cache API via `waitUntil` to avoid KV reads on every request
- **ETag / 304 support** — conditional requests to save bandwidth
- **Compression** — Cloudflare auto gzip/brotli for text resources (free, enabled by default)

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Upload > 10MB | `413` — "File size exceeds 10MB limit" |
| Invalid file types found | `400` — lists rejected files |
| Path traversal detected | `400` — rejects entire upload |
| File count > 100 | `400` — "File count exceeds 100 limit" |
| Corrupted tar.gz | `400` — "Unable to decompress file" |
| Expired project accessed | `404` — "This project has expired" |
| Non-existent project | `404` — "Project not found" |
| Usage breaker triggered | `429` — "Service busy, please try again later" |
| R2/KV write failure | `500` — best-effort cleanup of partial writes |

---

## Project Structure

```
show/
├── worker/                    # Cloudflare Worker
│   ├── src/
│   │   ├── index.ts           # Entry, route dispatch
│   │   ├── upload.ts          # Upload handling (unpack, validate, write R2/KV)
│   │   ├── serve.ts           # Static file serving (read from R2)
│   │   ├── cleanup.ts         # Cron expiration cleanup
│   │   ├── usage.ts           # Usage tracking & circuit breaker
│   │   └── constants.ts       # Thresholds, whitelist config
│   ├── wrangler.toml          # Worker config (R2, KV bindings, Cron)
│   └── package.json
│
├── scripts/
│   └── show-deploy.sh         # Deploy script (pack + curl upload)
│
├── skills/
│   └── show-deploy.md         # Claude Code skill definition
│
├── src/                       # Existing frontend landing page (kept)
├── package.json
└── CLAUDE.md
```

---

## Open Source — Easy Self-Hosting

### One-Command Setup

```bash
npx create-show
```

Interactive script that:

1. Prompts for Cloudflare API Token (needs Workers/R2/KV/DNS permissions)
2. Prompts for domain name
3. Creates R2 Bucket
4. Creates KV Namespace
5. Configures DNS wildcard record `*.show.example.com`
6. Deploys Worker
7. Done

### Alternative Deployment Methods

| Method | Audience |
|--------|----------|
| `npx create-show` | Simplest, interactive one-command setup |
| GitHub "Deploy to Cloudflare" button | Fork → click → fill Token & domain → auto deploy |
| Manual `wrangler deploy` | Advanced users who want custom config |

### Design Decisions for Easy Deployment

- **Zero external dependencies** — only Cloudflare, no database/Redis/etc.
- **Single Worker** — one Worker handles all logic
- **Template wrangler.toml** — setup script auto-fills bucket/namespace IDs
- **Works without custom domain** — falls back to `*.workers.dev` subdomain
- **Single config file** — users only need to edit domain name; everything else has sensible defaults

---

## Free Tier Budget (estimated daily usage: 20 deploys, avg 500KB/10 files each)

| Resource | Free Limit | Daily Usage | Headroom |
|----------|-----------|-------------|----------|
| R2 storage | 10 GB/mo | ~10 MB (48h cleanup) | Ample |
| R2 writes | 1M/mo | ~200 | Ample |
| R2 reads | 10M/mo | Traffic-dependent | Ample |
| KV reads | 100K/day | Traffic-dependent | Ample |
| KV writes | 1,000/day | ~20 | Ample |
| Worker requests | 100K/day | Traffic-dependent | Ample |

---

## Future Roadmap (not in MVP)

1. **User authentication** — API Key based, added as Worker middleware
2. **Custom domain support** — users bring their own domain for deployed sites
3. **Configurable expiration** — let deployers choose 1h / 24h / 48h / 7d
4. **Web upload UI** — drag-and-drop interface as alternative to Agent skill
5. **Deployment history** — list past deployments and their status
