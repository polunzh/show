# Show Deploy

Deploy the current project's static build output to Show for a temporary public preview.

## When to use

Trigger when the user says:

- "deploy to show", "deploy this", "preview this site"
- "部署到 show", "上传到 show", "发布预览"
- "show me a live preview"
- After building a frontend project and the user wants to share it

## How it works

Show is a temporary static hosting service. You pack a directory into a tar.gz, POST it to a Show API, and get a public URL that auto-expires in 48 hours. No CLI installation needed — just bash, tar, and curl.

## Prerequisites

Two environment variables must be set:

- `SHOW_API_URL` — the Show instance API endpoint
- `SHOW_TOKEN` — the deploy token

Check them:

```bash
echo "API: ${SHOW_API_URL:-not set}" && echo "Token: ${SHOW_TOKEN:+set}"
```

If not set, tell the user they need to set `SHOW_API_URL` and `SHOW_TOKEN` in their environment (shell profile, `.env`, or agent settings), then stop.

## Step 1: Find the build output

Look for common build output directories in the current project:

1. `./dist` (Vite, Webpack, Rollup)
2. `./build` (Create React App)
3. `./out` (Next.js static export)
4. `./public` (if it's a plain static site)

If none exist, suggest building first (`npm run build` or equivalent).

## Step 2: Deploy

Pack and upload using tar + curl. Replace `<DIR>` with the build directory and `<NAME>` with the project name (from `package.json` name field or directory name):

```bash
tar czf /tmp/show-upload.tar.gz -C <DIR> . && \
curl -s -X POST "${SHOW_API_URL}/upload" \
  -H "Authorization: Bearer ${SHOW_TOKEN}" \
  -F "file=@/tmp/show-upload.tar.gz" \
  -F "name=<NAME>" && \
rm -f /tmp/show-upload.tar.gz
```

For SPA projects (React Router, Vue Router, etc.), add `-F "mode=spa"`.

## Step 3: Report the result

The API returns JSON:

```json
{
  "deploymentId": "a3f9x2-my-project",
  "url": "https://a3f9x2-my-project.127.dev",
  "createdAt": "2026-03-19T15:30:00Z",
  "expiresAt": "2026-03-21T15:30:00Z",
  "mode": "static",
  "requestId": "req_01HXYZ..."
}
```

Tell the user:

- The live URL
- When it expires (48h from now)
- The deployment ID

## Inspect a deployment

```bash
curl -s "${SHOW_API_URL}/_admin/deployments/<DEPLOYMENT_ID>" \
  -H "Authorization: Bearer ${SHOW_TOKEN}"
```

## Constraints

- Max upload: 10 MB (compressed and extracted)
- Max 100 files per deployment
- 48-hour auto-expiry
- Static files only (HTML, CSS, JS, JSON, images, fonts, SVG, etc.)
