# Show

为 AI Agent 设计的临时静态网站托管服务。一条命令部署静态站点，获取公开预览链接，48 小时后自动过期。

[English](./README.md)

## 快速开始

```bash
# 部署静态站点
show deploy ./dist --name my-project

# 输出：
# Live at: https://a3f9x2-my-project.127.dev
# Expires: 2026-03-21 15:30 UTC (48h)
```

## 特性

- **一条命令部署** — 从任何 AI Agent 或终端执行 `show deploy ./dist`
- **48 小时自动过期** — 部署会自动清理
- **SPA 支持** — `--mode spa` 启用客户端路由回退
- **部署令牌认证** — 实例级别保护，非匿名上传
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

## 限制

| 约束               | 值                                           |
| ------------------ | -------------------------------------------- |
| 最大上传大小       | 10 MB（压缩和解压后）                        |
| 每次部署最大文件数 | 100                                          |
| 部署有效期         | 48 小时                                      |
| 支持的文件类型     | HTML、CSS、JS、JSON、图片、字体、SVG、XML 等 |

## 配置

客户端从 `~/.show/config.json` 读取配置：

```json
{
  "apiUrl": "https://your-show-instance.example.com",
  "token": "your-deploy-token"
}
```

也可以通过环境变量配置：`SHOW_API_URL` 和 `SHOW_TOKEN`。

## 自托管

Show 是开源项目，可以零成本部署到你自己的 Cloudflare 账户。详见[自托管指南](./docs/self-hosting.md)。

## 开发

```bash
# 本地启动 Worker
vp run worker:dev

# 运行测试
vp test

# 代码检查
vp check
```

## 许可证

MIT
