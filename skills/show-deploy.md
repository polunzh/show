# Show Deploy

Deploy the current project's static build output to Show for a temporary public preview.

## When to use

Trigger when the user says:

- "deploy to show", "deploy this", "preview this site"
- "部署到 show", "上传到 show", "发布预览"
- "show me a live preview"
- After building a frontend project and the user wants to share it

## How it works

Show is a temporary static hosting service. You deploy a directory, get a public URL, it auto-expires in 48 hours.

## Step 1: Check if Show is configured

```bash
cat ~/.show/config.json 2>/dev/null
```

If the file doesn't exist or is empty, tell the user:

> Show is not configured yet. You need an API URL and deploy token from a Show instance.
> Run `show init` to set it up interactively, or ask your team for the credentials.

Then stop. Do not proceed without configuration.

## Step 2: Find the build output

Look for common build output directories in the current project:

1. `./dist` (Vite, Webpack, Rollup)
2. `./build` (Create React App)
3. `./out` (Next.js static export)
4. `./.next/out` (Next.js)
5. `./public` (if it's a plain static site)

If no build directory is found, suggest building first:

```bash
vp build  # or npm run build
```

## Step 3: Deploy

```bash
show deploy <directory> --name <project-name> --json
```

- Use the project name from `package.json` or the directory name as `--name`
- Always use `--json` to get structured output
- Add `--mode spa` if the project uses client-side routing (React Router, Vue Router, etc.)

## Step 4: Report the result

Parse the JSON output and tell the user:

- The live URL
- When it expires
- The deployment ID (for `show inspect` later)

## Example output

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

## Other commands

```bash
show list --json          # List local deployment history
show inspect <id> --json  # Check deployment status
```

## Constraints

- Max upload: 10 MB (compressed and extracted)
- Max 100 files per deployment
- 48-hour auto-expiry
- Static files only (HTML, CSS, JS, JSON, images, fonts, SVG, etc.)
