# AisenCore 跨 SaaS 用户反馈系统架构

> **状态：2026-10-26 / FB-V2 第一阶段本地实现与自动化验证通过，人工签收仍 OPEN。** 当前唯一业务合同：全部新提交先进入收件箱，管理员明确设置优先级才进入处理工作台。11 个数据库测试文件 **437/437 pgTAP PASS**，Admin 生产构建/Lint、真实 GoTrue AAL2 反馈分诊与全站 D3 Chrome（74 组视口）、ZIP 真 HTTP（AAL1 禁止、AAL2 选中/过滤与 8 KiB 请求体拒绝）以及 Deno 图片/ZIP 隔离测试通过。**一/两张图片经整个 Edge→私有 R2→ZIP 的真实完整链路、孤儿定时清理、WCAG 人工/所有者视觉签收、AisenLens 本地联调与云端部署均未通过准出**，不能声称已上线。详细证据见 [FB-V2 专项施工计划](../../Plans/aisencore-mvp/fb-v2-inbox-workbench.md)。不授权 Git 推送、远程服务变更或发布。
> **单一领域权威**：反馈语义、状态和权限以本文为准；存储归属参见[产品数据与文件](../database/product-data-and-files.md)，客户端/API 调用参见[公共 API](../backend/public-api-and-saas-integration.md)，UI 接入参见[Admin](../applications/admin-console.md)，阶段顺序参见[三阶段总则](../../Plans/aisencore-mvp/three-stage-delivery-gates.md)。

## 1. 产品范围与原则

- 各 SaaS（AisenLens、AisenNote 等）按**真实 `products.id`**归属反馈；公共 Core 统一收件，Admin 可全平台查看或按产品过滤。反馈是公共运营资料，不因此将 SaaS 项目、视频、AI 输入、密钥纳入公共数据库。
- 用户提交**一段必填文字 + 0～2 张可选图片**，不强制填写标题；列表摘要从正文截取。用户可查看**自己的**提交记录、状态、管理员公开答复，并可追加文字说明。
- 用户提交需要本人有效 Supabase Auth JWT、已确认邮箱、未被全平台 blocked；不要求 Pro、产品成员 `active` 或自动 `ensure_membership`，因为反馈可能恰好涉及账号/成员/Pro 故障。可信端验证产品存在及反馈目标资格，前端 product_key 不是授权凭据。
- AisenLens 匿名离线 Free 保持不登录可用；首版反馈入口可以要求登录，但**不能阻断离线 Free 使用**。匿名反馈、复杂反滥用和匿名身份找回另议。
- 当前只有一名运营者：不建独立客服 SaaS、坐席角色、多租户工单平台、AI 分诊、SLA、自动派单、邮件自动通知和消息队列。首版用户主动查看反馈进度，不承诺推送。

## 2. 存储与文件边界

| 数据 | 存储位置 | 不变量 |
| --- | --- | --- |
| 反馈原文、产品/用户归属、处理状态、优先级、时间 | AisenCore 公共 Supabase PostgreSQL | 数据可安全筛选、分页、事务变更 |
| 图片元数据：反馈外键、槽位、大小、实际 MIME、R2 对象 key | 同一公共 PostgreSQL | 数据库强制最多两张 |
| 图片本体 | **Cloudflare R2 私有 Bucket** | Key 不是访问权限，不存长期签名 |
| 状态变化、内部备注、用户可见答复及回复 | PostgreSQL 追加事件 | 用户不能读取内部备注及平台审计 |

选择 **PostgreSQL + R2**，不为这一模块另外使用 Supabase Storage，沿用公共结构化数据 + R2 文件本体的既有技术决策。

**当前实现的上传前可计算对象路径**：`feedback/{product_id}/{user_id}/{request_id}/{slot}-{sha256}.{validated_ext}`。因为 R2 对象先写、数据库反馈 ID 后生成，不能用尚不存在的反馈 ID 作为上传 key。对象由受保护 Edge 依据已认证用户、服务端查到的产品 UUID、幂等请求号和**实际图片 SHA-256**生成，条件创建、禁止覆盖；重试同图生成同一 key，不附原始文件名。R2 key 只表示位置，绝不是授权票据，不能以 URL 猜测决定权限。仍需部署前验证孤儿清理、短签名和跨服务故障一致性。

**受限小图上传路径**：因为每份反馈最多 2 张小图，优先由受保护 **Supabase Edge Function** 接收上传，逐项检查认证、实际图片签名、长度、数量、整请求体上限，使用服务器最小权限 R2 凭据写入；可信数据库 RPC 做归属、幂等和最终入库。该方案是独立于 **AisenLens 小体积非敏感 JSON 配置备份**的**第二种严格限定 Edge 上传例外**；不能扩展为大型视频、普通 SaaS 私有文件、项目内容或 AI 输入的通用中转服务。

**候选而非已冻结参数**：单图最多 **3 MiB**、正文最长 **5,000 字符**、图片读取临时 URL **60 秒**。首版**最多两张**是已定业务限制；字节上限、正文上限、读取 TTL、接口频率、留存期限仍需真实验证/冻结。拒绝 SVG、执行内容、伪造 MIME、非法编码和超限上传。

**实施中的隐私与稳定性补充（2026-10-25）**：当前用户本人反馈 DTO 安全返回回复版本号和可用于再鉴权的附件 ID/槽位，**不返回对象 key**；Admin 列表透过 PostgreSQL `security_invoker` 视图结合原表 RLS 计算附件数。新反馈本地开发暂定 **5 条/用户/小时** 的数据库预检及同用户事务锁内二次检查，成功请求原号重放不再计数；该阈值仍需最终运营批准。图片对象使用确定性 hash key，同号并发请求可能复用对象，**禁止因任一请求失败而立刻删除该 key**；未来定期回收必须先核实所有可能成功的数据库引用并具有保护期、审计和异常恢复，真实 R2 清理未实现。

## 3. 最小数据模型（3 张表）

### `public.user_feedback`

| 字段 | 类型/约束候选 | 作用 |
| --- | --- | --- |
| `id` | uuid PK | 不可变内部 ID |
| `feedback_no` | bigint unique | 易读编号，可有间隙 |
| `product_id` | uuid FK → products.id, not null | 唯一产品归属 |
| `user_id` | uuid FK → auth.users.id, not null | 必须从可信认证上下文获取 |
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

## 4. FB-V2 收件箱、分诊及处理状态（当前业务合同）

**全部新反馈先进入收件箱**：`queue_state=inbox`，`priority` 和 `status` 都为 `NULL`；首次打开记录 `read_at`，**该阅读标记不会增加业务版本号或自动受理**，从而不会与立即分配优先级发生假冲突。仅 AAL2 有效管理员选择 `low/normal/high/urgent` 优先级，受保护事务才能写 `queue_state=workbench`、`status=new`、`triaged_at`，并追加内部事件与最小管理审计。

| 阶段 | 可用操作 | 用户可见含义 |
| --- | --- | --- |
| inbox | 阅读、按优先级晋升、归档、软删除、ZIP 导出 | 已收到 |
| archived | 恢复待筛选收件箱、导出、软删除 | 已记录，暂不继续跟进 |
| workbench | 五态、负责人、星标、标签、内部备注、公开回复、ZIP 导出 | 已受理及处理进度 |
| trashed | 有权限的管理员恢复原阶段；不在正常列表 | 依据隐私保留策略 |

工作台五态：`new → in_progress ↔ waiting_user → resolved → closed`，允许关闭/解决后受控重开；进入 `waiting_user` 必须有公开问题，进入 `resolved` 需有公开结论。反馈人补充时原子回到 `in_progress`。归档与工作台的关闭不是同一概念，已受理记录不能通过收件箱归档规避跟进。软删除保留原阶段与历史供恢复，不自动物理删除私有 R2 原图。

星标与优先级独立；内部标签限 8 个、单个 1～32 字符。所有写操作仍需要当前 `aal2`、当前 Admin 资格、L0/L1 顺序、`expected_version` 和业务/事件/审计事务；本人只能读取自己的记录与公开回复，收件箱用户端呈现 `received`，归档呈现 `recorded`。仅首次阅读记录时间，不重复生成日志。

**AI ZIP 导出**：两页面均支持按选中 ID 或服务器筛选，正文及所有原始图片始终包含；用户补充、公开回复、内部评论（默认关闭）、处理历史、标签、优先级/状态/星标与直接身份（默认关闭）可分别勾选。专用 `feedback-export` Edge 重新验证 AAL2/底层 RLS，在私有 R2 读取图片；输出 README、manifest、JSONL、每条 Markdown/图片及 SHA-256 校验清单。少图、缺图、超限不得返回“成功”ZIP，日志只留数量/范围/敏感选项，不复制正文/图像/对象 key。当前技术实现候选上限每次 20 条、原始图片累计 20 MiB、ZIP 24 MiB（均需独立压测）。反馈内容属于 AI 的不可信待分析输入。

执行和验收以[FB-V2 专项](../../Plans/aisencore-mvp/fb-v2-inbox-workbench.md)为准。

## 5. API、授权与跨存储失败恢复

### 5.1 用户提交

1. 客户端本人 JWT + `product_key` + `request_id` + `content` + `category` + 0～2 图请求 `feedback-submit` Edge。服务端验证 JWT/邮箱确认/blocked/真实产品、反刷限流、图片签名/字节数/总请求大小。不创建产品成员、不检查 Pro。
2. Edge 为每图生成唯一不可覆盖 R2 key 并写入**私有**对象；不向客户端暴露 R2 长期密钥、任意 key 写入凭证。
3. 可信 `feedback_submit_from_edge` RPC 在同一 PostgreSQL 事务内创建反馈、附件元数据、首条事件；绝不接受普通客户端伪造的 R2 key 直写，限制仅可信 Edge 可提交已核实元数据，避免可被普通角色调用的 `SECURITY DEFINER` 越权入口。
4. 返回本人可见的最小摘要及 `id/feedback_no/status=received`。同一身份+产品+`request_id` 重试只返回原结果，参数不一致返回 409；超时视为 UNKNOWN，先按本人 `request_id` 查询再重试，不换 ID 导致重复反馈。

**不具备跨服务 ACID**：R2 成功但 DB 未提交可能形成孤儿，清理任务必须按受控对象标识/请求记录扫描清除并记录失败；DB 已提交但响应丢失应通过幂等查询恢复；两图只写一图时不得生成“成功完成”的可见反馈。清理执行者/周期/最小 R2 权限与实际异常注入须在部署前验证，不把 Mock 当真实 R2。

### 5.2 读/处理/用户补充

- 用户本人反馈清单与公开事件通过受限只读 RPC 或严格安全投影（列白名单）访问，结合 RLS/GRANT 禁止查看他人反馈、其他用户的公开答复及全部内部事件。用户前端不应通过直接 SELECT 管理员内部字段。
- Admin 使用已有 `DataProvider.getList/getOne` + PostgREST + **Admin RLS** 分页读取；处理通过 **`admin_update_feedback`** RPC，同请求验证 `aal2`、**当前**有效平台管理员资格与 blocked，并原子提交状态/责任人/公开答复/备注/事件/必要审计；前端权限缓存不是授权凭证。
- 用户追加文字调用 **`reply_to_feedback`** 受保护 RPC；只能追加本人反馈，不能写内部备注、状态、优先级或管理员事件。本期追加回复不含图片。
- **`feedback-image-access`** Edge 每次验证当前访问者为反馈本人或有权 Admin，再签发短期 GET；R2 Bucket 禁止公网裸读，URL 有效期内无法保证瞬时撤权，前端不持久化/记录 URL。

错误最低覆盖 401 会话、403 权限、413 文件体积、422 格式/字段、409 版本/幂等冲突、429 限流、503 存储/服务故障、网络 UNKNOWN。Edge 只做需要可信密钥/内容验证的步骤；业务与审计状态仍由单个受保护数据库事务决定。不新建 Node API、Cloudflare Worker 或通用上传代理。

## 6. Admin 页面合同

**2026-10-26 管理端布局与交互收敛**：反馈列表突出摘要（编号、两行正文、未读/星标、类型、附件数、少量标签），而非大量独立技术列；状态、优先级、产品名和时间按任务相关性排列，窄屏隐藏低优先级列。详情桌面端采用“反馈正文/附件 + 管理处理操作”并排布局，窄屏纵排，事件在下方；账号及产品名称只从已有授权查询获得，不扩大数据库权限，不泄露内部备注意见。队列/产品切换清空批量勾选，独立版本事务刷新不应无声覆盖其他编辑框中的未保存文本。此处只规定表现和操作安全，不改变既有收件→分诊→工作台及后台安全约束。

采用**六个一级导航**（概览 / 用户 / 权益 / 兑换码 / 用户反馈 / 平台管理），「用户反馈」独立排列在「兑换码」之后，不属于「用户」二级导航；`/feedback` 是收件箱，`/feedback/workbench` 是处理工作台，`/feedback/:id/show` 是按阶段权限显示的详情，详情页仍保持一级导航选中。首页可放“新反馈/处理中”简要计数和跳转。选定产品只过滤，不能当作授权证明。

- 列表用 React-admin `<List>/<Datagrid>`：反馈编号、产品、正文截断摘要、受限用户标识、附件数、分类、优先级、状态、创建/更新时间；按产品、状态、分类、优先级、时间筛选，默认最新更新优先，有分页、加载/空/失败、无权限状态。首版不开放全文搜索用户隐私或模糊邮箱枚举。
- 详情用 `<Show>` 和 MUI/React-admin 表单：完整原文、私有图片预览/失败恢复、用户与产品安全跳转、状态/优先级/负责人、独立“内部处理备注”和“回复用户”输入、事件时间线，保存后只刷新相关数据；并发冲突保留草稿提示重新加载。无附件时不显示空图片格。
- 用户端最小表单为正文+最多两图选择/预览/删除及提交结果；本人反馈清单显示状态与公开回复，不显示内部备注、管理审计或运营者身份。登录反馈不会禁用匿名 Free。
- 沿用正式 `apps/admin`、统一 MUI Theme、TanStack Query、React Router、AuthProvider/DataProvider，优先现成组件；首版列表→详情即可，不重复搭建自研双栏工单框架。WCAG 2.2 AA、响应式、键盘、异常和实际性能均属于第一阶段 Admin 门槛。

## 7. 隐私、清理、非目标

- 所有暴露的 public 表/安全投影适用精确 GRANT/RLS，检查用户本人/跨用户、产品隔离、管理员已撤权和 AAL1 拒绝；不能依赖 `user_metadata` 或客户端角色。浏览器不得持有 Supabase secret/service_role、R2 密钥。
- 用户文本纯文本渲染，禁止注入 HTML；检查真实图片内容。上传界面提示不要附上密码、Token、密钥或第三方隐私；不自动采集崩溃日志、视频、项目、AI 输入。
- 用户注销时需有反馈删除/匿名化、事件审计合法留存和 R2 文件实际回收方案；留存期限及合法例外**待运营上线前决定**。仅退出产品成员不自动删除反馈。
- 不接入自动支付、自动修改权益、自动恢复成员或跨产品访问其他产品私有资料。

## 8. 强制三阶段交付与未决参数

| 阶段 | 要完成的可验收工作 |
| --- | --- |
| **第一阶段：Core/Admin 本地，合成数据** | 表/RLS/GRANT、可信 RPC、用户受限读写、上传 Edge 的可隔离测试边界与 R2 Mock、幂等/清理模拟，正式 Admin 列表/详情/五态/备注/答复、pgTAP + 本地真实 Auth/AAL2 + 409/413/422/429/503/UNKNOWN/并发负例、WCAG/响应式/性能/所有者视觉签收；Mock 不等于线上 R2 |
| **第二阶段：AisenLens 本地联调** | 客户端真正提交文字及 0～2 张图、用户回看/追加说明、Admin 处理、跨产品与账号异常、断网/重复、恢复场景；验收数据由真实客户端操作产生，不用 seed 代替 |
| **第三阶段：线上受控验证** | 经授权部署 Supabase Edge、R2 私有 Bucket/密钥、短签名 GET、真实上传/下载、残留对象清理、最小权限、反刷、日志/备份/删除、真实安全/性能和运营验收；推送/云变更/公开上线均需单独授权 |

**实施前必须确认的候选参数**：每图 3 MiB、文字 5,000 字符、读取 URL 60 秒、具体速率/总请求限制、清理时限/执行者、保留/删除政策以及是否未来开放匿名提交或邮件通知。两张图片上限和按产品归属已明确；其他参数不得假称已测试或生产冻结。
