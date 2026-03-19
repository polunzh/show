# Show

Temporary static hosting for AI Agents. Deploy a static site with one command, get a public preview URL, auto-expire after 48 hours.

Built entirely on Cloudflare's free tier (Workers + R2 + KV).

[中文文档](#中文文档)

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

---

# 中文文档

# Show

为 AI Agent 设计的临时静态网站托管服务。一条命令部署静态站点，获取公开预览链接，48 小时后自动过期。

完全基于 Cloudflare 免费套餐（Workers + R2 + KV）构建。

## 快速开始

```bash
# 部署静态站点
show deploy ./dist --name my-project

# 输出：
# Live at: https://a3f9x2-my-project.show.example.com
# Expires: 2026-03-21 15:30 UTC (48h)
```

## 特性

- **一条命令部署** — 从任何 AI Agent 或终端执行 `show deploy ./dist`
- **48 小时自动过期** — 部署会自动清理
- **SPA 支持** — `--mode spa` 启用客户端路由回退
- **部署令牌认证** — 实例级别保护，非匿名上传
- **可自托管** — 在你自己的 Cloudflare 账户上一键部署
- **Agent 友好** — JSON 输出模式，适配 Claude Code、Codex、OpenCode 等
- **零成本** — 完全在 Cloudflare 免费额度内运行

## 命令

```bash
# 部署目录
show deploy ./dist --name my-project

# 以 SPA 模式部署
show deploy ./dist --name my-spa --mode spa

# 查看本地部署历史
show list

# 检查部署状态
show inspect <部署ID或URL>

# JSON 输出（供 Agent 使用）
show deploy ./dist --name my-project --json
```

## 自托管部署

前置条件：Node.js 22+，拥有域名的 Cloudflare 账户。

```bash
# 克隆并安装
git clone https://github.com/polunzh/show.git
cd show
vp install

# 运行交互式安装
node scripts/setup.mjs
```

安装脚本会：

1. 创建 R2 存储桶和 KV 命名空间
2. 生成部署令牌
3. 部署 Worker
4. 将配置写入 `~/.show/config.json`

你需要手动添加通配符 DNS 记录（`*.show.yourdomain.com`）指向你的 Worker。

## 限制

| 约束               | 值                                           |
| ------------------ | -------------------------------------------- |
| 最大上传大小       | 10 MB（压缩和解压后）                        |
| 每次部署最大文件数 | 100                                          |
| 部署有效期         | 48 小时                                      |
| 支持的文件类型     | HTML、CSS、JS、JSON、图片、字体、SVG、XML 等 |

## 开发

```bash
# 本地启动 Worker
vp run worker:dev

# 运行测试
vp test

# 代码检查
vp check
```
