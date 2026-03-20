# Show

为 AI Agent 设计的临时静态网站托管服务。在 Agent 中说"deploy to show"，获取公开预览链接，48 小时后自动过期。

[English](./README.md)

## 快速开始

```bash
npx skills add polunzh/show
```

然后在你的 Agent 中说 "deploy to show"，就这样。

## 特性

- **Agent 原生** — 在 Claude Code、Codex 或 OpenCode 中说 "deploy to show"
- **零安装** — Skill 使用 bash、tar 和 curl，无需安装任何东西
- **48 小时自动过期** — 部署会自动清理
- **SPA 支持** — 支持客户端路由回退
- **部署令牌认证** — 实例级别保护，非匿名上传
- **零成本** — 完全在 Cloudflare 免费额度内运行

## 工作原理

Skill 指导你的 Agent：

1. 找到构建输出目录（`./dist`、`./build` 等）
2. 打包成 tar.gz
3. 通过 `curl` 上传到 Show API
4. 返回在线 URL

不需要 CLI、不需要全局安装、不需要配置。只需 `npx skills add` 即可。

## 限制

| 约束               | 值                                           |
| ------------------ | -------------------------------------------- |
| 最大上传大小       | 10 MB（压缩和解压后）                        |
| 每次部署最大文件数 | 100                                          |
| 部署有效期         | 48 小时                                      |
| 支持的文件类型     | HTML、CSS、JS、JSON、图片、字体、SVG、XML 等 |

## 自托管

Show 是开源项目，可以零成本部署到你自己的 Cloudflare 账户。详见[自托管指南](./docs/self-hosting.zh-CN.md)。

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
