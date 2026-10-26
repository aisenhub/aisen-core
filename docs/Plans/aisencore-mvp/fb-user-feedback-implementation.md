# FB 专项执行计划｜跨 SaaS 用户反馈闭环

> 建立：2026-10-25；状态：**FB-01A/B/C、FB-03、全量 D3 Chrome、Edge 零图提交 HTTP、隔离 S3 协议模拟已验证；FB-02 一/两图 Edge→R2 完整上传/私有读取、孤儿实际清理、第一阶段人工签收仍未完成**。业务、安全与状态唯一权威：[用户反馈架构](../../architecture/domains/user-feedback.md)。本文件只追踪施工顺序、可复测准出门槛与实际证据；[唯一 TODO](../TODO.md) 汇总未完成工作，[MVP 总计划](./00-mvp-master-plan.md)和[三阶段总则](./three-stage-delivery-gates.md)决定交付顺序。
>
> 范围：当前 AisenCore 本地开发工作区。首先采用隔离本地 Auth/PostgreSQL 与合成数据，前端仅 `apps/admin/`，图片在本地用受控 R2 对象适配/替身。**不授权真实云资源、远端 Supabase/R2、Git 提交/推送和正式发布**。没有真实执行的测试只能记录 NOT RUN，不能把 Demo、静态扫描、角色模拟视为真实 JWT/MFA 或 R2 验收。

## 一、总体交付与依赖

`FB-01A → FB-01B → FB-01C → FB-02A/FB-03A → FB-02B/FB-03B → FB-03C → 第二阶段 FB-04A → 第三阶段 FB-04B`。可并行准备页面结构和图片错误 UI，但任何真正写入/跨用户读取必须在对应受保护后端/负例通过后联通。不要搭建单独 Node/Worker/客服系统、第二套表格/表单或独立权限平台。

| 子包 | 阶段 | 依赖 | 交付物和停工门槛 |
| --- | --- | --- | --- |
| FB-01A 数据骨架 | 一 | 当前基础迁移/受限角色 | 新建三表、硬约束/索引、RLS/GRANT 默认拒绝、最小 Admin 安全只读；SQL/pgTAP 检查与负例 |
| FB-01B 本人可信接口 | 一 | 01A | 本人数据白名单读取、已认证提交 RPC 核心、幂等/字段校验、用户追加文字与公开事件只读；测试未加入产品/全局 blocked/跨账号/重复请求 |
| FB-01C Admin 写入 | 一 | 01B | 五态转换、责任人/优先级、内部备注、公开回复、事件及最小管理审计事务、版本 409；权限撤销/并发回滚负例 |
| FB-02A 图片上传隔离实现 | 一 | 01B | 限定 Edge 小图输入、真实 MIME/数量/体积/整个 body 上限、唯一 R2 key、对象接口测试替身；不使用 Supabase Storage |
| FB-02B 图片读与跨存储清理 | 一 | 02A、01C | 本人/Admin 短期 GET、孤儿/局部失败清理、同 request_id UNKNOWN 恢复、403/409/413/422/429/503 注入 |
| FB-03A 列表与导航 | 一 | 01A Admin 只读 | 一级增加「用户反馈」，置于「兑换码」下方（共六个一级入口）；用户二级保留原两项，`/feedback` 原路径不变，React-admin List/Datagrid/筛选/分页、摘要、附件数量、最新更新与空/错误/越权状态 |
| FB-03B 详情处理台 | 一 | 01C、02B | `/feedback/:id/show`、原文/图片预览/关联用户、五态/优先级/可选负责人、独立内部备注与公开答复、时间线、保存冲突草稿与重试 |
| FB-03C 一阶段完整验收 | 一 | 01A～03B | 首页待办计数、合成数据 fixture、真实 Auth/TOTP/AAL2、全流程浏览器 E2E、WCAG 2.2 AA、响应式、八维视觉/性能、所有者人工签收 |
| FB-04A AisenLens 本地联调 | 二 | 第一阶段签收 | 真客户端实际提交文字和 0～2 图、本人列表/公开答复/追加说明、Admin 处理往返、离线/幂等/隔离和错误恢复；不能用 seed 代替真客户端请求 |
| FB-04B 真实云端验收 | 三 | 第二阶段签收、单独明确授权 | 配置线上 Edge/R2 私有桶/最小权限、实测上传/短 URL、孤儿清理、注册/撤权/注销生命周期、成本/性能/告警/备份及发布批准 |

## 二、FB-01A：立即实施（第一块完整验收单位）

**设计输入**：`public.products` / `auth.users`、`platform_admins`、`private.is_platform_admin()`、`aisencore_rpc_executor` 已存在；先读取当前最后迁移，使用**新的独立迁移**而非覆盖历史迁移。旧工作区已有 18 个未提交 Markdown 变更，必须保留。

1. `public.user_feedback`：`id` UUID、`feedback_no` bigint unique、`product_id`/ `user_id` 外键、必填 `content`、五态 `status` 默认 `new`、分类五值、优先级四值、可空 `assigned_to`、`request_id` UUID、`version` 正数、时间和解决/关闭时间； `UNIQUE(user_id,product_id,request_id)`；索引按产品/状态/时间和最新更新时间。
2. `public.feedback_attachments`：`feedback_id` FK、`slot` 只能 1/2、`UNIQUE(feedback_id,slot)`、`object_key` 唯一、MIME 必须 JPEG/PNG/WebP、正字节、时间。上传外部对象尚未实现，数据库不能向普通客户端开放上传 key 直写。
3. `public.feedback_events`：归属反馈的用户或 Admin 追加事件、`visibility`、类型、可空前后状态、`operation_id`、消息、时间；禁止普通用户读取内部事件。使用必要 FK/枚举检查，不预建全文搜索/大表分区。
4. 所有新表 **ENABLE RLS、REVOKE PUBLIC/anon/authenticated ALL**。受保护 owner `aisencore_rpc_executor` 必需的最小 GRANT 与 RLS 执行策略按后续 RPC 开放；管理员普通列表仅在 `private.is_platform_admin()` 严格鉴权后按明确列授权。不能为满足 Admin 展示直接暴露附件 key/内部事件给普通 authenticated 用户。
5. pgTAP 新增 `008_feedback_foundation.test.sql`，至少测试三表、默认 RLS、最多两图、枚举/必填/外键/唯一幂等、多产品索引、匿名/普通用户直写否认及管理员 AAL1/无权不可见；测试事务 `ROLLBACK` 不污染已有 demo。真实网络 JWT/AAL2 在 01B/01C 验收，不能仅凭模拟 claim 标 PASS。
6. 只对已确认属于本地隔离实例的数据库执行迁移/测试；如果数据库服务未启动或执行条件不安全，停止数据库执行并记录“已编码，运行 NOT RUN”，不得隐式启动会访问远端的项目。

**FB-01A 准出**：隔离环境从头执行迁移、pgTAP SQL 检查真实 PASS、匿名/普通用户无 DML、AAL1/撤权 Admin 不可跨用户读取、两图与类别硬约束 PASS；并记录构建/脚本命令、退出码及失败复验情况。只有这些通过才将 01A 勾为完成。

## 三、FB-01B/C 接口合同与安全检查清单

- **本人提交**：按照受保护 Edge 最终绑定本人身份，不要求成员/Pro，服务端检查邮箱确认、blocked、产品合法存在。创建主体/事件/附件元数据在一数据库事务；`request_id` 锁定同用户+同产品的重复提交并比较实参指纹，HTTP 超时复用 ID，冲突返回 409，不能变成两笔。
- **职责划分**：有图片的提交必须由可信 Edge 验证真实字节并生成对象 key；不能把含任意 object_key 的 RPC EXECUTE 暴露普通 authenticated。无图片也走统一受保护入口，避免两种不同授权方案。客户端仅本人 read DTO，不泄漏内部列。
- **Admin 处理**：复用 `private.require_admin()`、管理 L0 排他与必要目标账户 L1（尊重既有 L0→L1 总序）；锁后复验权限和 `expected_version`；只允许五态的合法边，新增内部备注/公开答复严格分离、事件+主表+最小 `admin_audit_log` 同事务。事件文本不复制到全局审计。
- **用户补充**：只本人可追加 `user_reply`；处在 `waiting_user` 时自动原子转 `in_progress`；不允许改负责人/优先级/审计。确保 AAL2 Admin 撤权旧 JWT 拒绝。
- **负例**：无 JWT、邮箱未确认、blocked、暂停或缺失产品、成员 absent/left、不具 Pro、跨账户、伪造产品/对象 key、强制三图、重放不同内容、陈旧 version、并发 Admin、更改后审计失败回滚、HTTP 409/429/503/断网 UNKNOWN。

## 四、FB-02：图片私有安全与容错

- Edge 是专用且受限的小图入口，与 AisenLens 配置备份隔离；从 JWT 校验本人账号与目标产品，必须检查实际图片二进制签名和 Content-Type，一请求最多 2 文件，重复 slot 拒绝；文件 body 有硬上限。候选 **3 MiB/图、5,000 文本字符**非永久冻结，验证适配后更新权威文档。
- R2 key 已改为上传前确定的 `feedback/{product_uuid}/{user_uuid}/{request_uuid}/{slot}-{sha256}.{ext}`，使同一请求/相同内容幂等上传，不依赖尚未入库的反馈 UUID；R2 私有、final 条件创建不可覆盖，不得使用原始文件名或浏览器持久化签名/密钥。DB 必须比对完整附件元数据而非仅比图片数量。
- DB 成功但响应丢失以原 `request_id` 恢复。R2 成功/DB 失败或两图部分成功仅产生隔离孤儿，必须有真实执行的最小权限清理者与失败告警；**Mock/R2 真环境分别记录**。
- GET Edge 逐次校验反馈本人或 Admin 当前资格/AAL2，以短 TTL（候选 60 秒）签发只读 URL；签名有效期内有撤权窗口，应如实说明。
- 留存/删除/匿名化、大小限制、防刷速率和清理频率属于上线前待批准运营参数；开发时使用可改测试配置，但绝不能声称已冻结。

## 五、FB-03：正式 Admin UI 和验收

- 2026-10-26 起一级导航共 **6** 项，顺序为「概览 / 用户 / 权益 / 兑换码 / 用户反馈 / 平台管理」，用户反馈直接进入 `/feedback`；「用户」二级仅成员关系、查找账号；复用 React-admin List/Datagrid/Show/简单表单、现有 DataProvider 的 RLS/PostgREST 读与受保护 RPC 写、统一 MUI Theme，不另建表格/Redux/自研客服 UI。
- 列表数据：产品、编号、正文安全摘要、受限关联用户、图片数、类型、优先级、五态和时间；产品作用域只是筛选，普通搜索不暴露他人邮箱。首页新反馈/处理中计数跳转。
- 详情：完整纯文本/0～2 图片按需授权、分类/时间/关联用户、处理状态/负责人、内部备注、明确区分公开答复、事件时间线；保存后刷新相关缓存；409 保留草稿，不把未知结果标已完成。
- 覆盖无附件、附件 1/2、加载失败、单张打不开、文本很长、空列表、不同产品、只读无权、AAL1、网络中断、并发处理、成功再打开以及移动/缩放/键盘。浏览器 E2E + 自动/人工 WCAG 2.2 AA、八维视觉、性能和所有者签收皆属**第一阶段**。

## 六、实施证据与更新规则

每个子包在本文件的“执行记录”增量登记：准确路径/命令、SQL 角色模拟/真实 JWT HTTP/真实 Chrome/Mock R2/REAL R2、退出码、发现和修复、未运行风险；**只有实际执行成功**才能标 `PASS`。代码或接口改变时同步更新 [TODO](../TODO.md) 与直接受影响权威文档；不能把已批准需求等同于已交付。第一阶段未整体签收前不得进入第二阶段真实 AisenLens 联调，线上更需所有者单独授权。

## 七、执行记录

- **2026-10-25 / 初始化**：已读取现行反馈领域合同、Admin/文件存储边界、三阶段规则和现有 D1 迁移/RLS/RPC/pgTAP 模式；启动 FB-01A。测试与迁移最终结果按本轮实际执行进一步补充。
- **2026-10-25 / FB-01A 已编码 + 本地增量迁移 PASS**：Supabase CLI `pnpm dlx supabase migration new feedback_foundation` 生成 `supabase/migrations/20261025125835_feedback_foundation.sql`，包含 `user_feedback`、`feedback_attachments`、`feedback_events`、FK/五态/两图约束/索引，三个表默认拒绝普通客户端 DML，Admin SELECT 依赖原 `private.is_platform_admin()` 的 JWT `aal2` + 当前名册/blocked。调用 `pnpm dlx supabase migration up --local` 在本地 `127.0.0.1:55322` 应用成功（退出码 0），无云端访问或 SQL reset。主体 `content` 的 20,000 字技术安全上限**不是**尚待运营批准的 5,000 字候选；服务端/产品边界须在 FB-01B/02 单独确定。
- **2026-10-25 / SQL 回归 PASS（仅角色模拟）**：新增 `supabase/tests/database/008_feedback_foundation.test.sql` **32 条**，测试三表、RLS、禁止客户端直接写、两张图硬约束、类别/状态/优先级和幂等唯一性、匿名访问拒绝、AAL1 拒绝、AAL2 有效 Admin 读取、撤权/blocked 后拒绝。执行 `pnpm dlx supabase test db --local` **8 files / 337 tests / PASS / exit 0**；执行 `pnpm dlx supabase db lint --local` 返回 `No schema errors found`。这些均为本地 DB/模拟 claim，**不等于真实签名 JWT、浏览器、Edge 或 R2 测试**。
- **未通过或未执行的 FB-01A 准出项**：未在另一全新空数据库完整从零回放迁移（为保护现有本地长期 demo 数据，没有运行破坏性 `db reset`）；尚未做真实 JWT HTTP AAL2 联调与独立事务并发测试。故 FB-01A 标记 **PARTIAL，本地增量迁移 + SQL 测试 PASS，但整体尚非 ACCEPTED**。下一实施小包 FB-01B 之前可先补空库回放的隔离证明。
- **本地 Security Advisor**：在 CLI v2.122.0 运行 `pnpm dlx supabase db advisors --local --type security --level warn`，结果 `No issues found` / exit 0。该工具报告不替代 RLS/JWT 身份穿透或完整安全审计。文档相对链接 280 处检查没有失效目标，`git diff --check` 为 exit 0。
- **2026-10-25 / FB-01B/C 已实现的本地 SQL 切片**：新增 `20261025131845_feedback_trusted_rpcs.sql`（本人反馈/事件白名单读取、本人补充、Edge-only 元数据入库、管理员五态/优先级/回复/内部备注及单事务最小审计、图片归属查询），新增 `20261025133511_feedback_upload_idempotency.sql`（上传前可计算的产品+用户+请求+图片哈希对象 key、重试完整元数据对比）。已应用于**隔离本地 DB**，新增 `009_feedback_rpcs.test.sql`，本地全部 **9 files / 368 pgTAP PASS**。这只能证明 SQL 角色/模拟 JWT claims 与数据库交易测试，**真实签名 JWT HTTP、Edge 运行、R2 真实对象及完整状态并发锁测试尚未 PASS**。
- **2026-10-25 / FB-03A/B 工程接入**：在 `apps/admin/` 增加 `feedback` Resource 的导航、列表/详情/审核/公开答复/内部时间线与首页新反馈统计，后端仅调用受保护 RPC 写入；正式生产 Vite Build（含 TypeScript）退出 0，Oxlint 0 errors/0 warnings。**实际浏览器登录→反馈处理、键盘读屏/400%缩放、视觉签收仍未完成**。
- **2026-10-25 / FB-02A/B 部分编码**：已存在专用 `feedback-submit` 与 `feedback-image-access` Edge 入口和私有 R2 最小 API 适配；真实依赖/Edge 运行验证、图片 0/1/2 张上传与孤儿清理/对账、真实 R2 及反滥用速率限制仍未验收，不因文件存在而声称可上线。
- **2026-10-25 / DB 安全与响应合同扩充**：后续迁移 `20261025135838_feedback_admin_read_projection.sql` 新建 `security_invoker=true` 的 Admin 反馈视图，服务端按 RLS 统计附件数量；`20261025140400_feedback_lint_cleanup.sql` 清除未使用局部变量并使本地 Lint 显示 `No schema errors found`；`20261025140940_feedback_self_attachment_visibility.sql` 为用户本人返回安全的附件 ID/槽位和回复版本号（不含 object_key）；`20261025141256_feedback_submit_rate_limit.sql` 增加提交前受权预检 + 提交事务用户锁内二次限流，开发候选阈值 **5 条/账号/小时**，真实 HTTP/并发限流仍未验；`20261025141711_feedback_admin_assignment.sql` 增加具 AAL2/有效管理员校验、版本冲突、有效负责人校验和单事务审计的指派/取消操作。
- **2026-10-25 / 早期增量验证基线**：`pnpm dlx supabase test db --local`：**9 文件、389/389 pgTAP PASS**（SQL 角色模拟），覆盖新增本人数据白名单、视图 RLS、图片两张元数据、速率预检/并发锁内检查、成功请求重放、Admin 负责人资格/取消指派/事件审计；Admin 生产构建（含 TypeScript）PASS、Oxlint 旧记录 0 警告/错误，Edge 双入口 `deno check` PASS，独立图片/有界请求 Deno 单测 **5/5 PASS**。严格区分这些与尚未跑通的 Edge JWT HTTP/浏览器端到端。
- **2026-10-25 / 并发图片误删风险修复及待完工作**：以产品+用户+请求+图片哈希为键的并发重试可能共享同一 R2 对象；已从 `feedback-submit` 移除所有因失败/重放触发的**即时删除**，以避免删除另一成功请求仍引用的图片。**仍缺实际运行的延迟引用核对式孤儿清理/告警及 R2 双系统失败注入，此项必须阻断生产发布**。首次尝试 `supabase functions serve` 时拉取 edge-runtime Docker 镜像超时，本地未获得可验收的 Edge HTTP，未配置真实 R2；本轮所有成功回归均非线上存储证明。
- **2026-10-25 / 真签名 JWT HTTP AAL1 负例 PASS**：新增 `scripts/test-feedback-auth-http.py`，严格限定 CLI 报告的本机 `127.0.0.1:55321`，临时创建并确认 GoTrue Auth 用户、真实密码登录，用签发的 JWT 验证本人 `my_feedback` 可读、非 Admin 禁止 `admin_update_feedback`、客户端无法执行 `feedback_submit_from_edge` 服务专用 RPC、Admin `security_invoker` 视图不能枚举、已认证账号反馈预检放行。运行 `python scripts/test-feedback-auth-http.py`：**6/6 HTTP 断言 PASS，临时 Auth 测试用户 DELETE PASS**。这些是本地真实 Auth/PostgREST AAL1 验证，**不包含当前 AAL2 管理员写入、Edge/真实 R2 文件、浏览器或 AisenLens**。
- **2026-10-25 / FB 真签名 JWT AAL2 及反馈专属 Chrome 本地 PASS**：新增 `scripts/test-fb-real-http.mjs`，验证临时已确认用户、陌生人、TOTP/AAL2 Admin、受保护 SQL/PostgREST 权限与 `feedback_submit_from_edge` 服务专用入库、不变幂等键、409、Owner 读取/回复、五态中 `in_progress/waiting_user`、负责人资格/赋值及审计。运行 `node scripts/test-fb-real-http.mjs`：**exit 0**，并确认每个测试创建的用户/产品/反馈清理成功；该测试的提交是对可信 RPC 的模拟调用，**不是 Edge 多图片上传的验证**。新增 `scripts/test-fb-browser.mjs`：在本地真实 Chrome 通过 Auth/TOTP `aal2` 登录，列表显示服务端反馈，详情 UI 提交状态变更和负责人指派、审计同增，390px 视口无页面横向溢出，axe 自动扫描无 serious/critical，临时资源确认清理；`node scripts/test-fb-browser.mjs` **exit 0**。发现并修复了 Admin 空列表原显示 `resources.feedback.empty` 的缺陷（现为明确中文空状态）。原有完整 D3 13xx 行浏览器回归在一次扩展执行中因异步导航重载选中态时序而提前失败，**尚未取得这套完整回归 PASS**，不能用反馈专属 PASS 代替 WCAG 2.2 AA/人工全面验收。
- **2026-10-25 / 本地 Edge 真实 JWT 提交与隐私/幂等/限流实测 PASS**：`scripts/test-fb-edge-smoke.mjs` 在隔离本地 Supabase Edge 运行时以匿名请求测试两个受保护 Function 均 HTTP **401**，首次 Docker 镜像拉取超时后已复测成功。`scripts/test-fb-edge-zero-image.mjs` 用临时 GoTrue 已确认用户与活动测试产品，完成真正 `JWT → feedback-submit Edge → 服务专用 feedback_submit_from_edge RPC → my_feedback 本人读取`，0 图片提交 201、同请求重播 200、改参数冲突 409、伪造 MIME 和 3 张图片 422、无权附件查询 403；又用 5 条新反馈达候选上限后验证第 6 条 **429**、原请求精确重播仍 **200**；此例首次遇到网关冷启动 502，重新运行**全部断言 PASS，测试账户/产品/反馈均已清理**。该证据不覆盖一/两张图的实际 R2 写入与 GET。
- **2026-10-25 / 最小授权修复与 392 SQL 测试 PASS**：真实 Edge 提交曾因对 `products` 的直接 PostgREST SELECT 无权限 (`42501`) 导致错误 409，**未放宽 products 表访问**；新增迁移 `20261025144322_feedback_preflight_product_id.sql`，把本人 `feedback_submit_preflight(product_key, request_id)` 定义为受保护、仅返回 `allowed` 和已验证活动 `product_id` 的窄投影，仍在 DB 提交时按用户锁复核；真实 Edge 后续 PASS。当前新旧 SQL 测试 **9 文件/392 项 PASS**，Deno 两个 Edge 入口类型检查 PASS。
- **2026-10-25 / 隔离 R2 协议模拟 PASS**：将 AWS SDK 条件 PUT 拆出可注入 S3Client 的 `putObject`（生产 `putFile` 仍仅从已配置私有 R2 凭据创建 client），新增 `supabase/functions/tests/feedback-r2-protocol.test.ts` 使用本机 TCP S3 替身，真实签名 SDK PUT 先写 1 张，再写第 2 张，同字节/相同 key 重试返回 412 并不覆盖，模拟 503 能传播失败；`deno test --allow-env --allow-net=127.0.0.1 --allow-sys=osRelease tests/feedback-r2-protocol.test.ts` **1/1 PASS**，另有 `feedback-upload.test.ts` **5/5 PASS**。这是协议替身测试，**绝非真实 R2、也不是从 Edge 走完整的一/两图 HTTP E2E**。
- **2026-10-25 / 全量 D3 Chrome 大回归最终 PASS**：原有 `scripts/test-d3-authenticated-pages.mjs` 增加反馈 Resource 与“用户”二级导航、空反馈列表断言；修复测试自身的异步重新载入选中态等待与空反馈列表在窄屏下无需有记录卡片的假设。再次执行 `node scripts/test-d3-authenticated-pages.mjs` **exit 0**：既有多模块真实 MFA/Chrome、503 UNKNOWN/429、危险写入审计、页面焦点/响应式等全部回归，**74 组视口-页面组合 PASS**；临时 QA 产品/身份均清理。自动 axe 检测通过不等于 WCAG 2.2 AA 手工合格，所有者的视觉/交互验收仍为 NOT ACCEPTED。
- **2026-10-25 / DB 引用检查权限保护**：新增并本地应用 `supabase/migrations/20261025150309_feedback_orphan_reference_guard.sql` 的 `feedback_referenced_keys(text[])` 最小服务权限 RPC，最多 100 个目标 key，基于受信任 NOLOGIN 角色查已提交附件，普通用户不能执行，也**不允许通过任何 SQL 接口删除对象**。新增 pgTAP 普通用户禁调、服务角色可调、存在/不存在、非法 key 拒绝；当前 **9 文件 397/397 pgTAP PASS**。这只是未来孤儿核对的最低权限原语，**没有实际运行的 R2 列表枚举/延迟清理任务、双重读引用或实际删除**；全链留存与故障恢复仍是发布阻断项。
- **2026-10-26 / 用户反馈提升至一级菜单并完成全量导航回归**：左侧工作区现为「概览 / 用户 / 权益 / 兑换码 / 用户反馈 / 平台管理」，保留唯一工作区分组；`/feedback` 与 `/feedback/:id/show` 属于独立一级选中态，反馈两页面移除旧「用户」二级导航，用户二级仅保留成员关系、查找账号。同步修改 `apps/admin/src/App.tsx`、`domainNavigationModel.ts`、`Feedback.tsx`、D3/FB Chrome 断言及相关 Admin/用户反馈/计划文档；Dashboard 的 `/feedback` 深链与原 RPC、RLS、产品筛选、数据库架构不变。已执行 Admin Vite/TS Build **PASS**、Oxlint **0 warnings/errors**、反馈专属真实 TOTP/AAL2 Chrome **exit 0**（列表、详情、状态、负责人、390px/axe、清理验证）、D3 全量真实 Chrome **exit 0**（六入口顺序、用户二级两项、反馈一级高亮、74 组响应式及原有高危流程，临时 QA 账户/产品清理通过）。**本次并未部署、推送或重置数据库**，第一阶段人工 WCAG/视觉与图片 R2 等验收继续 OPEN。
