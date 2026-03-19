# Review: Show Static Hosting Design

**Spec：** [2026-03-19-show-static-hosting-design.md](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md)
**Review Date：** 2026-03-19
**Reviewer：** Codex
**Review Bar：** 严格架构评审，覆盖技术可行性、产品契约、滥用风险、运维一致性与开发者体验

## Findings

### 1. 严重：匿名上传与“Secure by default”目标冲突，当前设计本质上是一个公开匿名托管服务

Spec 明确把用户认证排除在 MVP 外，但同时又暴露了一个任何人都可调用的 `POST /upload` 接口，并希望它运行在共享的 Cloudflare 免费额度之内。这意味着 Show 在 MVP 阶段并不是“面向 AI Agent 的便捷部署工具”，而是“挂在你域名下的匿名静态内容托管入口”。

这会直接带来三类风险：

- 滥用风险：攻击者可以利用公开上传能力托管钓鱼页、恶意脚本或违规内容。
- 成本风险：即使单 IP 限流存在，分布式请求仍然可以快速耗尽免费额度。
- 信任风险：最终公开 URL 挂在你的主域名下，内容安全事故会首先伤害域名信誉，而不是某个隔离租户。

如果产品定位真的是“给 AI Agent 一键部署”，MVP 至少也需要一个轻量的准入机制，例如单个共享部署密钥、每实例私有 token、或安装时生成的 upload secret。否则“安全默认开启”和“零成本可控”都站不住。

References:

- [2026-03-19-show-static-hosting-design.md#L12](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L12)
- [2026-03-19-show-static-hosting-design.md#L15](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L15)
- [2026-03-19-show-static-hosting-design.md#L19](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L19)
- [2026-03-19-show-static-hosting-design.md#L104](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L104)
- [2026-03-19-show-static-hosting-design.md#L204](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L204)
- [2026-03-19-show-static-hosting-design.md#L213](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L213)

### 2. 严重：48 小时过期承诺与当前缓存策略冲突

Spec 把“所有部署 48 小时后过期”当成核心产品契约，同时访问链路要求通过 KV 判断是否过期。但文档又要求所有静态响应统一返回 `Cache-Control: public, max-age=172800`。一旦边缘节点缓存了对象，后续命中缓存的请求就可能不再回到 Worker，自然也不会再检查 KV 的 `expiresAt`。

结果是：系统对外承诺“48 小时后不可访问”，实现上却更接近“最多缓存 48 小时，是否失效取决于边缘缓存行为”。这会直接制造产品语义与实际行为不一致的问题。

如果过期是硬约束，设计必须改成以下任一方向：

- 缓存 TTL 小于剩余过期时间，并按对象剩余寿命动态下发。
- 在过期清理时显式联动缓存清除。
- 或者修改产品文案，不再承诺严格的到期不可访问。

References:

- [2026-03-19-show-static-hosting-design.md#L8](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L8)
- [2026-03-19-show-static-hosting-design.md#L21](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L21)
- [2026-03-19-show-static-hosting-design.md#L136](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L136)
- [2026-03-19-show-static-hosting-design.md#L139](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L139)
- [2026-03-19-show-static-hosting-design.md#L228](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L228)
- [2026-03-19-show-static-hosting-design.md#L240](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L240)

### 3. 严重：`workers.dev` 路径回退方案会让大量静态站点直接不可用

Spec 说“没有自定义域名也能工作”，回退到 `show-api.username.workers.dev/a3f9x2-my-project/` 这样的路径式访问。但大多数静态站点默认是以站点根路径部署的，HTML 里常见的资源引用会写成 `/style.css`、`/assets/app.js`、`/favicon.ico`。在子路径部署时，这些绝对路径会指向 `show-api.username.workers.dev/style.css`，而不是 `show-api.username.workers.dev/a3f9x2-my-project/style.css`。

这意味着“works without custom domain”并不是一个普遍成立的产品能力，而只是对“所有资源都使用相对路径，且构建时显式设置 base path”的那一部分项目成立。对于 Vite、React Router、SPA、以及很多现成模板站点，这个回退方案默认就是坏的。

如果要把这项能力写进 MVP，Spec 需要明确以下至少一项：

- 只支持子域名模式，不承诺 `workers.dev` 路径模式兼容任意站点。
- 要求 deploy 时传入 base path 并重写构建产物。
- 或者在 Worker 层做 HTML 重写与路径适配，但这会显著提高复杂度。

References:

- [2026-03-19-show-static-hosting-design.md#L53](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L53)
- [2026-03-19-show-static-hosting-design.md#L133](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L133)
- [2026-03-19-show-static-hosting-design.md#L137](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L137)
- [2026-03-19-show-static-hosting-design.md#L326](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L326)

### 4. 高：部署流程没有事务性或 manifest，部分失败会留下脏数据并破坏清理闭环

上传流程是“解包后并行写入 R2，再写 KV 元数据”。这在 happy path 下可以工作，但一旦失败，系统会进入没有明确定义的中间态：

- 某些 R2 文件写成功，另一些失败。
- R2 全部写成功，但 KV 元数据写失败。
- KV 写成功，但响应返回前 Worker 异常。

Spec 只写了 “best-effort cleanup of partial writes”，但没有定义 manifest、状态字段、重试策略或清理兜底。更严重的是，定时清理是基于 KV 枚举项目；如果 R2 已写入而 KV 没写成功，这批对象不会被 Cron 扫到，最终变成孤儿数据。

MVP 至少应当引入一种简单但完整的一致性方案，例如：

- 先写一条 `status=uploading` 的 metadata。
- 记录文件清单或 manifest key。
- 文件全部成功后再切到 `ready`。
- 定时任务同时清理过期项目和超时未完成项目。

References:

- [2026-03-19-show-static-hosting-design.md#L122](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L122)
- [2026-03-19-show-static-hosting-design.md#L123](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L123)
- [2026-03-19-show-static-hosting-design.md#L143](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L143)
- [2026-03-19-show-static-hosting-design.md#L145](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L145)
- [2026-03-19-show-static-hosting-design.md#L263](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L263)

### 5. 高：当前 GET 语义不支持 SPA 路由，和“静态网站托管平台”的产品描述不匹配

Spec 把静态网站泛化为“任意静态站点”，但访问逻辑是直接把 URL path 映射到 R2 key，不存在 SPA fallback 规则。这样一来，只要站点使用客户端路由，例如 `/pricing`、`/docs/getting-started`，首次直达这些地址时就会返回 404，而不是 `index.html`。

这不是边角问题，而是现代前端站点的高频需求。除非产品明确写成“只支持多页静态文件站点，不支持 SPA 深链接”，否则这里就是产品承诺与实现能力不一致。

MVP 应该在 spec 里二选一写清楚：

- 默认只支持文件型静态站点，不支持 SPA。
- 或者支持可配置的 SPA fallback，例如“未命中文件时回退到 `index.html`”。

References:

- [2026-03-19-show-static-hosting-design.md#L8](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L8)
- [2026-03-19-show-static-hosting-design.md#L12](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L12)
- [2026-03-19-show-static-hosting-design.md#L137](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L137)
- [2026-03-19-show-static-hosting-design.md#L139](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L139)

### 6. 高：用量熔断设计与 Cloudflare 免费层级的实际约束不匹配

文档把每日/月度用量写入共享 KV key，再据此拒绝上传或直接返回 429。这个设计的问题不只是“实现起来麻烦”，而是作为准入闸门并不可靠：

- 共享 KV key 更新在并发下容易竞争。
- Worker 请求数本身不容易在请求路径内做强一致计量。
- “当 Worker 日请求数超过阈值时返回静态 429 页面”这条规则本身也需要先进入 Worker 才能执行，不能真正阻止 Worker 请求继续消耗。

所以当前 spec 对“熔断器”这件事描述得过于强，实际更像“基于近似指标的软性降载”。如果继续保留这层设计，文案应该更诚实，并明确哪些指标是 admission control，哪些只是 observability。

References:

- [2026-03-19-show-static-hosting-design.md#L176](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L176)
- [2026-03-19-show-static-hosting-design.md#L180](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L180)
- [2026-03-19-show-static-hosting-design.md#L215](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L215)
- [2026-03-19-show-static-hosting-design.md#L224](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L224)

### 7. 中等：免费额度预算按“部署量”估算，忽略了真实成本按“资源请求量”放大

预算部分用“20 次部署、平均 500KB/10 文件”来估算成本，但真正消耗 Worker、KV、R2 的主要不是部署数，而是未命中缓存的资源请求数。一个 10 文件的小站点，每次页面打开都可能放大成多个 Worker/KV/R2 访问。只要缓存命中率不高，免费额度会比表格暗示的速度更快耗尽。

当前表格把 Worker 和 KV 都标成 `Ample`，但没有给出任何流量模型、访问峰值模型、或缓存命中率假设，预算说服力不够。

References:

- [2026-03-19-show-static-hosting-design.md#L137](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L137)
- [2026-03-19-show-static-hosting-design.md#L138](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L138)
- [2026-03-19-show-static-hosting-design.md#L228](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L228)
- [2026-03-19-show-static-hosting-design.md#L331](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L331)
- [2026-03-19-show-static-hosting-design.md#L338](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L338)
- [2026-03-19-show-static-hosting-design.md#L340](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L340)

### 8. 中等：项目 ID 和主机名生成规则定义不足，会把错误推给用户

Spec 只说项目 ID 格式是 `{6-char-random}-{name || dir-name}`，但没有定义 slug 规则、非法字符处理、最大长度、冲突处理和保留字策略。用户只要传入一个稍微真实一点的项目名，例如带空格、中文、下划线、大写、点号或很长的目录名，就可能生成无效域名或极差的 URL。

这类规则如果不在 spec 中明确，最终就会变成“脚本和 Worker 各自做一套处理”，让生成结果不可预测，也让用户难以理解失败原因。

References:

- [2026-03-19-show-static-hosting-design.md#L53](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L53)
- [2026-03-19-show-static-hosting-design.md#L90](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L90)
- [2026-03-19-show-static-hosting-design.md#L121](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L121)

### 9. 中等：文件类型白名单过窄，和“单命令部署静态站点”的开发者体验目标不一致

白名单当前只覆盖一小部分常见扩展名，但真实的前端构建产物经常还会包含 `.webmanifest`、`.map`、`.mjs`、`.avif`、`.ttf`、`.otf`，甚至 `.wasm`。如果目标是“让 AI Agent 一条命令就能把常见静态站点发上去”，那么默认拒绝这些常见资源，会把大量正常项目变成“上传失败且需要手工猜原因”的体验。

除非产品刻意收窄为“只支持最基础的 HTML/CSS/JS 资源站”，否则这里的文件类型支持范围需要重新审视。

References:

- [2026-03-19-show-static-hosting-design.md#L12](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L12)
- [2026-03-19-show-static-hosting-design.md#L119](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L119)
- [2026-03-19-show-static-hosting-design.md#L193](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L193)
- [2026-03-19-show-static-hosting-design.md#L256](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L256)

### 10. 中等：CLI/Agent 交互契约偏弱，缺少适合自动化消费的稳定输出

Spec 强调“从任意 AI Agent 一键调用”，但 `show-deploy.sh` 的输出只有人类可读文本，没有定义机器可读模式、错误码语义或结构化 JSON 输出。对真正的 Agent 集成来说，稳定的契约应该至少包括：

- 成功时可解析的 JSON 输出。
- 明确的退出码。
- 错误类型和可恢复建议。
- 对重复部署、网络抖动、超时的处理方式。

否则每个 Agent 都会在它自己的 skill/tool 里重新包装一层解析逻辑，集成方式并不会像 spec 设想的那样简单统一。

References:

- [2026-03-19-show-static-hosting-design.md#L12](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L12)
- [2026-03-19-show-static-hosting-design.md#L64](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L64)
- [2026-03-19-show-static-hosting-design.md#L66](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L66)
- [2026-03-19-show-static-hosting-design.md#L93](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L93)
- [2026-03-19-show-static-hosting-design.md#L126](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L126)

### 11. 高：产品缺少“发布后管理”闭环，用户无法知道自己发过什么

当前产品流程只覆盖“部署成功，返回一个 URL”，但没有覆盖“之后怎么办”。从产品经理视角看，这会带来明显的使用断裂：

- 用户不知道自己发过哪些项目。
- 用户看不到哪些链接快过期、已经过期、或仍然可用。
- 用户丢失 URL 后，几乎无法找回资产。
- 用户无法执行删除、重新部署、续期这类后续动作。

更关键的是，这不只是缺一个列表页，而是缺少“所有权模型”。系统现在没有账号、没有 owner token、没有本地部署索引，也没有任何把多个 deployment 归属于同一个用户的机制。因此产品实际上只能完成“一次性发出去”，无法形成基本管理闭环。

克制的 MVP 设计应该先解决“可见性”，而不是一开始做完整控制台：

- `show-deploy` 成功后，把 deployment 记录到本地 ledger，例如 `~/.show/deployments.json`。
- 记录最小字段：`projectId`、`url`、`createdAt`、`expiresAt`、`sourcePath`、`deploymentName`。
- 提供只读的 `show list` 能力，按“active / expired”展示。
- 明确这是“本机视角”的 deployment history，不承诺跨设备同步。

如果未来要进入真正产品化，再引入实例级 owner token，把 deployment 与 owner 关联，再做远端 `list / delete / extend / redeploy`。但这些不应该在当前 MVP 一起展开，否则产品范围会失控。

References:

- [2026-03-19-show-static-hosting-design.md#L8](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L8)
- [2026-03-19-show-static-hosting-design.md#L12](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L12)
- [2026-03-19-show-static-hosting-design.md#L71](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L71)
- [2026-03-19-show-static-hosting-design.md#L95](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L95)
- [2026-03-19-show-static-hosting-design.md#L349](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L349)
- [2026-03-19-show-static-hosting-design.md#L350](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L350)

### 12. 高：缺少最小可观测性设计，系统一旦出问题，人类几乎没有排障抓手

从产品和运维视角看，这份 spec 目前默认“上传失败就返回错误，访问失败就返回 404/429/500”，但没有定义任何面向人类操作者的诊断机制。对于一个由 Agent 触发、由普通开发者自托管的系统，这会造成非常现实的问题：

- 用户看到“部署失败”却不知道是体积超限、文件类型不支持、R2 写失败，还是平台限流。
- 用户看到链接打不开，却无法区分是项目过期、资源缺失、域名路由错误，还是 Worker 异常。
- 自托管实例的维护者即使愿意排查，也缺少 deployment 级别、request 级别、cleanup 级别的最小线索。

这不是要一开始就上完整日志平台，而是至少要定义“人类可诊断”的最小面。克制的 MVP 可以只做这几件事：

- 给每次上传分配 `requestId` / `deploymentId`，所有错误响应都返回这个 ID。
- 结构化记录关键事件：`upload_received`、`upload_rejected`、`upload_completed`、`serve_miss`、`serve_expired`、`cleanup_deleted`、`cleanup_failed`。
- 对部署脚本提供 `show status <id>` 或最小 `show inspect <url>` 能力，能查到基本状态和失败原因。
- 定义面向部署者的错误文案，不要只返回裸状态码。

如果这块缺失，Show 对 AI Agent 来说也许“看起来自动化”，但对真正的人类维护者来说几乎不可运维。一旦出问题，用户既不能自助判断，也无法向别人提供足够上下文求助。

References:

- [2026-03-19-show-static-hosting-design.md#L71](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L71)
- [2026-03-19-show-static-hosting-design.md#L124](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L124)
- [2026-03-19-show-static-hosting-design.md#L141](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L141)
- [2026-03-19-show-static-hosting-design.md#L251](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L251)
- [2026-03-19-show-static-hosting-design.md#L303](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L303)

## Open Questions

### 1. `*.show.example.com` 的通配子域名到底依赖什么机制

Spec 最好明确说明这里依赖的是 Workers Route、DNS 记录、还是别的 Cloudflare 路由能力。当前文案容易让读者把“通配 DNS + 部署 Worker”误解成“Custom Domains 直接支持任意通配子域”。

References:

- [2026-03-19-show-static-hosting-design.md#L133](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L133)
- [2026-03-19-show-static-hosting-design.md#L309](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L309)
- [2026-03-19-show-static-hosting-design.md#L326](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L326)

### 2. 过期页面、找不到页面、被限流页面是否真的都要返回裸 404/429

从安全角度，把“过期”和“不存在”都做成 404 有一定合理性；但从产品和 UX 角度，部署者拿到链接后，再回访看到一个没有上下文的错误页，几乎无法判断是“链接打错了”“项目过期了”还是“平台繁忙”。Spec 目前没有定义面向最终访问者的错误页体验。

References:

- [2026-03-19-show-static-hosting-design.md#L95](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L95)
- [2026-03-19-show-static-hosting-design.md#L253](/Users/zhenqiang/Documents/code/show/docs/specs/2026-03-19-show-static-hosting-design.md#L253)

## Necessary Modules

从架构边界看，当前 spec 不是“功能太少”，而是“核心闭环缺了几个必要模块”。如果坚持克制的 MVP，我认为只需要补下面 4 个模块，其他都先不要做。

### 1. Upload Admission Module

职责：决定谁可以上传。

为什么必要：

- 没有这一层，系统就是公开匿名托管入口。
- 安全、成本、滥用控制都无从成立。

MVP 形态：

- 单实例共享 secret，或安装时生成的 deploy token。
- `POST /upload` 校验 token。
- 不做用户系统，不做多角色，不做权限后台。

### 2. Deployment State Module

职责：定义 deployment 的生命周期，而不只是“传完就算成功”。

为什么必要：

- 没有状态机，上传部分失败会留下脏数据和孤儿文件。
- 清理任务也没有可靠依据判断什么该删、什么是异常中间态。

MVP 形态：

- metadata 中至少有 `uploading / ready / failed / expired` 这几个状态。
- 记录最小 manifest 或 file list。
- cleanup 同时处理过期 deployment 和超时未完成 deployment。

### 3. Deployment History Module

职责：让部署者知道自己发过什么。

为什么必要：

- 没有 history，就没有发布后管理闭环。
- 用户丢链接后无法恢复控制。

MVP 形态：

- 先做本地 ledger，例如 `~/.show/deployments.json`。
- 提供 `show list`。
- 不做远端控制台，不做跨设备同步。

### 4. Observability Module

职责：让人类能判断问题出在哪。

为什么必要：

- 这个产品由 Agent 触发，但最终要由人类维护。
- 没有最小可观测性，系统出问题时只能“重试看看”，不可运维。

MVP 形态：

- 每次请求生成 `requestId` / `deploymentId`。
- 错误响应返回 ID。
- 记录少量结构化事件。
- 提供 `show inspect <url>` 或 `show status <id>`。

### 明确不需要现在做的模块

这些方向以后可能有价值，但现在不应该进入 MVP：

- 用户账号系统
- Web 管理后台
- 自定义域名管理
- 复杂权限模型
- 远端日志平台
- 配额计费系统
- 多租户组织空间
- 实时分析面板

## Overall Assessment

这份设计的方向是对的：它抓住了一个真实需求，即“让 Agent 能把静态产物快速公开出来”。但当前 spec 还没有把“便捷、免费、安全、可自托管”这四个目标收敛成一个彼此兼容的 MVP。

现在最大的架构问题不是某个 API 细节，而是产品契约本身还不稳定：

- 你想要匿名易用，但这会冲击安全和成本控制。
- 你想要强缓存省钱，但这会冲击严格过期。
- 你想要 `workers.dev` 回退兼容，但这会冲击站点兼容性。

建议先缩小 MVP 口径，再写实现 spec。比较务实的版本会是：

- 只支持带 secret 的私有上传，不做真正匿名公开上传。
- 只承诺子域名模式，不承诺 `workers.dev` 路径模式兼容任意项目。
- 明确“不支持 SPA fallback”或显式加入该能力。
- 把“强一致熔断”降级为“软监控 + 人工告警”。
- 为部署状态和清理引入最小 manifest/state 机制。
- 增加一个极简的 deployment history 机制，先解决“我发过什么”，不要急着做完整后台。
- 定义最小可观测性：requestId、结构化事件、可查询的失败原因。

## Notes

本次 review 中涉及 Cloudflare 平台限制和路由能力的判断，已对照当前官方文档核过 Workers limits、KV limits、R2 pricing 以及 Workers custom domain routing。
