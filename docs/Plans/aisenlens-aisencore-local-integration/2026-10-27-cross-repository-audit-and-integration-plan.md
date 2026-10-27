# AisenLens × AisenCore｜双仓审查结论与本地对接实施方案

> **日期**：2026-10-27，已完成第二轮源码复审及所有者决策同步；**状态**：双仓静态审查完成，初审单点本地检查仅保留为历史证据；**真实双端业务联调：NOT RUN**。
>
> **所有者最新决定（强制）**：AisenLens 现有后端相关页面、接口调用及其数据只是测试/预备实现，不要求 AisenCore 兼容这些临时实现。身份、成员、产品权益、兑换、反馈和云备份统一**以 AisenCore 的现行有效后端合同、数据模型、权限及真实结果为准**。当已确认的产品需求与旧设计/代码矛盾时，先在 Core 正式需求/架构中收敛唯一合同，再调整 Lens 的**后端相关**实现；不根据测试 UI 反向设计 Core。
>
> **修改边界**：Lens 仅允许后端集成有关模块和必要接线；严禁重构视频、AI、分镜、镜头校准、时间轴、播放器、导出、项目数据等其他业务。Core 是主优化对象。本文是审查及执行方案，不替代需求/API 真源、不授权代码/数据库/生产变更。

## 一、审查范围与现状

| 内容 | AisenLens | AisenCore |
| --- | --- | --- |
| 本地目录 | `E:\Projects\Aisenlens` | `E:\Projects\Aisencore` |
| 审查基线 | `main` / `c83de232` | 开始 `main` / `7735052e`；结束 `4f698d5`，期间仅合入文档/文档校验脚本 |
| 技术结构 | React / Vite / TypeScript；本地优先；桌面/移动壳及引擎 | React-admin / Vite / TypeScript；Supabase Auth、PostgreSQL/RLS/RPC、Edge、可选 R2 |
| 已有后端相关实现 | 账号、权益、反馈、模板备份测试 UI；尚无 Core 实际会话适配 | Auth/成员/Pro/兑换和反馈 V3 已有 SQL/Edge；模板云备份未编码 |
| 工作区 | 已有/并行改动独立保留 | 原审查已有两份Markdown修改；本次在其上同步需求/架构/计划，其他并行改动独立保留 |

直接审查过的主要文件包括 Lens 的 `apps/webapp/src/features/auth/`、`features/feedback/`、`features/config-backup/`、`app/App.tsx`、`features/editor/components/WorkspaceSettingsDialog.tsx`、`apps/webapp/vite.config.ts` 与 `docs/spec/account-and-cloud-settings.md` r4；Core 的 `supabase/config.toml`、按顺序覆盖后的核心/兑换/反馈 SQL、三个反馈 Edge 及共享存储模块、RLS 列授权、相关测试、Admin 配置和阶段文档。**CODED（静态有代码）≠ RUNNING（服务启动）≠ E2E PASS（双端业务通过）**。

本文依据**读取时的工作区内容**，不声称只审查了已提交快照。复审期间另一路流程合入 Core 文档 PR，HEAD 从 `7735052e` 变为 `4f698d5`；已核对该范围没有 `supabase/`、`apps/admin/`、根依赖/锁文件的变化，本轮代码证据仍适用。Lens HEAD 未变。Core 开始时已有的文档改动/删除、Lens 已有编辑器等无关改动不属于本次修改。本次不安装依赖、不启动或重配服务、不使用远程 Supabase/R2；源码可确认的分支与运行时故障复现分开记录。

上一轮实际只读探测（历史现场，不承诺现在持续相同）：`127.0.0.1:55321/auth/v1/health` 返回 HTTP 200、Lens `127.0.0.1:8443/` 返回 HTTP 200、Core Admin `127.0.0.1:3000/` 当时未监听。两仓分别运行 `pnpm run typecheck`、`pnpm run lint` 和 `git diff --check` 均通过。**未运行本轮真实 Lens→Core Auth/邮件/RPC/Edge/R2/E2E、数据库 pgTAP 重跑或完整性能验收**；历史测试报告不能冒充本轮结果。

## 二、推荐架构和分工

`AisenLens（本地业务） → Supabase 官方 Auth SDK / 最小 RPC 与 Edge 适配 → AisenCore Supabase（Auth、RLS、可信 RPC、Edge） → PostgreSQL / 私有 R2`。

- **Core 拥有**：统一身份、平台限制、产品成员、产品级 Free/Pro 事实、Grant/兑换、反馈与管理员权限、云备份鉴权/配额/存储一致性、正式错误码及 DTO。管理操作只对当前有效管理员和 AAL2 开放。
- **Lens 拥有**：不依赖云端的本地项目/媒体/视频/时间轴/分析/AI/模板编辑与导出；后端相关页面仅消费 Core 的可信结果。Core 不存拉片视频、项目、时间轴、AI 请求结果或用户 API Key，也不承载 Lens 的具体功能额度。
- **单轨合同与当前范围**：不新增Node中转、第二套JWT/会员权限或测试实现兼容层。Core提供可信资格；本次不实施AI/去水印/第二项目门槛，后续另列最小业务任务，不能将本轮接线当全部Pro功能验收。登出/切号最小凭据与在途任务接线已确认纳入，但不改AI/Provider/项目算法。
- **后端能力不自动扩张客户端功能**：Core 支持附件、本人反馈查询、历史事件，不等于 Lens 必须增加反馈中心、进度页或回复界面。先以 Core 唯一合同解决双方需求冲突，再接当前需要的入口；本人查询可仅供 UNKNOWN 恢复与权限测试。首轮只做 WebApp，桌面/移动壳、跨站 SSO 与 deep link 不进入本次范围。

## 三、审查发现与优先级

| 等级 | 已核实发现及文件证据 | 对接整改 |
| --- | --- | --- |
| P0 | Lens `features/auth/AuthForm.tsx` 的 `onSubmit` 可选；`AuthPage.tsx`、`AccountSettingsContent.tsx` 未提供正式后端回调 | 只替换后端接线/会话；按 Core Supabase Auth 的真实状态执行 |
| P0 | Core `supabase/config.toml` 的邮件 `site_url`/`additional_redirect_urls` 覆盖 Admin `localhost:3000`，未覆盖 Lens 默认 `8443` | 增加精确 Lens 回调，验证注册确认/找回密码 |
| P0 | Lens `AccountSettingsContent.tsx` 没有向权益面板传入 `email`、`access`、`onRedeem`、`onRefresh` | 接真实会话、资格和兑换；历史使用既有安全列查询，不伪造 Grant 记录 |
| P0 | Core 只有 `feedback-submit`、`feedback-image-access`、`feedback-export` Edge，未有 AisenLens 模板备份专用 Edge/RPC | Core 实现专属安全备份服务，不误用反馈图片通道 |
| P0 | Lens `configPackage.ts` 当前模板包 `aisenlens-analysis-template` v1，本地限制 5 MiB；旧 Core S1 仍出现多类别恢复、不同云端限额候选 | Core 先冻结正式云端单一合同；Lens 当前测试 UI 不能单独决定云端参数 |
| P1 | Lens 设置弹窗中的 `FeedbackForm` 未传 `onSubmit`，其 `message/email` 也不是 Core multipart 合同 | 先接零图真实提交；字段、登录限制以 Core 为准，本人查询只用于必要恢复，不默认新增历史/进度页面 |
| P1 | Core 反馈提交和图片签发将部分 Auth/数据库故障一律映射 403 | 区分真实拒绝与服务故障，见复审 F05；先独立补故障测试再接 Lens |
| P1 | 当前 `my_feedback` 跨本人所有产品取最近 100 条，且精确请求查询也排除回收站 | 产品范围及 UNKNOWN 查询不能仅靠前端过滤或空数组判断，见复审 F06 |
| P1 | Core `functions/_shared/feedback.ts` 从 `R2_ACCOUNT_ID`/密钥直连 R2，虽有 S3 测试辅助 | 为本地含图联调设隔离对象存储，审计失败/孤儿/重放，不泄露密钥 |
| P1 | Lens `ConfigBackupPanel.tsx` 的 `CloudBackupItem` 持有整个 `ConfigPackage` | 云端列表只取小型元数据，选中版本再下载正文，保留既有本地恢复 |
| 文档已修订，运行仍待验 | 双仓路径、主要测试组件和静态入口已核实，相关计划已移除“Lens源码不可见”阻塞 | 保留实际运行配置和真实互通 NOT RUN，不把静态核对当服务启动 |

以上 P0 指对应批次的**开工/准出阻塞**，不将“尚未接线/尚未开发”冒称为已发生的线上安全漏洞。P1 的已确认代码问题和待实测风险如下；没有运行时证据的项目不标 FAIL/PASS。

### 所有者已确认的决定（2026-10-27）

以下10项已由所有者统一采纳；本轮**仅授权同步文档，不改代码/数据库**。长期规则已同步[需求 §9](../../spec/requirements.md)及相应架构，表中是审查/实施范围索引，不是另一套待决或待办。

| 项目 | 已确认规则及对应权威 |
| --- | --- |
| 1 实施范围 | 只接WebApp后端/账号页面；AI Pro、去水印、第二项目门槛不在本次实现或PASS范围，后续另列最小业务任务 |
| 2 备份配额 | 每账号每产品20份、多设备合计；单份5MiB已采纳待完整载荷/接口实测，满额拒绝新增，不覆盖/自动删旧 |
| 3 取回/留存 | Pro到期仍能查看/下载/删除本人旧备份，仍查身份/owner/Core产品成员准入；正常服务不按年龄或到期删除；[文件权威](../../architecture/database/product-data-and-files.md) |
| 4 反馈 | 登录且邮箱确认的本人文字+最多两图，不要联系邮箱/历史/进度/回复页面；查询仅必要恢复；[反馈权威](../../architecture/domains/user-feedback.md) |
| 5 永久Pro | 同产品当前有效永久Pro拒兑其他周期/永久码且不耗码；同码重放仍已兑换，周期续期/管理员直授独立；[计费权威](../../architecture/domains/billing-and-entitlements.md)。SQL当前缺保护，待实现 |
| 6 本地快照 | 短时断网新纯本地Pro可在有效快照暂按最多15分钟测试；不跨账号/产品、不超过到期/已知撤权，新AI/云操作在线核验；[本地优先](../../architecture/applications/local-first.md) |
| 7 昵称 | 保留可选昵称，复用Auth用户可编辑资料仅显示，不建资料表/头像/主页，不参与权限 |
| 8 注销 | 人工受理，专门支持邮箱为方向，**具体渠道留待上线前确定**；此前不开可成功提交的申请按钮、不假报受理，不建自动删号接口 |
| 9 生命周期 | 允许最小登出/切号凭据锁定、释放会话Key、保留加密凭据；在途任务先完成或明确取消、旧响应失效，不改AI/Provider/项目算法 |
| 10 阶段 | 第一阶段独立Core/Admin遗留先修验签收；可同时静态整理/准备隔离环境，之后才正式双端联调，本次决定不等于签收 |

反馈正文/单图/频率/签名TTL先沿当前值隔离测试，留存/回收和正式运营参数之后冻结；发码批量/有效期/永久码权限沿本地测试参数，正式发行前决定；价格/爱发电、域名/SMTP/真实R2、备用管理员/恢复责任留对应阶段。没有云端、推送、部署或数据重置授权。

### 第二轮复审：实现缺口与按已确认合同执行的修正

#### F01｜P0，LENS-02/03：登录、产品加入和登出必须分开

- **依据**：[会话架构](../../architecture/applications/auth-and-multi-saas-sessions.md)明确登录只建身份；`20261024032247_trusted_rpcs_and_locking.sql:211–291` 的成员 RPC 分别处理 ensure/leave/rejoin。反馈领域又明确不要求已有成员。
- **问题**：若把初稿末尾“注册登录 → ensure → check_access”直接写成统一登录回调，会在仅登录、反馈或恢复密码时写入成员；还可能把 left/suspended 视作登录失败。`check_access.allowed` 是产品准入，不能当 Auth 是否登录或是否可以反馈的判断。
- **最小建议**：官方 SDK 统一维护一份 Lens 会话；仅在已确定的首次合法产品操作触发 ensure，合法兑换可由 `redeem_code` 同事务建成员。明确重入才 rejoin，普通登出不 leave。回调使用固定 `/auth/confirm`、`/auth/reset-password`，处理真实确认/恢复结果、过期及重发；不让用户输入控制跳转地址。
- **登出与隔离**：显式 `signOut({ scope:'local' })`，不同应用独立登录，不复制 refresh token；切号/登出清理本人权益、云列表、私图 URL 和待恢复请求的可见状态，并让旧请求结果失效，保留本地项目/模板。新增 Lens Supabase 模块不能照搬 Admin 缺 env 即顶层抛错的启动模式，以免未配置后端时阻断离线 Free。缓存至少按环境、用户、产品隔离。
- **验证**：注册/确认/单纯登录/反馈均不创建成员；首次合法加入仅一条事件；left/suspended 不自动恢复；独立 Admin 与 Lens 会话中 Lens 登出不终止 Admin；A 账号迟到响应不进入 B。JWT 自然过期、refresh 撤销、blocked/撤权分别测试，**不要求普通 signOut 后所有旧 access JWT 瞬间失效**。

SDK 默认全局登出和 access JWT 残余有效期见 [Supabase signOut](https://supabase.com/docs/reference/javascript/auth-signout)；回调 allowlist 见 [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)。这是接入约束，不表示本次已验证运行 SDK。

#### F02｜P0，LENS-04：兑换没有 request_id，重复兑换也不返回原成功 DTO

- **证据**：`20261024033040_redemption_and_grant_rpcs.sql:58–196` 只有 `redeem_code(p_product_key,p_code)`；同用户同码已成功时返回 `ok:false,code:REDEEM_ALREADY_USED`，不是原 Grant；限流是 HTTP 200 内的 `RATE_LIMITED/retry_after_seconds`。
- **触发/影响**：首次成功响应丢失后重试会进入 already-used，统一按“ok:false 即本次失败/没有权益”处理会误报；给兑换强加 `request_id` 则根本不符合当前签名。`check_access` 显示 Pro 也只能证明当前资格，不能单独证明刚才那张码成功，因为可能原本已有 Pro。
- **最小建议**：按“本人 + 目标产品 + 同一码”的现有唯一核销约束恢复；保留同码手动重试能力，区分 already-used 和 invalid，之后刷新真实资格及必要的本人历史。**不为重放另建通用请求表或新增兑换参数**，不把明文码写入日志/云备份。member/redeem/feedback 的恢复规则分别列出。
- **验证**：丢首响、相同码重试、重复点击、两用户抢最后一次、同用户并发续期；成功只新增一个 Grant/核销，限流倒计时取后端值。到期/撤权后重试不因 already-used 恢复旧权益。

#### F03｜P1，LENS-02/04：权益摘要、历史和测试账号控件不是同一个 DTO

- **证据**：Lens `AccountPanels.tsx:159–171,299–319` 要求 `records/acquiredAt/source/days/expiresAt`；Core `check_access` 只有当前聚合资格。现有[Grant 迁移](../../../supabase/migrations/20261024025852_entitlements_and_redemption_schema.sql) `150–155` 已授权本人安全列读取，包含 `source_type/grant_mode/requested_duration_days/starts_at/ends_at/revoked_at/created_at`，不含内部 `source_ref`。
- **触发/影响**：为了填 UI 伪造 `records:[]` 会把“未读取”显示成“无记录”；把 `requested_duration_days=null` 直接映射“永久”会把**有限起止时段直授**误报永久。未来生效或已撤销 Grant 也不能凭历史记录授予当前 Pro。
- **最小建议**：需要历史时复用本人 RLS + 显式安全列 + 当前 `product_id` 过滤与有界读取；禁止 `select('*')`、复用 Admin 用户查询或新增重复聚合接口。期限看真实 starts/ends，永久须按可信资格/无限期事实表示；历史查询失败与空结果分开。当前资格仍只信 `check_access`，不由历史自行重算。
- **测试控件收敛**：昵称已确定使用Auth用户可编辑资料、仅显示；邮箱/密码复用Auth。注销人工受理且具体渠道上线前确定，不能为onDeletion造自动删号RPC或假报受理。30/365/永久是已确认授权时长，价格/渠道待对应阶段，本次不接支付。当前控件仍未真实接线，不以文档确认冒称实现。
- **验证**：有限 explicit_window、未来 Grant、多 Grant/部分撤销、永久与有限并存、跨账号/跨产品读取、缺列权限、历史读取失败；注销测试不得删除真实账号/业务数据。

#### F04｜P0（合同）/P1（接线），LENS-02/05：反馈以 Core 为准，但不扩建 Lens 反馈中心

- **证据/当前差距**：Lens测试表单仍仅message/email，Core要求product_key/request_id/content、category枚举缺省other及确认邮箱本人JWT。双方需求已统一为Core单向文字+最多两图，无联系邮箱/历史/进度/回复页面；旧表单和旧回复写路径尚未改动/清理，接线仍待实施。
- **已确认执行方向**：登录和邮箱确认是反馈前提，但none/left/suspended/Free不因缺Pro或active成员被拒，blocked拒绝；message映射content、无选择器时category=other。后续移除联系邮箱输入，不塞正文/静默上传，不新增后台联系邮箱模型；对应需求/架构冲突本轮已清理，代码未改。
- **范围**：首个可验收切片是零图真实提交；1/2 图按 Core 已有能力接入并单独验收。本人 RPC 可用于提交丢响应恢复，**不新增独立反馈历史、进度或回复页面**。Core Admin 的四队列不是向 Lens 公开内部标记/备注的许可。
- **验证**：已确认邮箱 Free/none/left/suspended 提交通过且成员/Grant 不变；匿名、未确认、blocked 拒绝；0/1/2 图、正文超限、分类非法、失败保留输入、同号异参 409。限制/字节数以 Core 实际合同为准，不以测试 UI 定参。

#### F05｜P1，LENS-05：反馈上游故障被误报为权限/邮箱拒绝（已确认分支）

- **证据**：[`feedback-submit/index.ts`](../../../supabase/functions/feedback-submit/index.ts) `15–16` 把 `identity.error` 与邮箱未确认合并为 403；`37` 把任意 `my_feedback` 错误映射 403。[`feedback-image-access/index.ts`](../../../supabase/functions/feedback-image-access/index.ts) `13` 同样把任意 RPC 错误变成 `IMAGE_FORBIDDEN/403`。
- **触发/影响**：Auth Admin 或 PostgREST 返回 5xx/连接故障时，客户端会误报未验证/无权，无法按服务异常恢复；零图也走这些检查，因此“先零图”不能跳过故障分类。提交后段已有 PT403/PT409/PT429 区分，不能据此宣称全链路错误语义已正确。
- **最小建议**：在上述边界保留已确定的 401/403/409/422/429 业务分类；服务调用失败返回 503/不可核验，无法确定写入结果才 UNKNOWN。只修这些实际分支，不建通用错误框架，不因故障放开权限，也不为减少调用擅自删除真实必要身份检查。
- **应先变红的测试**：Auth 查询 5xx、本人读取 RPC 5xx、图片鉴权 RPC 5xx 应为服务故障；真实未确认/无权仍为 403；UI 保留表单与原请求号，不退出账号或改判 Free。**本次只静态确认分支，尚未注入故障运行。**

#### F06｜P1，LENS-02/05：本人反馈查询的产品范围、可见性与恢复语义有缺口

- **证据**：最终覆盖实现是 `20261026013346_feedback_v2_screening_rpcs.sql:227–253`，不是最早的反馈迁移：没有产品参数，先跨本人全部产品取最近 100 条；即使指定 `p_request_id` 也排除 `queue_state='trashed'`。其 status 是 inbox→received、archived→recorded、其余沿用历史 `f.status`；V3 管理操作主要更新 queue，**该字段不是完整处理进度**。
- **具体后果**：① 先取 100 再在 Lens 过滤产品，其他产品足够多时本产品记录会被挤出；② 提交成功但首响丢失、Admin 随后放回收站时，按原号查询得到空数组，不能据此判“未提交”再换号；③ 工作台 V3 状态不能凭旧五态拼出“处理中/已解决”。这些不是跨用户泄漏的已证实漏洞，但会造成错误结果与恢复判断。
- **最小建议**：首轮 Lens 不建历史列表，UNKNOWN 保持原身份/产品/号及原参数重放，空数组不等于失败，不新建替代单。若后续确实使用产品内列表/确定性恢复查询，Core 先提供受保护的产品范围过滤和恰当的提交存在性结果，再一次更新 Edge 调用、SQL/客户端测试及 API 文档；不保留旧签名别名。不向客户端暴露回收站内部理由或管理字段。
- **验证**：同用户两产品、目标记录被跨产品 100 条挤出、相同 request_id 的产品范围、首响丢失后软删除/恢复；恢复最终仍只有一条反馈。本人附件读取与列表隐藏是不同权限，已知 attachment_id 在回收站时是否仍可读须以 Core 明确合同测试，不能声称当前已撤销所有旧 URL。

#### F07｜P1，LENS-05：图片魔数通过不等于完整图片有效；本地存储替身尚未接到正式入口

- **证据**：[`_shared/feedback.ts`](../../../supabase/functions/_shared/feedback.ts) `21–30` 只查 PNG/JPEG/WebP 头；`feedback-upload.test.ts` 使用 9 字节 PNG/5 字节 JPEG 作为魔数正例。实际 Edge 同样只据此准入。这些测试证明类型识别，**不能证明非法/截断图片被拒**。`r2()` 只从秘密拼真实 Cloudflare endpoint；S3Client 注入仅在 putObject/readObject 等底层测试中使用，正式 putFile/signedGet/readFile 不接该测试客户端。
- **最小建议**：若合同要求“有效图片”，用成熟能力做有界完整性/尺寸校验并覆盖截断、畸形和超大像素样例，不手写图片解码器，也不顺势建设图片处理平台。隔离本地联调仅增加足够的服务端本地 endpoint/测试依赖接线，统一写/签名读/ZIP/删除使用同一隔离对象库；不能把一次 S3 协议单测 PASS 当正式 Edge 已接通，更不能为本地测试填真实 R2 密钥。
- **已有能力与缺口分开**：条件写、确定性 hash key 和 `feedback_referenced_keys` 引用查询**已有**；定期安全回收执行者与完整故障对账**未实现**。优先复用引用查询，按保护期与当前引用做有界对账；不得在上传失败时立刻删同号对象，不引入独立队列/通用存储平台。
- **验证**：第二图写失败、R2 成功/DB 失败、DB 成功/首响丢失、并发同号、已有引用绝不误删、孤儿保护期、签名 URL 过期与 ZIP 缺图失败。完整图片验证与 Edge 级隔离存储测试本次 **NOT RUN**。

#### F08｜P0（开始备份前），LENS-02/06：先确定操作权限和最小元数据，不把所有操作都绑 Pro

- **合同/当前差距**：Core与Lens文档已统一完整分析模板、20份、5MiB已采纳待测、到期取回/删除与无年龄自动删除。原分类恢复和旧配额候选已移除，剩余为全层schema、专属接口/对象/配额代码与实测，不再等待所有者重复裁定这些业务方向。
- **执行**：create及最终提交查当前Pro；list/download/delete不因自然到期拒绝，但仍查身份、blocked、产品成员及owner。备份实施/大小测试只阻塞备份，最多15分钟快照实测只涉及本地权益；Auth/兑换/零图反馈不因此停工，阶段门禁不变。
- **数据合同**：云列表只取安全元数据；区分业务备份 ID、请求幂等 ID、格式版本、并发版本/ETag 和模板内部版本，不因名称都叫 version 而混用。正文按选中项下载并再次校验大小/schema/hash，交给现有 `prepareConfigRestore`，保留确认前后个人模板并发冲突检查；不要把整个云清单常驻为完整 ConfigPackage。
- **服务端一致性**：预留/最终提交都在可信事务复核当前资格、属主与配额，不能只在 Edge 入口 check_access 一次。ready 只计一次，pending 有界过期释放；对象删除失败可安全重试，配额释放时机需有可测试定义。复用专属 Edge/最小 RPC，不预建多产品通用备份框架、后台同步或复杂版本合并。
- **验证**：刚上传到一半自然到期/撤权/切号、满额同号重试/异号并发、越权枚举 ID、有限期 Pro 到期后的取回/删除、非白名单字段/超限、下载损坏、恢复时个人模板已被另一标签修改。所有备份运行验证仍 **NOT RUN**。

### Core 现有真实函数签名（本地源码静态核对）

| 接口 | 当前合同重点 |
| --- | --- |
| `get_my_products()` | 本人已加入产品概览，不自动创建成员 |
| `ensure_membership(p_product_key)` | 首次合法接入；`left`、`suspended`、`blocked` 不自动恢复 |
| `check_access(p_product_key)` | HTTP 200 可包含 `allowed:false`；只返回产品级准入与 Free/Pro，不接受 Lens `capability` |
| `leave_product(p_product_key)` / `rejoin_product(p_product_key)` | 本人明确退出/重入，不等于登录/登出或自动恢复 Pro |
| `redeem_code(p_product_key,p_code)` | **两参**；HTTP 200 可包含 `ok:false,code`；不是 HTTP 失败 |
| `my_feedback(p_request_id?)` / `my_feedback_events(p_feedback_id)` | 本人有限 DTO/公开历史，不暴露 R2 key 或内部管理备注；当前无产品过滤，列表最多 100 条且隐藏回收站，不能当完整进度或确定性未提交证明 |
| 本人 Grant 历史（Data API） | 已有本人 RLS 和列级 SELECT；显式安全字段、按产品、有界读取；不替代 `check_access` |
| `feedback-submit` Edge | JWT、邮箱已确认、`product_key`、UUID `request_id`、`content`、`category`、最多两图 |
| `feedback-image-access` Edge | 有权限的本人/管理员临时图片读取 |
| `feedback-export` Edge / `admin_feedback_v3` RPC | 仅 AAL2 Admin，可受控处理四队列与 ZIP；普通 Lens 禁止调用 |
| 模板备份 | 专用可信 Edge/RPC **未实现** |

具体 SQL 证据：`supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql`、`20261024033040_redemption_and_grant_rpcs.sql`、`20261025131845_feedback_trusted_rpcs.sql` 及后续 `20261025140940`、`20261025144322`、`20261026013346`、`20261026060213` 覆盖迁移，不能只读最早定义。唯一 API 权威为[公共 API 契约](../../architecture/backend/api-contract-and-mvp-acceptance.md)；更完整的已有签名盘点见[Core 静态清单](../aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md)，其中客户端尚未核对的叙述属于早期范围。

### 统一错误语义

| 场景 | 后端为准的 Lens 行为 |
| --- | --- |
| HTTP 200 + `allowed:true` / `ok:true` | 按各自 DTO 确认产品准入/兑换成功；Auth、成员与反馈各有自己的成功响应，不强加这两个字段 |
| HTTP 200 + `allowed:false` / `ok:false` | 展示可信拒绝 reason/code，不误判网络异常 |
| 401 / 403 | 会话或权限拒绝；保留本地项目和模板 |
| 409 | 读取最新状态/冲突版本，不能覆盖 |
| 429 | 依据 Core 限流/重试约束 |
| 503 / 超时 / 无响应 | 读失败为不可核验，写入结果无法判定才 UNKNOWN；不能当 Free、撤权或确定失败。按具体接口的恢复语义处理，不能统一添加 `request_id` |
| 无网/匿名 Free | 本地免费业务不应因 Core 故障被锁死；不在启动时强制创建云用户 |

**恢复方式按实际接口分开**：成员操作重新查询当前关系，ensure 仅在合法触发点按当前状态重试，不能自动 rejoin；兑换按本人/产品/同码重复约束及资格/历史核对；反馈固定本人/产品/原 request_id 和原参数重放；备份须先实现同号状态查询及异参冲突。反馈首次成功为 **201**、原号重放通常为 **200**，不能只认 200；读取到空列表不表示写入从未成功。

## 四、AisenCore 必须重点修改的位置

| 路径 | 改动建议 | 优先级 |
| --- | --- | --- |
| `supabase/config.toml` | 本地 Lens 8443 邮件回调、URL 与服务隔离，绝不下发 secret | P0 |
| `supabase/migrations/` | 核对成员/Pro/兑换安全与本人安全投影；按已冻结合同实现备份 owner/配额/幂等/版本/事务 RPC，不因审查预建表 | P0 |
| `supabase/functions/` | 模板云备份专属 Edge、大小/类型/完整性校验、安全对象操作 | P0 |
| `supabase/functions/feedback-submit/`、`feedback-image-access/`、`_shared/feedback.ts` | 修复故障误映射；补图片验证、正式入口的本地存储接线及引用安全对账，复用已有条件写 | P1 |
| `apps/admin/` | 真产品 key、管理发码与撤权、反馈 V3 Admin 交叉验证 | P1 |
| `supabase/tests/database/` | RLS/错误状态、并发、跨产品/跨用户、撤权、幂等 | P0 |
| `supabase/functions/tests/` | 反馈 0/1/2 图与 Edge 级鉴权/故障分类；备份 JSON/配额/部分失败；覆盖 UNKNOWN 与重放 | P0 |
| `docs/spec/`、`docs/architecture/`、`docs/Plans/TODO.md` | 决策与实际代码/验收结果同步唯一合同，不保留冲突的旧文档 | P0 |

### 私有模板云备份推荐最小链路

1. Lens 从当前上下文读取一套完整**已生效分析模板**，复用本地 `configPackage.ts` 的正式包；任何测试 UI 包字段不得成为 Core 权威。
2. **创建**时 Core 确认 JWT、blocked、产品成员、Pro、允许的格式/字段、对象大小/散列；读取/删除另按 F08 冻结各自条件，不能统一套创建的 Pro 门槛。服务端只处理安全必要的数据合同。
3. 可信 RPC 在数据库中按本人、产品、`request_id` 原子验证配额与幂等，创建 `pending` 预留。
4. 私有 R2 对象唯一写 `If-None-Match: *`，成功后可信 RPC 转 `ready`；失败明确释放预留或登记待对账。
5. 数据库和 R2 不是同一 ACID 事务：覆盖 R2 写成功/DB finalize 失败、DB 已提交/HTTP 响应丢失、重复同号与异参冲突、孤儿不可读与定期安全回收。
6. 云列表返回名称/时间/字节数/格式与并发版本/必要状态等少量元数据；选中才申请私有短期下载，校验下载正文后 Lens 使用现有本地解析、完整模板差异预览和个人模板恢复，不改现有项目快照、媒体、答案、AI Key 或本机其它设置。不向用户显示内部 pending/对账细节。
7. **已确认、待实现/实测**：完整模板全层白名单、20份、5MiB待实测、到期取回/删除及正常服务无年龄删除，遵循文件架构；当前本地包上限不是云接口已交付的证据。最多15分钟本地快照已采纳待测，不授权云操作或启用本次排除的业务门槛。

## 五、AisenLens 严格修改边界

**后续可改且仅限后端对接（当前任务只改文档）**：

- `apps/webapp/src/features/auth/`：官方 Supabase Auth SDK、Session 与当前产品成员、权益、兑换适配；可替换临时状态/测试回调。
- `apps/webapp/src/features/feedback/`：真实反馈提交、必要图像上传接线、仅为恢复所需的本人受限查询、明确失败/重试；不据此新增反馈中心/历史/回复界面。
- `apps/webapp/src/features/config-backup/`：云元数据、创建/列举/取回/删除的适配；**不可改变已验证的本地模板存储语义**。
- 单一必要后端适配、`.env.example` 中公开的 Supabase URL/Publishable Key、契约测试、`app/App.tsx` 与 `features/editor/components/WorkspaceSettingsDialog.tsx` 内必要的 Auth/后端接线；复用官方 SDK，不包装成第二套通用网络框架。
- 现有 `AccountPreviewPage.tsx` 是 DEV 模拟预览，不能把其假成功当成真后端证据。

**本轮边界**：不改视频/分镜/校准/时间轴/AI/Provider/项目保存/导出算法及其他非后端业务界面，不启用AI Pro、去水印、第二项目门槛。已允许登出/切号最小凭据锁定与会话Key释放、任务完成或明确取消、旧响应失效，保留加密凭据；该接线不能扩大为业务算法或存储重构。

## 六、六批实施路径和退出门禁

**执行入口已细化**：本节保留审查形成的批次/优先级依据；实际位置、步骤、测试、三阶段/第二阶段A～E依赖和准出统一按[详细总计划](./00-integration-master-plan.md)及[阶段索引](./README.md)。本审查不再独立承担施工状态或另一套详细计划，源码发现/决定与运行证据仍分开。

**实际联调前置门禁**：先按 `GATE-01` 核对第一阶段独立可完成的 Core/Admin 遗留项与正式签收；F05 的错误分类、F07 的独立服务端测试等可在第一阶段先修并验收，不能统统留给 Lens。当前可做静态合同整理、局部准备；“建议先批次 0+1”不是跳过签收的许可。

| 批次 | Core 主导工作 | Lens 的最小接入 | 实际准出 |
| --- | --- | --- | --- |
| 0. 环境与合同 | 固定两仓 HEAD+工作区、CLI/SDK/运行版本、JWT issuer/URL/key/CORS/回调与隔离实例；先冻结本批 DTO/错误 | WebApp `http://localhost:8443` 或明确选定的 `127.0.0.1` origin、公开 env、接线点复核 | 无生产秘密，运行实例身份清楚，Auth/兑换不被备份未决参数阻塞 |
| 1. Auth/成员 | Supabase 邮件/刷新/RLS/blocked/成员 RPC 负例完善 | 官方 SDK、注册/确认/登录/本地登出，合法产品操作才首次加入 | Lens 实际操作 → Core Auth/RPC/DB，401/旧会话边界/切号/离线通过 |
| 2. Pro/兑换 | Grant、到期/撤销、`check_access`/安全历史、两参兑换、限流/同码恢复 | 真实权益数据、兑换与不可核验状态 | Admin 授权/撤销后下一次可信核验正确，重复/响应丢失不重复授权 |
| 3. 反馈 | 先修错误分类，Edge + 隔离对象存储 + Admin V3 与失败对账 | 先零图，再 1/2 图；本人查询只供必要恢复 | 上传/私图/四队列/ZIP、跨账号/产品、403/409/429/503、原号重试 |
| 4. 模板云备份 | Core 专属 RPC/Edge、配额、条件写、对账/删除 | 仅接入云操作，复用现有模板包和恢复 | 上传/列表/下载/恢复/删除/版本冲突/断网重放 |
| 5. 总回归 | RLS/JWT/DB/Edge/性能、P0/P1 处置和证据整理 | 后端相关页面回归；验证原拉片核心不受损 | I/R/REV 适用用例和所有者签收，不以 Mock 代替真 E2E |

建议**取得第一阶段准入后，首轮双端代码实施先完成批次 0 + 1**：用 Lens 现有正式入口注册登录，获得 JWT；单纯登录不创建成员，再以明确的合法产品操作验证 `ensure_membership('aisenlens')` 和 `check_access('aisenlens')`，本地登出后原有项目/模板保持完整。产品 key 需核对当前隔离数据库，不能仅凭源码预期；缺产品时通过现有受保护管理能力准备，不直接绕开 RPC 写表。

环境验证同时覆盖 Mailpit `55324` 的实际邮件链接、`localhost` 与 `127.0.0.1` 的 origin/会话差别、Lens→`55321` 的 Auth/RPC/Edge 请求和 OPTIONS、签名对象读链路。端口 8443 的当前 Vite 配置是 **HTTP**，不能凭端口号当成 HTTPS；不为邮件 allowlist 擅自替换 Admin 的默认 site_url，也不为清除 401 关闭 JWT 校验。`verify_jwt=true` 与现有 `withSupabase({auth:'user'})` 需按运行版本实测（[官方说明](https://supabase.com/docs/guides/functions/auth)），源码存在不证明 Edge 已被正确加载。

阶段切换仍须遵守[三阶段交付门禁](../aisencore-mvp/three-stage-delivery-gates.md)：第一阶段尚有正式签收/遗留问题；第二阶段真实双端尚未执行；第三阶段才允许另行授权后配置云环境和部署。隔离实例不等于有权重置现有本地库；需要新建/变更数据库时另按已授权范围执行，不能把 reset、demo seed 或清库作为接入前置步骤。

## 七、联调最低验收矩阵

| 场景 | 正向结果 | 必测反例 |
| --- | --- | --- |
| 匿名 Free | 原本地工作流独立可用 | Core 离线不能破坏项目或强制上传素材 |
| Auth | 注册/确认/登录/刷新/恢复/本地登出；单纯登录不建成员 | 失效/重放邮件、过期 JWT、refresh 撤销与 access 残余窗口、跨应用会话、切号/迟到响应 |
| 成员 | 首次加入幂等、本人产品概览 | left、suspended、blocked、跨产品越权 |
| Pro | 授权、撤权、到期及必要复核；摘要与安全历史分开 | 200+`allowed:false`、503/不可核验、有限直授误报永久、未来/撤销 Grant、跨账号旧缓存 |
| 兑换 | 合法码、同码重复处理及资格刷新 | 错码、业务 200 限流、already-used、首响丢失/并发不重复授权 |
| 反馈 | Lens 0/1/2 图 → Core → Admin V3；成功 201/重放 200 | 无成员/left/suspended 可反馈但 blocked 拒绝；跨产品恢复、回收站空结果、上游故障误报403、私图/ZIP/安全回收 |
| 云备份 | 完整单包上传/列举/取回/恢复/删除 | Key/视频拒绝、配额、同号冲突、R2/DB 部分失败 |
| 不回归 | 原项目、分析、模板本地导入导出、免费导出保持原样 | 登出/注册/云故障不能重写、删除本地内容 |

每项记录两端版本、运行时配置、隔离测试账号、操作步骤、脱敏 HTTP/RPC 摘要、数据库/Edge 状态、错误注入、PASS/FAIL/NOT RUN、测试数据清理界限。现有已记录的 pgTAP/Chrome/Mock PASS 只作背景，不替代本次真实联调。

## 八、文档责任和本次状态

- 本文保留**审查结论与实施顺序**；[`docs/Plans/TODO.md`](../TODO.md) `LENS-01～07` 是唯一未完成任务清单，不在本文件创建第二份可勾选任务账本。
- F01～F08 是复审引用编号，不是新增任务系统；每条已映射到上述 LENS 编号。决定已采纳并同步权威文档，后续补可观察行为的失败测试再实施最小修复；代码/运行待办保持未完成。
- 长期接口、产品及安全权威是 [当前需求](../../spec/requirements.md)、[架构](../../architecture/README.md)、[公共 API 合同](../../architecture/backend/api-contract-and-mvp-acceptance.md)；[Core实际清单](../aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md)已同步静态核对结果与真实未验证范围，不再沿用单仓不可见状态。
- **本轮已同步**：Core需求、反馈/文件/身份/计费/会话/API权威及S1/总计划/TODO/接口盘点/阶段准备，Lens账号需求r5及相关架构/活动计划。清理匿名反馈/联系邮箱/追加回复、分类恢复/旧配额候选、U09/U10/U11业务未决、Lens源码尚不可见及本轮启用业务门槛等冲突；完整实现/接口/运行仍未交付，注销渠道明确留待上线前。
- 本次仅保存 Markdown 资料并维护索引；未清理两仓已存在未提交文件、未改代码、未迁移/重置数据库、未调用生产服务、未提交/推送或部署。
- **本轮文档验证**：Core全仓链接检查73文档/727文件链接/12锚点，0错误；Lens自带检查103文档/1654文件链接通过（不查锚点），另对其spec/plans/architecture分别检查锚点，均0错误。两仓git diff --check退出0；Lens TODO有既有LF→CRLF提示。额外Lens全docs锚点扫描发现1处本次范围外的并行文档坏链：development/testing/README.md指向design-system.md旧DS-09标题，已记录、未覆盖该并行工作。仅文档同步，typecheck/lint/build、pgTAP、Edge故障注入和浏览器E2E未重跑；当前实现缺口保持未完成。
- **清理与保护**：移除旧分类恢复/配额候选、匿名反馈/联系邮箱/追加回复要求、已确认业务仍待审批、源码不可见阻塞和本轮启用业务门槛等失效描述；压缩旧施工步骤，保留有效安全合同和原始测试证据。**本轮未删除文件、未改代码/迁移、未操作数据或云环境，工作区其他并行修改独立保留。**
