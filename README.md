# Show

Temporary static hosting for AI Agents. Say "deploy to show" in your Agent, get a public preview URL, auto-expire after 48 hours.

[中文文档](./README.zh-CN.md)

## Quick Start

1. Add the [show-deploy.md](./skills/show-deploy.md) skill to your agent's skills directory
2. Set environment variables: `SHOW_API_URL` and `SHOW_TOKEN`
3. Say "deploy to show" — your Agent handles the rest

```bash
# Claude Code example
mkdir -p .claude/skills
curl -sL https://raw.githubusercontent.com/polunzh/show/master/skills/show-deploy.md \
  -o .claude/skills/show-deploy.md

# Set credentials
export SHOW_API_URL=https://your-instance.workers.dev
export SHOW_TOKEN=your-deploy-token
```

## Features

- **Agent-native** — just say "deploy to show" in Claude Code, Codex, or OpenCode
- **Zero install** — skill uses bash, tar, and curl. Nothing to install.
- **48-hour auto-expiry** — deployments clean up automatically
- **SPA support** — handles client-side routing fallback
- **Deploy token auth** — instance-level protection, not anonymous
- **Zero cost** — runs within Cloudflare free tier limits

## How it works

The skill instructs your Agent to:

1. Find the build output directory (`./dist`, `./build`, etc.)
2. Pack it into a tar.gz
3. Upload via `curl` to the Show API
4. Return the live URL

No CLI binary, no npm package, no global install. Just a skill file and two environment variables.

## Limits

| Constraint               | Value                                              |
| ------------------------ | -------------------------------------------------- |
| Max upload size          | 10 MB (compressed and extracted)                   |
| Max files per deployment | 100                                                |
| Deployment lifetime      | 48 hours                                           |
| Supported file types     | HTML, CSS, JS, JSON, images, fonts, SVG, XML, etc. |

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
