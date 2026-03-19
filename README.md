# Show

Temporary static hosting for AI Agents. Deploy a static site with one command, get a public preview URL, auto-expire after 48 hours.

[中文文档](./README.zh-CN.md)

## Quick Start

```bash
# Deploy a static site
show deploy ./dist --name my-project

# Output:
# Live at: https://a3f9x2-my-project.127.dev
# Expires: 2026-03-21 15:30 UTC (48h)
```

## Features

- **One-command deploy** — `show deploy ./dist` from any AI Agent or terminal
- **48-hour auto-expiry** — deployments clean up automatically
- **SPA support** — `--mode spa` enables client-side routing fallback
- **Deploy token auth** — instance-level protection, not anonymous
- **Agent-friendly** — JSON output mode for Claude Code, Codex, OpenCode, etc.
- **Zero cost** — runs within Cloudflare free tier limits

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

## Limits

| Constraint               | Value                                              |
| ------------------------ | -------------------------------------------------- |
| Max upload size          | 10 MB (compressed and extracted)                   |
| Max files per deployment | 100                                                |
| Deployment lifetime      | 48 hours                                           |
| Supported file types     | HTML, CSS, JS, JSON, images, fonts, SVG, XML, etc. |

## Configuration

The client reads config from `~/.show/config.json`:

```json
{
  "apiUrl": "https://your-show-instance.example.com",
  "token": "your-deploy-token"
}
```

Or via environment variables: `SHOW_API_URL` and `SHOW_TOKEN`.

## Self-Hosting

Show is open source and designed to run on your own Cloudflare account at zero cost. See [Self-Hosting Guide](./docs/self-hosting.md) for setup instructions.

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
