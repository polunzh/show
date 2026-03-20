# 自托管 Show

## 为什么自托管

- **数据可控** — 部署内容保留在你自己的 Cloudflare 账户中
- **自定义域名** — 使用你自己的域名，而非共享实例
- **团队使用** — 通过单个部署令牌与团队共享私有实例
- **无外部依赖** — 不依赖任何第三方 Show 实例
- **零成本** — 完全在 Cloudflare 免费套餐内运行

## 前置条件

- Node.js 22+
- Cloudflare 账户（免费套餐即可）
- 一个托管在 Cloudflare 的域名（DNS 由 Cloudflare 管理）
- 安装 `wrangler` CLI（`npm install -g wrangler`）

## 部署

### 方式一：自动安装

```bash
git clone https://github.com/polunzh/show.git
cd show
vp install
node scripts/setup.mjs
```

安装脚本会：

1. 创建 R2 存储桶用于文件存储
2. 创建 KV 命名空间用于部署元数据
3. 生成部署令牌
4. 将 Worker 部署到你的账户
5. 将客户端配置写入 `~/.show/config.json`

### 方式二：手动安装

如果你希望手动设置：

```bash
# 1. 克隆并安装
git clone https://github.com/polunzh/show.git
cd show && vp install

# 2. 创建资源
wrangler r2 bucket create show-files
wrangler kv namespace create show-meta
# 记下输出中的 KV namespace ID

# 3. 更新 worker/wrangler.toml
# - 设置 BASE_DOMAIN 为你的域名（如 "example.com"）
# - 设置 KV namespace id

# 4. 部署
wrangler deploy --config worker/wrangler.toml

# 5. 设置部署令牌
openssl rand -hex 32 | wrangler secret put DEPLOY_TOKEN --config worker/wrangler.toml

# 6. 配置 DNS
# 添加通配符 CNAME 记录：*.example.com -> your-worker.workers.dev
# 添加 Worker 路由：*.example.com/*
```

### DNS 配置

部署 Worker 后，在 Cloudflare DNS 中添加以下记录：

| 类型  | 名称 | 内容                      | 代理   |
| ----- | ---- | ------------------------- | ------ |
| CNAME | `*`  | `your-worker.workers.dev` | 已代理 |

然后添加 Worker 路由：`*.yourdomain.com/*` 指向 `show-api`。

**注意：** Cloudflare 免费 SSL 证书只覆盖 `*.yourdomain.com`（一级子域名）。使用 `*.show.yourdomain.com` 这样的二级子域名需要 Advanced Certificate Manager（付费）。建议直接使用 `*.yourdomain.com` 以实现零成本托管。

### 客户端配置

安装完成后，配置客户端：

```bash
mkdir -p ~/.show
cat > ~/.show/config.json << EOF
{
  "apiUrl": "https://your-worker.workers.dev",
  "token": "your-deploy-token"
}
EOF
```

也可以使用环境变量：

```bash
export SHOW_API_URL=https://your-worker.workers.dev
export SHOW_TOKEN=your-deploy-token
```

## 架构

```
Cloudflare Worker (show-api)
  ├── R2 Bucket (show-files)    — 存储部署文件
  ├── KV Namespace (show-meta)  — 存储部署元数据
  ├── DEPLOY_TOKEN secret       — 实例级认证
  └── Cron Trigger (每小时)      — 清理过期部署
```

## 免费套餐用量

| 资源        | 免费额度   | 典型用量                  |
| ----------- | ---------- | ------------------------- |
| R2 存储     | 10 GB/月   | ~10 MB 活跃（48h 过期）   |
| R2 读取     | 1000 万/月 | 取决于访问量              |
| R2 写入     | 100 万/月  | 每天 ~200 次（20 次部署） |
| KV 读取     | 10 万/天   | 取决于访问量              |
| KV 写入     | 1000/天    | 每天 ~20 次（20 次部署）  |
| Worker 请求 | 10 万/天   | 取决于访问量              |

个人使用和小团队场景下，免费额度完全够用。

## 运维

- **自动清理** — 每小时定时任务自动删除过期部署
- **监控** — 使用 Cloudflare Dashboard 查看 Worker 日志和用量告警
- **更新** — 拉取最新代码并重新部署：`git pull && wrangler deploy --config worker/wrangler.toml`
