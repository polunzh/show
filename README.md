# Show

Temporary static hosting for AI Agents. Deploy a static site with one command, get a public preview URL, auto-expire after 48 hours.

Built entirely on Cloudflare's free tier (Workers + R2 + KV).

[中文文档](./README.zh-CN.md)

## Quick Start

```bash
# Deploy a static site
show deploy ./dist --name my-project

# Output:
# Live at: https://a3f9x2-my-project.show.example.com
# Expires: 2026-03-21 15:30 UTC (48h)
```

## Features

- **One-command deploy** — `show deploy ./dist` from any AI Agent or terminal
- **48-hour auto-expiry** — deployments clean up automatically
- **SPA support** — `--mode spa` enables client-side routing fallback
- **Deploy token auth** — instance-level protection, not anonymous
- **Self-hostable** — one-command setup on your own Cloudflare account
- **Agent-friendly** — JSON output mode for Claude Code, Codex, OpenCode, etc.
- **Zero cost** — runs within Cloudflare free tier limits

## Architecture

```
AI Agent / Terminal
      │
      ▼  show deploy ./dist
Cloudflare Worker
  ├── R2 Bucket (file storage)
  ├── KV Namespace (metadata)
  └── Cron Trigger (hourly cleanup)
      │
      ▼
https://{id}-{name}.show.example.com
```

## Commands

```bash
# Deploy a directory
show deploy ./dist --name my-project

# Deploy as SPA
show deploy ./dist --name my-spa --mode spa

# List local deployment history
show list

# Inspect a deployment
show inspect <deployment-id-or-url>

# JSON output (for agents)
show deploy ./dist --name my-project --json
```

## Self-Hosting Setup

Prerequisites: Node.js 22+, a Cloudflare account with a domain.

```bash
# Clone and install
git clone https://github.com/polunzh/show.git
cd show
vp install

# Run interactive setup
node scripts/setup.mjs
```

The setup script will:

1. Create R2 bucket and KV namespace
2. Generate a deploy token
3. Deploy the Worker
4. Write local config to `~/.show/config.json`

You'll need to manually add a wildcard DNS record (`*.show.yourdomain.com`) pointing to your Worker.

## Limits

| Constraint               | Value                                              |
| ------------------------ | -------------------------------------------------- |
| Max upload size          | 10 MB (compressed and extracted)                   |
| Max files per deployment | 100                                                |
| Deployment lifetime      | 48 hours                                           |
| Supported file types     | HTML, CSS, JS, JSON, images, fonts, SVG, XML, etc. |

## Project Structure

```
show/
├── worker/src/       # Cloudflare Worker
├── scripts/show.mjs  # Local CLI client
├── scripts/setup.mjs # One-time setup
├── skills/           # AI Agent skill definitions
├── docs/             # Design spec, review, implementation plan
└── src/              # Landing page
```

## Configuration

The client reads config from `~/.show/config.json`:

```json
{
  "apiUrl": "https://show.example.com",
  "token": "your-deploy-token"
}
```

Or via environment variables: `SHOW_API_URL` and `SHOW_TOKEN`.

## Development

```bash
# Start Worker locally
vp run worker:dev

# Run tests
vp test

# Lint and type check
vp check
```

## License

MIT
