# FB-V2 专项执行计划｜收件箱、处理工作台与 AI ZIP 导出

> 2026-10-26；**执行中 / 第一阶段本地开发，不代表已上线或签收**。最新业务边界以 [反馈领域架构](../../architecture/domains/user-feedback.md) 为准。继承 [原 FB 施工与证据](./fb-user-feedback-implementation.md)、[三阶段门槛](./three-stage-delivery-gates.md)及 [TODO](../TODO.md)。仅本地隔离环境、合成数据；**不重置现有数据库、不提交 Git、不调用生产 Supabase/R2、不发布**。

## 1. 新产品合同和非目标

- 左侧保留 6 个一级导航：「概览、用户、权益、兑换码、用户反馈、平台管理」。在「用户反馈」模块内提供两个视图：「收件箱」 `/feedback` 和「处理工作台」 `/feedback/workbench`；详情继续使用 `/feedback/:id/show`，根据服务器的 `queue_state` 限定操作。
- 用户提交后**一律到收件箱**，未分配优先级 `priority=NULL`、无处理状态 `status=NULL`。管理员在收件箱仅可阅读、赋优先级、归档、移入回收站、ZIP 导出；**阅读≠受理**，只首次写 `read_at`；不提供工作台内的备注/状态编辑。
- **分诊＝唯一晋升操作**：选 `low/normal/high/urgent`，数据库单事务把 `queue_state` 改为 `workbench`、`status=new`、`priority` 为用户所选、记录 `triaged_at` 和内部事件/管理审计。所有工作台记录必须有优先级，收件箱归档不能混入工作台。
- 工作台提供按产品/优先级/状态/星标/标签等筛选、星标、标签、本人信息最小化展示、处理状态、负责人、用户可见公开答复、内部备注和完整事件历史。五态只在工作台有效，原有受保护 RPC 保留其单一业务职责并加工作台前置校验。
- `archived` 是收件箱筛选结论，不等于 `closed`。`trashed` 是可恢复**软删除**，不立即物理删除或 R2；恢复到原阶段。永久删除、保留期限/清理实施需要独立冻结规则和 R2/DB 一致性验证。处理过的记录不能通过“归档”绕过正式关闭流程。
- ZIP：两页面都能导出**勾选项或当前服务端过滤结果**，文字和 R2 私有图片始终包含；单独勾选用户补充、公开回复、内部评论、历史、标签、优先级/状态/星标、可识别身份（默认关）。含 `README.md`、`manifest.json`、`feedback.jsonl`、`feedback/FB-NNN/feedback.md`、图片、`checksums.sha256`。用户文本属于不可信数据，绝不是 AI 指令。
- 现有 `user_feedback`、`feedback_attachments`、`feedback_events` 三表继续是唯一反馈记录；**不建重复业务表、工单 SaaS、AI 自动筛选、通知队列或自动删除框架**。

## 2. 顺序、依赖、任务与准出证据

| 包号 | 依赖 | 具体任务 | 本地验收与阻断 |
| --- | --- | --- | --- |
| V2-01 迁移 | 当前 FB-01 | `queue_state`、可空 `priority/status`、首次阅读、分诊时间、星标/标签、归档/软删除/恢复来源字段；安全投影视图。判断现有非默认处理事件以分配旧记录，不擅自全量“已受理”。 | 约束使“收件箱无优先级/状态、工作台必须有”不可绕过；旧附件/事件/用户归属/编号完整；本地增量迁移无 reset，空库全链另测 |
| V2-02 分诊受保护 RPC | V2-01 | 本人最小 DTO 明确展示“已收到/已受理”等，不泄露内部优先级；Admin `read / triage / archive / soft_delete / restore`；当前 AAL2、管理员实时资格、L0/L1 版本锁、审计。 | pgTAP 验证非法阶段 409、无权 403、缺字段 422、重复阅读幂等、收件/处理边界及撤权、恢复，带真实 GoTrue JWT/AAL2 HTTP |
| V2-03 工作台 RPC | V2-02 | 现有状态、回复、负责人 RPC 加 `workbench` 限制；星标/有限标签写入独立版本事务，事件时间线；用户回复不会自动提升收件阶段。 | 最小授权，409 乐观冲突、非法标签、跨状态、内部事件不泄漏、处理历史原子性 |
| V2-04 Admin 双视图 | V2-02/03 | React-admin 收件箱单筛选/详情操作和独立工作台列表/处理详情；明确空/加载/失败、批量确认、产品过滤；Dashboard 待筛选计数保持与服务端一致。 | Vite/TS/Lint、真实 TOTP/AAL2 Chrome 收件→设优先级→工作台→状态→星标、窄屏/键盘/axe/人工 WCAG |
| V2-05 ZIP 导出 | V2-01～04 | 受保护 `feedback-export` 服务器端：只允许当前 AAL2 Admin，按选中 ID 或快照式服务器筛选；白名单字段和事件 visibility，R2 私有对象读取，ZIP 包结构/校验、下载与审计；原图不可缺失却报告成功。 | **先**独立本地 R2/S3 替身验证 0/1/2 图片、Unicode/ZipSlip、跨用户、无关产品、内部备注与身份默认排除、R2 503/UNKNOWN、下载失败、大小限额、解压校验；**再**真实 HTTP 功能 |
| V2-06 第一阶段签收 | V2-01～05 | 后端+Admin 完整真实浏览器回归、全 6 入口兼容、73+ 视口场景、性能、人工视觉及 WCAG 2.2 AA、故障恢复、文档合同校验。 | 所有者确认；不因 SQL/Mock PASS 就当作真实 R2 成功或人工签收 |
| V2-07 第二阶段 | V2-06 签收 | AisenLens 本地真实提交和用户回看、归档/受理语义与正文补充、重试/附件。 | 真实客户端数据，不用 seed 替代 |
| V2-08 第三阶段 | V2-07 签收+额外云授权 | R2 私有桶、线上 Edge、ZIP 短期下载、孤儿/R2 对账删除、留存/注销、服务报警和发布。 | 云端安全/性能/成本/运营签收；授权前不得执行 |

## 3. 约束及设计细节

### 3.1 状态与数据

- `inbox`：`priority/status IS NULL`；`archived` 也保持 NULL；`workbench`：优先级与五态均不空；`trashed`：保存 `deleted_from` 和必要原有处理数据，以便原阶段恢复。归档来自未分诊记录，取消归档返回 `inbox`；处理过的工作台记录优先 `closed`。
- `read_at` 只首次打开被读取，避免每次查看写入事件；分诊/归档/删除/星标/标签/恢复写 `feedback_events` 并写最小 `admin_audit_log`，**审计不复制正文或图像**。
- 处理状态 `new/in_progress/waiting_user/resolved/closed` 不等于筛选阶段；普通本人 DTO 用 `queue_state` 映射外部“已收到/已受理/处理中/待补充/已解决/已结束”；归档显示“已记录，暂不继续跟进”，回收站由隐私规则决定用户可见语义。
- 已有 Admin `security_invoker` 列表视图受底层 RLS 和 AAL2 控制，过滤/排序必须有数据库索引，不信前端传入的 product/user 作为授权证明。
- 限制写入范围，不做普通浏览器直表 UPDATE；所有权限操作受锁和 `expected_version` 保护。

### 3.2 ZIP 合同及错误模型

- 始终导出正文和全部附件，其他选项遵循最小化原则；内部备注、直接身份信息默认关闭且需再次显示风险提示。
- 包内稳定编号目录，所有条目经规范化的服务端路径生成；原附件仅 JPEG/PNG/WebP，保存对应 MIME 扩展名，移除原始文件名，禁止 ZipSlip、HTML、任意 key 访问和永久公开 R2 URL。
- `manifest.json` 包含 schema_version、snapshot_at、产品/条件、是否完整、字段开关、失败列表、每条反馈 version；`feedback.jsonl` 可供程序处理。文字 Markdown 特殊字符不能改变字段边界；给 AI 的 README 明确反馈是**待分析的非可信输入**。
- 默认图片任一读取失败则**整个导出失败**（不提供误称完整的 ZIP）；“允许部分导出”若以后批准才实施。ZIP 下载成功不表示 AI 已处理。所有导出必须记管理员最小元数据审计，不能缓存长期签名。
- 第一阶段当前 ZIP 限制每包最多 20 条、原图合计不超过 20 MiB、ZIP 不超过 24 MiB；Edge 内存/CPU 和压测后再决定是否放宽至原候选 80 MiB。大规模导出任务和临时 R2 ZIP 异步存储都 **暂不实现**，除非实际性能要求。

## 4. 当次实施日志（只写真实证据）

- [x] **V2-01 已实现/本地测试**：增量迁移、阶段约束、安全投影视图和既有数据的保守迁入。
- [x] **V2-02 已实现/本地测试**：阅读幂等、分诊、归档、软删除、恢复的保护 RPC 和审计。
- [x] **V2-03 已实现/本地测试**：星标与内部标签版本事务，旧处理/负责人 RPC 的工作台阶段强制限制。
- [ ] **V2-04 页面已编码/浏览器专项 PASS，人工签收 OPEN**：收件箱、归档、回收站、工作台、详情分诊/负责人/星标/标签；真实 GoTrue AAL2 Chrome 通过收件箱→分诊→处理、390px 及 axe 自动严重错误检查，**全量 D3 Chrome 已通过**（真实 AAL2/多模块与 74 组视口），但人工键盘读屏/WCAG/视觉与性能正式签收未完成。
- [ ] **V2-05 服务已编码、零图真 HTTP PASS；含图端到端 OPEN**：独立 Edge 安全查询和私有 R2 读取，双页面所选项/筛选 ZIP 选项，按字段裁剪、原图、manifest、JSONL、Markdown、SHA-256、敏感默认关闭，下载审计；437/437 pgTAP PASS，ZIP 解压/隐私单测 3/3 PASS；真实 JWT AAL1 拒绝、AAL2 0 图选中及按产品筛选 ZIP 解压 HTTP、超限 JSON 413 与导出审计 PASS；本地隔离 S3 签名 PUT/GET 1～2 张原图→ZIP 及 503 传播 PASS；真实一两图跨 Edge/R2 完整 HTTP、持久回收、压测及人工签收仍 OPEN。
- [ ] V2-06 第一阶段人工签收。
- [ ] V2-07 AisenLens 联调。
- [ ] V2-08 云端验收与发布。

**2026-10-26 / 收件详情“标记已读”并发修复**：在真实 Chrome 快速打开并分配优先级时发现标记已读曾错误增加 `version` 导致分诊 409；新增增量迁移 `20261026023706_feedback_v2_read_only_marker.sql`（仅 `read_at` 首次赋值、保持业务版本不变），修正 `010_feedback_v2_inbox.test.sql` 验证分诊不因阅读丢失并发版本。`pnpm dlx supabase test db --local` **11 文件 437/437 PASS**；`node scripts/test-fb-browser.mjs` 真 GoTrue/TOTP/AAL2 Chrome **exit 0**，已验证连贯收件箱→工作台列表→状态/负责人、工作台 ZIP 导出选项（内部评论/用户身份默认关闭）、390px 和严重无障碍负例且测试数据清理。此修复不降低处理事务的版本校验。

**2026-10-26 当次复测命令及证据**：`pnpm dlx supabase test db --local` 11 文件 **437/437 PASS**；`pnpm dlx supabase db lint --local` 无 schema errors；`pnpm dlx supabase db advisors --local --type security --level warn` **No issues found**；`pnpm --filter @aisencore/admin build` TypeScript/Vite **PASS**、`lint` 0 warn/error；`deno check feedback-submit/index.ts feedback-image-access/index.ts feedback-export/index.ts` **PASS**；`deno test --allow-env --allow-net=127.0.0.1 --allow-sys=osRelease` 的上传/R2 S3 协议/ZIP 三套用例 **9/9 PASS**；`node scripts/test-fb-real-http.mjs`、`node scripts/test-fb-browser.mjs`、`node scripts/test-d3-authenticated-pages.mjs` 和 `node scripts/test-fb-v2-export-http.mjs` 均为本地真实 JWT/AAL2/HTTP/Chrome 的已通过分层证据。ZIP 已校验表明导出结果含完整的原图字节与 SHA-256；实际 Cloudflare R2 Bucket 未接触，**隔离 SDK 模拟不等于跨服务真实验证**。所有测试合成身份、反馈均遵守局部创建/清理；Git 未提交/推送。已同步需求、领域架构、Admin、公共 API、数据库、计划索引和 TODO。

**2026-10-26 / ZIP 安全复核补强**：`_shared/feedback.ts` 私有 S3 GET 改为带绝对上限的分块流式读取，既校验声明长度又在接收流过程中强制最大 3 MiB，防止错误的 DB 元数据或恶意存储响应触发无限量内存加载。`feedback-export` 新增 **读取前 `admin_check_access` 实时权限验证**（撤权用户返回 403 而非混淆成空筛选的 422）、打包完成后对所选反馈的 `id/version/queue_state` 做安全投影二次校验，发生并发变化返回 409，最终受保护导出审计 RPC 再做实时 AAL2/资格验证。Admin 选择内部评论或身份信息时增加风险警告与二次确认；ZIP Blob URL 延迟 60 秒回收，避免同步撤销导致浏览器未开始下载。**补强回归证据**：Deno 三套上传/S3 GET/ZIP 测试 9/9 PASS（含超大对象和 503）；Deno Edge 类型检查 PASS；Admin Build 和 lint PASS；11 个 SQL 文件 437/437 PASS；`node scripts/test-fb-v2-export-http.mjs` 在**重新加载当前 Edge 工作进程后**完成真实 JWT AAL1 拒绝、AAL2 选中/筛选 0 图 ZIP、8192B 入参限额、解压、单次管理资格撤销后旧 JWT 被拒、审计和隔离数据清理 PASS。测试期间本地 `per_worker` Edge 热更新曾命中过期代码，现用响应修订版本头验证执行版本；曾有 502/GoTrue 504 临时失败，不把这些失败掩盖成可靠性/性能验收。**仍 OPEN**：1/2 图 Edge↔真实 R2 Bucket 完整 HTTP、真实并发快照冲突注入、性能与内存正式负载、最终人工键盘/读屏/WCAG 2.2AA/视觉签收，以及二/三阶段门槛。

> 一切「通过」后续必须注明命令、环境及边界。不得回填不存在的验收证据。

### 2026-10-26 / Admin 用户反馈视觉与交互质量专项

- **实际修改**：收件箱/工作台统一业务 Tabs，工作台反馈编号、正文、类型、未读、附件、星标/标签整合为主摘要；状态、优先级、产品名称及时间形成紧凑层级，窄屏隐藏次级列。详情桌面左右双栏、移动纵向分组、独立操作与处理历史；缩短裸 UUID，产品/用户安全引用跳转，负责人展示授权账号信息。星标/标签、回收站确认、批量勾选切换产品/队列后重置，处理未保存草稿禁止直接指派，独立版本操作刷新仍保留其它区域未保存文本。处理历史使用受控分页读取最新事件，避免只取最早 100 条。这些都是现有 React-admin/MUI/RPC 的最小改造，不改变权限及数据模型。
- **当前实测证据**：在本机隔离 Supabase/真实 GoTrue/TOTP AAL2/Chrome，用合成用户与产品执行脚本 node scripts/test-fb-browser.mjs，覆盖收件→分诊→工作台状态变更/负责人审计/ZIP 隐私默认/星标写入后回复草稿保留、390px 无整页横向溢出、axe WCAG 自动扫描 0 个 serious/critical，且测试账户/产品/反馈清理验证 PASS。用 FB_CAPTURE_UI=1 模式产生五张本地截图，文件位于 ui-evidence 目录，分别为 feedback-inbox-desktop.png、feedback-inbox-detail-desktop.png、feedback-workbench-desktop.png、feedback-workbench-detail-desktop.png 与 feedback-detail-mobile-390.png；截图内容使用一次性合成测试数据。
- **本轮 DB 与构建**：pnpm dlx supabase test db --local = 11 文件 437/437 pgTAP PASS；pnpm --filter @aisencore/admin lint = 0 error/0 warning；Vite/TS 生产构建与反馈浏览器专项在变更中分层复测（具体最终结果以当次后续执行记录为准）。未重新验证真实云 R2/Edge 含图全链，也未完成键盘读屏、人工 WCAG 2.2 AA、系统性多视口视觉/性能和所有者签收；这些项目仍属于第一阶段发布阻断。未执行 Git 提交/推送、云端部署或数据库 reset。

#### 同日后续复核：运营安全与细节设计

- 发现敏感 ZIP 选项的前端状态原先在对话框重新打开时沿用上次值；已改为每次打开/关闭重置为不包含身份及内部评论，并将系统原生确认替换为无下载副作用的界面内二段确认。真实 AAL2 Chrome 测试执行“启用内部评论 → 进入敏感确认 → 返回修改 → 关闭 → 再次打开”，确认默认恢复关闭；后端继续每次独立校验 AAL2、Admin 资格、筛选、版本与审计，不放宽。
- 内部标签从顿号拼接输入改为可键盘回车添加/移除的独立 Chip 数组编辑，支持单个标签本身包含顿号、逗号等符号，直接按 DB 字符数/数量/唯一约束作前端预检。工作台编辑器根据服务端合法五态流转提供下一状态，首次进入“待用户补充”前要求写明公开问题；服务端仍决定状态与权限。回收站按钮文案“恢复到原阶段”覆盖来源可能是 workbench 的情况。
- 私有图片展示设置 no-referrer 与懒加载，失败时清除失效 URL 并显示重试入口。精确状态、草稿和敏感数据不进入持久化浏览器存储。
- 最新反馈专项本地真实 GoTrue/TOTP/AAL2/Chrome PASS：列表、分诊、处理状态、负责人审计、星标+内部标签真实写入、其他编辑区未保存回复保留、ZIP 默认隐私及二次确认、390px 详情/工作台、320px 工作台无整页横向溢出、axe serious/critical=0、隔离测试用户/产品/反馈已清理。Admin TS/Vite Build PASS；Lint 0 warning/0 error。7 张合成截图可用 FB_CAPTURE_UI=1 重跑生成，其中新增 workbench-mobile-390/320。测试环境仍非 Cloudflare R2 真实网络，不能冒充云端图片测试或人工验收。
- **最终全站回归记录**：node scripts/test-d3-authenticated-pages.mjs 在本地真实 GoTrue/TOTP AAL2 + Chrome 中 **exit 0 / PASS**，含反馈一级导航、其他管理资源、受保护操作、错误恢复及 74 组视口-页面覆盖；QA 授权/产品账户清理确认 PASS。全站前两次复测分别遭遇列表懒加载竞态和 Chrome Page.captureScreenshot 15 秒超时，后续限定等待真实列表操作入口并为截图加入最长两次有界重试，最后一次完整脚本退出 0。上述修复仅增强测试定位与时序，不降低任何真实页面断言。自动 PASS 仍不意味着所有键盘读屏场景、人工 WCAG 2.2 AA、P95 性能和负责人视觉签收已完成，严禁据此启动第二、三阶段。

#### 管理端排版复查与布局纠偏（取代前述“双栏详情”）

- **问题复盘**：之前反馈页面在已有 Admin 统一布局内再次使用无明确 width 的居中包装，导致截图中标题、列表、空态缩成居中的窄岛；详情左右双栏对于短反馈产生大量无价值留白，还把低频星标、标签、历史永远展示在主页面。自动化仅检查可渲染与无横向溢出，因此遗漏了布局质量。
- **改造**：反馈列表和详情包装统一采用与其它资源页面相同的 1720px 上限、100% 自适应宽度、左对齐内边距与标题字号；空态卡片横向铺满并左对齐。详情改成通栏原始内容、按需显示附件、通栏响应式处理表单；收件箱分诊改为紧凑横向操作栏，不再让单个下拉与按钮拉满整个屏幕。低频「星标与标签」「处理历史」作为顶部按钮打开弹窗，历史弹窗打开后才按最新事件分页拉取，回车可编辑标签，所有操作仍遵循后端安全 RPC、版本锁与权限。
- **验收**：更新 AAL2 Chrome 专项回归，新增标题/表格与工作区左边距及宽度比例断言、详情正文卡片宽度比例、两个 Dialog 的实际渲染和操作、星标标签保存后公开回复草稿不丢失、390px 详情与 320px/390px 工作台无整页溢出；启用 FB_CAPTURE_UI=1 时还生成历史和星标弹窗的真实截图。自动检查不替代人工视觉签收。
