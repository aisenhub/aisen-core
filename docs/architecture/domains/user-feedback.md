# AisenCore 跨 SaaS 用户反馈系统架构

> **状态：2026-10-27 / 当前 Admin FB-V3 四队列轻量工作流已本地编码，数据库 462/462 pgTAP 与专项真实 AAL2 Chrome 曾 PASS；人工 WCAG/视觉/性能、真实私有 Cloudflare R2 含图、对象安全对账及线上部署仍 OPEN；Lens Chrome 双图→Edge→Postgres→隔离本机 S3 和 Core 私图/AAL2 ZIP 已 PASS（[本地证据](../../Plans/aisenlens-aisencore-local-integration/2026-10-27-f07-private-s3-e2e-evidence.md)）。** 旧 V2 处理状态保留历史读取，不作为新可编辑合同。
> **单一领域权威**：反馈语义、状态和权限以本文为准；存储归属参见[产品数据与文件](../database/product-data-and-files.md)，客户端/API 调用参见[公共 API](../backend/public-api-and-saas-integration.md)，UI 接入参见[Admin](../applications/admin-console.md)，阶段顺序参见[三阶段总则](../../Plans/aisencore-mvp/three-stage-delivery-gates.md)。

## 1. 产品范围与原则

- 各 SaaS（AisenLens、AisenNote 等）按**真实 `products.id`**归属反馈；公共 Core 统一收件，Admin 可全平台查看或按产品过滤。反馈是公共运营资料，不因此将 SaaS 项目、视频、AI 输入、密钥纳入公共数据库。
- 用户提交**一段必填文字 + 0～2 张可选图片**，不强制标题。AisenLens 仅提供设置/帮助内的单向提交对话框，不建独立历史、进度、回复或站内消息页面；本人受限查询仅用于 UNKNOWN 恢复及权限测试，不自动扩展客户端功能。
- 用户提交需要本人有效 Supabase Auth JWT、已确认邮箱、未被全平台 blocked；不要求 Pro、产品成员 `active` 或自动 `ensure_membership`，因为反馈可能恰好涉及账号/成员/Pro 故障。可信端验证产品存在及反馈目标资格，前端 product_key 不是授权凭据。
- AisenLens 匿名离线 Free 保持不登录可用；首版反馈入口可以要求登录，但**不能阻断离线 Free 使用**。匿名反馈、复杂反滥用和匿名身份找回另议。
- 当前只有一名运营者：不建客服 SaaS、坐席、多租户工单、AI 分诊、SLA、自动派单、邮件通知或消息队列；提交成功仅表示收到。注销渠道独立，待上线前确定，不能用反馈假报已受理。

## 2. 存储与文件边界

| 数据 | 存储位置 | 不变量 |
| --- | --- | --- |
| 反馈原文、产品/用户归属、处理状态、优先级、时间 | AisenCore 公共 Supabase PostgreSQL | 数据可安全筛选、分页、事务变更 |
| 图片元数据：反馈外键、槽位、大小、实际 MIME、R2 对象 key | 同一公共 PostgreSQL | 数据库强制最多两张 |
| 图片本体 | **Cloudflare R2 私有 Bucket** | Key 不是访问权限，不存长期签名 |
| 队列/标记变化、内部备注、已有公开历史 | PostgreSQL 追加事件 | 用户不读内部字段；本期不新增用户追加说明或管理员公开回复 |

选择 **PostgreSQL + R2**，不为这一模块另外使用 Supabase Storage，沿用公共结构化数据 + R2 文件本体的既有技术决策。

**当前实现的上传前可计算对象路径**：`feedback/{product_id}/{user_id}/{request_id}/{slot}-{sha256}.{validated_ext}`。因为 R2 对象先写、数据库反馈 ID 后生成，不能用尚不存在的反馈 ID 作为上传 key。对象由受保护 Edge 依据已认证用户、服务端查到的产品 UUID、幂等请求号和**实际图片 SHA-256**生成，条件创建、禁止覆盖；重试同图生成同一 key，不附原始文件名。R2 key 只表示位置，绝不是授权票据，不能以 URL 猜测决定权限。仍需部署前验证孤儿清理、短签名和跨服务故障一致性。

**受限小图上传路径**：因为每份反馈最多 2 张小图，优先由受保护 **Supabase Edge Function** 接收上传，逐项检查认证、实际图片签名、长度、数量、整请求体上限，使用服务器最小权限 R2 凭据写入；可信数据库 RPC 做归属、幂等和最终入库。该方案是独立于 **AisenLens 小体积非敏感 JSON 配置备份**的**第二种严格限定 Edge 上传例外**；不能扩展为大型视频、普通 SaaS 私有文件、项目内容或 AI 输入的通用中转服务。

**已采纳的本地测试参数，正式运营仍须验证**：单图最多 **3 MiB**、正文最长 **5,000 字符**、图片读取临时 URL **60 秒**。首版**最多两张**是已定业务限制；字节上限、正文上限、读取 TTL 和接口频率先沿当前实现用于隔离测试，再按实测冻结；留存/物理回收政策公开前确定，不自动新增按年龄删除。拒绝 SVG、执行内容、伪造 MIME、非法编码和超限上传。

**实施中的隐私与稳定性补充（2026-10-25）**：当前用户本人反馈 DTO 安全返回回复版本号和可用于再鉴权的附件 ID/槽位，**不返回对象 key**；Admin 列表透过 PostgreSQL `security_invoker` 视图结合原表 RLS 计算附件数。新反馈本地开发暂定 **5 条/用户/小时** 的数据库预检及同用户事务锁内二次检查，成功请求原号重放不再计数；该阈值仍需最终运营批准。图片对象使用确定性 hash key，同号并发请求可能复用对象，**禁止因任一请求失败而立刻删除该 key**；未来定期回收必须先核实所有可能成功的数据库引用并具有保护期、审计和异常恢复，真实 R2 清理未实现。

## 3. 最小数据模型（3 张表）

### `public.user_feedback`

| 字段 | 类型/约束候选 | 作用 |
| --- | --- | --- |
| `id` | uuid PK | 不可变内部 ID |
| `feedback_no` | bigint unique | 易读编号，可有间隙 |
| `product_id` | uuid FK → products.id, not null | 唯一产品归属 |
| `user_id` | uuid FK → auth.users.id, not null | 必须从可信认证上下文获取 |
| `contact_email` | text；新提交由可信RPC强制必填与校验 | 本条未经单独验证的沟通地址，不修改认证邮箱；已保存事实不回填 |
| `content` | text not null | 反馈原文，拒绝全空白 |
| `category` | text check | `bug/account/experience/suggestion/other` |
| `status` | nullable | 仅处理工作台五态非空 |
| `priority` | nullable 默认 NULL | 仅管理员明确分诊后有值 |
| `queue_state` | inbox/workbench/archived/trashed | 两阶段及归档/回收站 |
| `read_at/triaged_at` | timestamptz nullable | 阅读及正式晋升时间 |
| `is_starred/tags` | boolean/text[] | 星标和工作台内部标签 |
| `archived_at/deleted_at/deleted_from` | nullable | 归档、软删除和恢复原阶段 |
| `assigned_to` | uuid nullable | 当前有效处理人，可不分配 |
| `request_id` | uuid not null | 用户提交幂等，唯一 `(user_id,product_id,request_id)` |
| `version` | int default 1 | 并发写入版本 |
| `created_at/updated_at` | timestamptz not null | 创建/最新业务更新时间 |
| `resolved_at/closed_at` | timestamptz nullable | 最近解决/关闭时间；重开时修正 |

索引先围绕 `(product_id,status,updated_at desc)` 和全局更新时间的真实管理查询实现，避免预设大量搜索索引。

### `public.feedback_attachments`

字段：`id` UUID PK、`feedback_id` FK、`slot`、`object_key` UNIQUE、`mime_type`、`size_bytes`、`created_at`。硬约束 `CHECK(slot IN (1,2))`、`UNIQUE(feedback_id,slot)`：无论前端是否绕过校验都不允许第三张。文件读取权限**继承反馈本人的归属或管理员资格**，不能单凭对象 key/图片 ID 授权。首版附件只在创建时上传，不做替换/历史版本。

### `public.feedback_events`

字段：`id`、`feedback_id`、`actor_user_id`、`event_type`、`visibility`（`internal/public`）、`from_status/to_status`、`message`、`operation_id`、`created_at`。事件覆盖状态、优先级、责任人变更、`internal_note`、`public_reply`、`user_reply`。服务端派生 actor 与可见性，不相信客户端声称的角色。事件只追加，公开回复**仅反馈本人可读**，不是互联网公开。

管理审计 `admin_audit_log` 只记录最小的操作人、反馈 ID、动作、状态前后和时间，**不得复制**原文、内部备注、截图或预签名 URL。状态/事件/必要审计处于同一数据库事务。

## 4. 当前 FB-V4 三队列、五分类与永久删除合同

> **V4 为现行 Admin 合同**：历史 V2/V3 中的回收站、自定义标签、旧五态、负责人和对用户主动回复不再是新界面的有效动作；历史数据库数据与测试记录仍予保留。实施与验收参见 [V4 反馈治理计划](../../Plans/aisencore-mvp/2026-10-29-feedback-admin-ux-bulk-delete-remediation-plan.md)。

| 队列 | 当前动作 | 不变量 |
| --- | --- | --- |
| `inbox` 收件箱 | 查看、设置优先级/星标/内部备注，分诊进入工作台；单条/批量永久删除 | 版本锁与 AAL2 受保护 RPC；首次阅读不等于受理 |
| `workbench` 处理工作台 | 保存标记/内部备注、归档、单条/批量永久删除与受控 ZIP | 不编辑五态、负责人或公开回复 |
| `archived` 已归档 | 重新进入工作台、读取/导出或明确永久删除 | 不从收件箱绕过分诊直接归档 |

使用提交者原有五类别 `bug/account/experience/suggestion/other`（问题反馈/账号问题/体验问题/功能建议/其他）作为唯一类别筛选与列表分类标记；不再显示或更改管理员自定义标签。单产品视角只显示当前产品相关反馈，不重复显示产品名称；全平台视角展示真实所属产品。管理员按当前页选择最多 20 条，支持逐条版本检查的合法批量移动和永久删除，明确报告成功/失败/结果未知。**永久删除必须真实完成**：受保护 SQL 冻结反馈，Edge 逐次校验 AAL2 与管理员资格，删除 R2 原图及其 `.thumb.jpg` 派生对象，然后在同一个数据库事务内删除反馈、事件与附件元数据并记录最小内容无关审计。跨 R2 与 PostgreSQL 无原子事务，失败留待清理任务，不伪称完成；旧 `trashed` 行不得自动清除。

**受控 ZIP**：通过 `feedback-export` Edge 按实时权限及冻结的所选 ID/服务器筛选导出，默认不含内部评论和直接身份；启用敏感选项须二次确认，变更产品/筛选范围时阻断旧确认。含正文、必要原图、manifest/JSONL/Markdown 与 SHA-256 清单，图片缺失或读取失败不得伪造成功。当前技术候选每次最多 20 条、原始图片总量约 20 MiB、ZIP 24 MiB，尚需受控负载、真实 R2 和用户确认。

## 5. API、授权与跨存储失败恢复

### 5.1 用户提交

1. 客户端本人 JWT + `product_key` + `request_id` + `content` + `category` + `contact_email` + 0～2 图请求 `feedback-submit` Edge。服务端验证 JWT/邮箱确认/blocked/真实产品、反刷限流、图片签名/字节数/总请求大小。不创建产品成员、不检查 Pro。
2. Edge 为每图生成唯一不可覆盖 R2 key 并写入**私有**对象；不向客户端暴露 R2 长期密钥、任意 key 写入凭证。
3. 可信 `feedback_submit_from_edge` RPC 在同一 PostgreSQL 事务内创建反馈、附件元数据、首条事件；绝不接受普通客户端伪造的 R2 key 直写，限制仅可信 Edge 可提交已核实元数据，避免可被普通角色调用的 `SECURITY DEFINER` 越权入口。
4. 返回本人可见的最小摘要及 `id/feedback_no/status=received`。同一身份+产品+`request_id` 重试必须正文/类别/联系邮箱/图片全部一致才返回原结果，否则409；超时视为 UNKNOWN，先按本人 `request_id` 查询再重试，不换 ID 导致重复反馈。

**不具备跨服务 ACID**：R2 成功但 DB 未提交可能形成孤儿，清理任务必须按受控对象标识/请求记录扫描清除并记录失败；DB 已提交但响应丢失应通过幂等查询恢复；两图只写一图时不得生成“成功完成”的可见反馈。清理执行者/周期/最小 R2 权限与实际异常注入须在部署前验证，不把 Mock 当真实 R2。

### 5.2 读/处理/用户补充

- 用户本人反馈清单与公开事件通过受限只读 RPC 或严格安全投影（列白名单）访问，结合 RLS/GRANT 禁止查看他人反馈、其他用户的公开答复及全部内部事件。用户前端不应通过直接 SELECT 管理员内部字段。
- Admin 使用已有 `DataProvider.getList/getOne` + PostgREST + **Admin RLS** 分页读取；**当前 V3 写入通过 `admin_feedback_v3` 等受保护 RPC** 验证 `aal2`、当前平台管理员资格、blocked 与乐观版本，并原子提交队列/优先级/标签/星标/私有备注/事件/必要审计；旧 `admin_update_feedback` 仅保留与历史数据相关的受保护原合同，不得绕过 V3 队列保护。前端权限缓存不是授权凭证。
- 当前不开放用户追加说明/回复能力；源码仍有旧 `reply_to_feedback` 等写入口，后续按现行单向合同清点并移除不再使用的写路径、调用者和测试，不保留兼容层。已有历史事件只作事实读取；本次仅改文档，未撤销或删除任何真实函数。
- **`feedback-image-access`** Edge 每次验证当前访问者为反馈本人或有权 Admin，再签发短期 GET；R2 Bucket 禁止公网裸读，URL 有效期内无法保证瞬时撤权，前端不持久化/记录 URL。

**当前状态（部分修复/待端到端验收）**：F05 反馈提交的 Auth 用户查询、本人恢复读 RPC 以及图片签发鉴权 RPC 已编码区分显式 401/403 与未知服务故障 503；共享 Deno 测试（上传、ZIP、隔离 S3 三套）11/11 PASS，但尚未在正式 Edge handler 进行真实上游 5xx/断连注入，不能将 F05 认定全部通过。`my_feedback(p_product_key,p_request_id?)` 已在 F06 后继 SQL 迁移编码：普通本人列表按产品过滤再限制 100 条并隐藏回收站，按产品和原号的精确恢复无列表截断；已软删的原号只返回本人最小存在证明，不暴露内部队列/正文/附件。新迁移及受影响 009/010/013 pgTAP 在单独回滚事务中 **116/116 PASS**；迁移尚未持久部署，真实 HTTP/Edge/Lens 未验证，空数组仍不可断言写入绝对失败。按本人/产品/原号同参恢复，不换号造第二单；旧五态投影不能作为 V3 处理进度。F07 已将正式 `feedback-submit` 的图片检查接入固定版本 `jsr:@matmen/imagescript@3.3.0` 的真解码（PNG/JPEG/WebP、最大 12,000,000 像素、最大单边 6000、本地候选界限，PNG/JPEG 尾标识及 WebP RIFF 长度严格验证）。`R2_FEEDBACK_STORAGE_MODE=local-test` 配合受限本机 `R2_FEEDBACK_TEST_ENDPOINT` 才允许隔离 S3 代替真实 R2，普通默认仍使用 Cloudflare R2；共享测试中已证明 putFile/readFile/signedGet/deleteFile 使用同一隔离实例，签名 60 秒且拒绝任意远程主机。Deno 上传/ZIP/S3/正式业务处理函数隔离 HTTP/孤儿只读审计测试 **15/15 PASS**（含 0/1/2 图、并发同号、部分 S3 失败、DB 未知及私图签发/撤权/故障；Auth/DB 响应为隔离模拟而非真实 JWT/数据库）；F07 新增 S3 只读审计（每页 100、最少7天观察窗口、模拟 service_role RPC、零次 DELETE），不等于可执行物理回收。正式 Edge handler 的真实 JWT + 含图 0/1/2 请求、真实 DB 引用/TOCTOU 及安全物理清理仍 NOT RUN，不能将 F07 记为已验收。2026-10-29已批准独立联系邮箱：作为必填新提交字段贯穿Edge/可信RPC/存储/同号比较；真实身份仍只取JWT。字段不进审计快照或默认导出，显式identity敏感导出才包含。已保存记录不转换或补齐，存储允许缺失事实但新可信提交严格拒绝缺失参数，不保留旧签名。

错误最低覆盖 401 会话、403 权限、413 文件体积、422 格式/字段、409 版本/幂等冲突、429 限流、503 存储/服务故障、网络 UNKNOWN。Edge 只做需要可信密钥/内容验证的步骤；业务与审计状态仍由单个受保护数据库事务决定。不新建 Node API、Cloudflare Worker 或通用上传代理。

## 6. 当前 Admin V4 页面合同

反馈页路由仅包含 `/feedback` 收件箱、`/feedback/workbench` 处理工作台、`/feedback/archived` 已归档及 `/feedback/:id/show` 详情，不再提供回收站 Tab 或路由；历史回收站记录由受限待清理面板显式处理。详情显示正文、用户、固定五类之一、真实私图及操作历史，只有全平台视角显示所属产品。

反馈列表使用 React-admin/MUI 受控查询、排序、分页与错误/权限态，支持类别、优先级、星标及顶部产品范围，并可单项/批量合法移动或永久删除。移除自定义标签筛选与编辑，旧五态/责任人指派/公开回复不作为新操作。危险动作必须明确确认、范围漂移失效且失败可核查，后端再次执行实时权限及版本检查。

导出确认绑定选中目标、队列、类别与产品范围，敏感字段默认关闭并二次确认；后台每次鉴权。当前已有本地安全压缩缩略图及隔离 S3 测试证据，不等于真实 Cloudflare R2 的新永久删除链路已验收。图片预览仍按授权取得短期 URL，不持久化签名链接。

用户端只允许受控提交本人文字及 0～2 张图片，并按原已授权投影读取本人可见状态/公开历史；不得见内部备注/他人记录/私有对象 key。真实 AisenLens 本地客户端尚未对接验证。人工 WCAG 2.2 AA/全视口/性能/视觉签收仍 OPEN，详见 [唯一 TODO](../../Plans/TODO.md)。

## 7. 隐私、清理、非目标

- 所有暴露的 public 表/安全投影适用精确 GRANT/RLS，检查用户本人/跨用户、产品隔离、管理员已撤权和 AAL1 拒绝；不能依赖 `user_metadata` 或客户端角色。浏览器不得持有 Supabase secret/service_role、R2 密钥。
- 用户文本纯文本渲染，禁止注入 HTML；检查真实图片内容。上传界面提示不要附上密码、Token、密钥或第三方隐私；不自动采集崩溃日志、视频、项目、AI 输入。
- 用户注销时需有反馈删除/匿名化、事件审计合法留存和 R2 文件实际回收方案；留存期限及合法例外**待运营上线前决定**。仅退出产品成员不自动删除反馈。
- 不接入自动支付、自动修改权益、自动恢复成员或跨产品访问其他产品私有资料。

## 8. 强制三阶段交付与未决参数

| 阶段 | 要完成的可验收工作 |
| --- | --- |
| **第一阶段：Core/Admin 本地，合成数据** | 表/RLS/GRANT、可信 RPC、用户受限读写、上传 Edge 的可隔离测试边界与 R2 Mock、幂等/清理模拟，正式 Admin V3 四队列/轻量标记/备注/安全恢复、pgTAP + 本地真实 Auth/AAL2 + 409/413/422/429/503/UNKNOWN/并发负例、WCAG/响应式/性能/所有者视觉签收；Mock 不等于线上 R2 |
| **第二阶段：AisenLens 本地联调** | 客户端真实提交文字及 0～2 张图、Admin V3 处理、原号 UNKNOWN 恢复、跨产品/账号/断网/重复；不新增回看/进度/追加说明界面，数据须由真实客户端操作产生 |
| **第三阶段：线上受控验证** | 经授权部署 Supabase Edge、R2 私有 Bucket/密钥、短签名 GET、真实上传/下载、残留对象清理、最小权限、反刷、日志/备份/删除、真实安全/性能和运营验收；推送/云变更/公开上线均需单独授权 |

**实施前必须确认的候选参数**：每图 3 MiB、文字 5,000 字符、读取 URL 60 秒、具体速率/总请求限制、清理时限/执行者、保留/删除政策以及是否未来开放匿名提交或邮件通知。两张图片上限和按产品归属已明确；其他参数不得假称已测试或生产冻结。
