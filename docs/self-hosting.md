# Self-Hosting Show

## Why Self-Host

- **Data control** — your deployments stay on your own Cloudflare account
- **Custom domain** — use your own domain instead of a shared instance
- **Team use** — share a private instance with your team, controlled by a single deploy token
- **No dependency** — you don't rely on any third-party Show instance
- **Zero cost** — runs entirely within Cloudflare's free tier

## Prerequisites

- Node.js 22+
- A Cloudflare account (free plan is sufficient)
- A domain managed by Cloudflare (DNS hosted on Cloudflare)
- `wrangler` CLI installed (`npm install -g wrangler`)

## Deploy

### Option 1: Automated Setup

```bash
git clone https://github.com/polunzh/show.git
cd show
vp install
node scripts/setup.mjs
```

The script will:

1. Create an R2 bucket for file storage
2. Create a KV namespace for deployment metadata
3. Generate a deploy token
4. Deploy the Worker to your account
5. Write local client config to `~/.show/config.json`

### Option 2: Manual Setup

If you prefer to set up manually:

```bash
# 1. Clone and install
git clone https://github.com/polunzh/show.git
cd show && vp install

# 2. Create resources
wrangler r2 bucket create show-files
wrangler kv namespace create show-meta
# Note the KV namespace ID from the output

# 3. Update worker/wrangler.toml
# - Set BASE_DOMAIN to your domain (e.g., "example.com")
# - Set the KV namespace id

# 4. Deploy
wrangler deploy --config worker/wrangler.toml

# 5. Set deploy token
openssl rand -hex 32 | wrangler secret put DEPLOY_TOKEN --config worker/wrangler.toml

# 6. Configure DNS
# Add a wildcard CNAME record: *.example.com -> your-worker.workers.dev
# Add a Worker route: *.example.com/*
```

### DNS Configuration

After deploying the Worker, add these records in Cloudflare DNS:

| Type  | Name | Content                   | Proxy   |
| ----- | ---- | ------------------------- | ------- |
| CNAME | `*`  | `your-worker.workers.dev` | Proxied |

Then add a Worker Route: `*.yourdomain.com/*` pointing to `show-api`.

**Note:** Cloudflare free SSL only covers `*.yourdomain.com` (one level). Using a subdomain like `*.show.yourdomain.com` requires Advanced Certificate Manager (paid). Use `*.yourdomain.com` directly for zero-cost hosting.

### Client Configuration

After setup, configure the client:

```bash
mkdir -p ~/.show
cat > ~/.show/config.json << EOF
{
  "apiUrl": "https://your-worker.workers.dev",
  "token": "your-deploy-token"
}
EOF
```

Or use environment variables:

```bash
export SHOW_API_URL=https://your-worker.workers.dev
export SHOW_TOKEN=your-deploy-token
```

## Architecture

```
Cloudflare Worker (show-api)
  ├── R2 Bucket (show-files)    — stores deployment files
  ├── KV Namespace (show-meta)  — stores deployment metadata
  ├── DEPLOY_TOKEN secret       — instance-level auth
  └── Cron Trigger (hourly)     — cleans up expired deployments
```

## Free Tier Limits

| Resource        | Free Limit  | Typical Usage              |
| --------------- | ----------- | -------------------------- |
| R2 storage      | 10 GB/month | ~10 MB active (48h expiry) |
| R2 reads        | 10M/month   | Depends on traffic         |
| R2 writes       | 1M/month    | ~200/day at 20 deploys     |
| KV reads        | 100K/day    | Depends on traffic         |
| KV writes       | 1,000/day   | ~20/day at 20 deploys      |
| Worker requests | 100K/day    | Depends on traffic         |

For personal use and small teams, free tier limits are more than sufficient.

## Maintenance

- **Cleanup is automatic** — the hourly cron deletes expired deployments
- **Monitoring** — use Cloudflare Dashboard for Worker logs and usage alerts
- **Updating** — pull latest code and redeploy: `git pull && wrangler deploy --config worker/wrangler.toml`
