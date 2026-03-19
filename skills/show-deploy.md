# Show Deploy

Deploy a static site directory to Show for temporary hosting.

## When to use

Use when the user asks to:

- "deploy to show", "upload to show", "preview this site"
- "部署到 show", "上传到 show", "发布预览"
- Share a static build output publicly

## Prerequisites

- Show must be configured (`~/.show/config.json` must exist with `apiUrl` and `token`)
- Or environment variables `SHOW_API_URL` and `SHOW_TOKEN` must be set
- The target directory must contain static files (HTML, CSS, JS, images, fonts)

## Commands

### Deploy a directory

```bash
node scripts/show.mjs deploy <directory> --name <name> [--mode static|spa] [--json]
```

### List deployments

```bash
node scripts/show.mjs list [--json]
```

### Inspect a deployment

```bash
node scripts/show.mjs inspect <deployment-id-or-url> [--json]
```

## JSON output

Always use `--json` when calling from an agent. Parse the JSON output to extract the URL.

### Deploy success response

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

## Constraints

- Maximum upload size: 10MB (compressed and extracted)
- Maximum 100 files per deployment
- Deployments expire after 48 hours
- Only static file types are supported (HTML, CSS, JS, JSON, images, fonts, etc.)
- Modes: `static` (default, exact file matching) or `spa` (falls back to index.html)

## Exit codes

- `0`: success
- `1`: known error (auth failure, validation error, network error)
- `2`: usage error (bad arguments)
