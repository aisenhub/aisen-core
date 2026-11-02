# AisenCore 上线测试前全面收尾审查报告

**审查日期**：2026-10-29\
**仓库**：`E:\Projects\Aisencore`（通过用户指定的 mycodex Runner）\
**基线**：`main` / `b715a3221d30c55d3118be60eb31f45797bef662`；审查结束时工作树干净；无提交、推送、删除、云端操作。\
**审查目标**：评估 AisenCore 在 AisenLens 本地联调基本结束之后、申请第三阶段部署与上线测试许可之前的代码、文档、任务、发布风险与待收尾工作。\
**证据等级**：`本轮实际执行`、`本地数据库只读核查`、`源码证据`、`项目历史记录（本轮未复测）`、`待验证`严格区分。

## 一、结论与准入判定

**判定：尚不建议直接按“可进入正式上线测试”签收。** 目前有稳定的可构建基础、已落地的本地迁移和多项真实联调历史记录，但存在两个已由本轮直接证实的高优先级硬问题：

1. **锁文件与工作区补丁不一致：干净检出无法通过 `--frozen-lockfile` 安装门禁。** 本轮实测 `pnpm install --offline --frozen-lockfile --ignore-scripts` 返回 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`。当前开发机能构建不等于新环境可重现。
2. **反馈旧写接口未完成退场。** `public.reply_to_feedback`、`public.admin_update_feedback` 仍由旧迁移授予 `authenticated` 执行权限，最新 V4 迁移没有显式撤销或删除；其内部仍包含用户回复、管理员公开回复及旧状态写入逻辑。V4 新触发器主要阻止旧回收站/标签变更，不等于关闭旧回复入口。属于与唯一 V4 业务合同冲突的旧能力暴露，需通过实际 JWT/SQL 负例验证影响和清退结果；**这不是已经证明越权读取、提权或任意用户可回复他人记录**。

此外，**反馈 V4 永久删除仍缺少本轮真实 AAL2→Edge→本机私有对象→DB 的 0/1/2 图及故障恢复验证**；阶段签收、其他真实负例、可访问性、性能、恢复与发布参数尚未闭环。应先处理本地可修的门禁，再凭明确授权进入第三阶段云端测试；不能用本地 PASS 代替真实 R2/SMTP/部署 PASS。

## 二、覆盖面和本轮实测

| 项目 | 本轮事实 | 解释 |
|---|---|---|
| Git/工作区 | `main`、HEAD `b715a32`；最终 `git status` 干净、`git diff --check` 通过 | 所有审查副作用已清除；没有修改用户工作成果 |
| 仓库清单 | 364 个 Git 跟踪文件；94 个 Markdown；39 个 Supabase SQL 迁移；14 个 pgTAP SQL 测试文件 | 含前端、Edge、脚本、规范、历史阶段证据；图片/JSON 证据作为资产盘点，不逐一视觉重验 |
| TypeScript | `pnpm typecheck` PASS | 在开发机已有/自动调整的依赖目录上通过 |
| 前端 lint | `pnpm lint`：0 错误、0 警告，40 文件/116 条规则 | 不等于业务 E2E |
| 前端构建 | `pnpm build` PASS；Vite 2379 个模块转换 | 最大主要 chunk：MUI 385.97kB / gzip 119.13kB；ra-core 320.55/102.91kB。不能将这些数值直接等同首屏加载量 |
| 静态契约 | 7 项 PASS：反馈 V4、三卡概览、单次兑换页面、治理拆分、主题圆角、前端源码边界、bundle 密钥扫描 | 不等于 JWT/浏览器/R2 验收 |
| Edge 类型 | `deno check --cached-only`：`feedback-delete`、`feedback-submit`、`feedback-export`、`feedback-image-access` 4 项 PASS | 依赖缓存下的类型检查；不等于实际请求、失败注入 |
| 文档链接 | `node scripts/check-doc-links.mjs`：94 文档、889 文件链接、17 标题锚点、**1 错误** | 失败于 `CORE-FEEDBACK-001-contact-email-design.md:3` 指向需求文档旧 V3 标题锚点 |
| 锁定依赖 | `pnpm install --offline --frozen-lockfile --ignore-scripts` **FAIL** | `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`，`patchedDependencies` 与锁内 hash 不一致 |
| 本地迁移 | `pnpm dlx supabase migration list --local`：仓库全部 39 个版本在本地数据库迁移记录中对应 | 这是本地状态，不表示远端已安装；尤其 V4 `20261029210000` 已本地安装 |
| 数据库 lint | `pnpm dlx supabase db lint --local`：命令成功，列出 11 个函数合计约 14 个警告 | 主要是 STABLE/内部 VOLATILE 判断和未使用变量；逐项判真伪，不能全部默认为安全缺陷 |
| 未执行 | 本轮未进行会写测试数据的真实 Auth/SQL 事务、AAL2 浏览器操作、删除 Edge/R2 负例、Cloudflare/远程 Supabase/SMTP 实测，也未验证 AisenLens 最新工作区 | 不能把历史文档 PASS 重新记作“本轮 PASS” |

**审查中偶发工作树副作用**：`pnpm typecheck` 触发的包安装将 `pnpm-lock.yaml` 中 `query-string@7.1.3` patch hash 从 `5ff30b...` 改为 `2a4039...`。已核对 `git diff`，并将仅此审查引起的修改恢复至 HEAD。最终工作区卫生检查 PASS。上述 hash 变化是需要修复的可重现性事实，不能提交本轮临时改动冒充修复。

## 三、收尾缺陷登记（按优先级）

### P0：建议在第三阶段测试准入之前关闭

**P0-01｜锁定依赖安装不具可重复性（已实证）**\
证据：`pnpm-workspace.yaml` 中 `patchedDependencies`、`patches/query-string@7.1.3.patch`、`pnpm-lock.yaml` 第 166 行及后续 snapshots；本轮 frozen install EXIT 1。\
影响：新机器/CI/部署构建可能直接失败，即使现有 `node_modules` 中 TypeScript 和 Vite PASS。\
处理：在专用修复分支中按唯一补丁重建锁文件，检查补丁 hash 与工作区配置一致，复测无网络/无隐式修复的 frozen install、typecheck、lint、build、反馈下拉运行时回归。仅在获准的提交/合并流程中发布。\
关闭证据：干净工作区、干净依赖目录安装 EXIT 0，锁文件安装后无 diff，原运行时 `query-string` parse/stringify 与真实浏览器过滤均 PASS。

**P0-02｜反馈旧公开写 RPC 未清退（静态确认，实际 JWT 负例待补）**\
证据：`supabase/migrations/20261025131845_feedback_trusted_rpcs.sql:150–187,189–282,328–347` 定义并向 `authenticated` 授予 `reply_to_feedback`、`admin_update_feedback`；`20261026060213_feedback_v3_lightweight_workflow.sql:14–128` 仍包含 `trash/restore/tags`；`20261029210000_feedback_permanent_delete.sql:14–30` 是状态触发器保护而非撤销旧函数。`docs/spec/requirements.md:117–125` 明确 V4 不再提供旧回复/回收站/自定义标签。\
影响：与上线前零兼容、单一有效合同相冲突，旧 RPC 可以绕过新 UI 的能力隐藏；后端旧状态仍有触发路径。当前并无证明其可绕过用户本人/管理员鉴权，但必须退场。\
处理：先对当前本地 DB 做**只读目录/EXECUTE 权限盘点**，用真实普通用户及 AAL2 管理员 JWT 对旧函数做预期拒绝负例；通过后续迁移显式撤销/删除不再批准的 RPC/内部实现，补充 pgTAP 和真实 HTTP 负例；调整不再适用的旧测试，不修改已应用迁移来冒充历史不存在。复核 V3 保留的 `admin_feedback_v3` 是否仍是当前三队列唯一有效的操作实现，若保留须删去废弃 action 和参数。\
关闭证据：所有废弃公开写入口在数据库目录不存在或认证请求稳定拒绝，现行 V4 合法操作不回归。

**P0-03｜反馈 V4 永久删除高风险链路缺少真实 E2E**\
证据：`docs/Plans/aisencore-mvp/2026-10-29-feedback-admin-ux-bulk-delete-remediation-plan.md:36–43` 记载源码和本地迁移完成、真实删除负例未完成；`supabase/functions/feedback-delete/index.ts:9–77` 串联 `admin_prepare_feedback_delete`、R2 原图/缩略图删除、`admin_finish_feedback_delete`；`supabase/migrations/20261029210000_feedback_permanent_delete.sql:38–164` 定义两阶段受保护删除。\
影响：对象存储与 PostgreSQL 不具原子性，可能出现删除部分完成、外部响应丢失、重试不正确、权限撤回后误继续、错产品/版本删除等上线风险。\
处理：先在隔离本机 S3+真实本地 DB/GoTrue/AAL2 上测 0/1/2 张、缩略图、404/503、失联、重复、409、权限撤回、跨产品和 20 条批量部分成功；验证未误删历史数据、任务恢复后对象和 DB 均清洁；不在未完成前启用对真实用户数据的永久删除。真实 Cloudflare R2 测试必须在获授权第三阶段进行。\
关闭证据：逐项输入/响应/SQL/对象清单/审计/QA 回收和 EXIT 记录；云端有独立验收证据。

**P0-04｜阶段门禁尚未签收**\
证据：`docs/Plans/TODO.md` 的 `GATE-01`、`LENS-07`、`DEPLOY-01~03` 仍 OPEN；`docs/Plans/aisenlens-aisencore-local-integration/06-stage2-integration-acceptance.md`、`07-stage3-cloud-and-release.md` 对综合验收/授权列明条件。\
处理：第一阶段遗留风险逐项验收或经所有者书面豁免；第二阶段按照真 Lens 客户端来源的跨模块/故障矩阵签收；区分“获授权部署到测试环境”“通过云端验收”“公开上线”三种单独决定。

### P1：测试前要有负责人、处理决定和可复测记录

**P1-01｜数据库 lint 警告分类**：本轮 `supabase db lint --local` 发现 `private.admin_feedback_tags_core`、`admin_list_users_core`、`admin_feedback_pending_deletes_core`、`admin_code_batches_v2_core`、`admin_batch_codes_v2_core`、`admin_dashboard_metrics_core`、`admin_get_pro_entitlement_core`、`admin_get_user_pro_entitlements_core` 等 VOLATILE/STABLE 警告，另 `redeem_code_core`/`admin_grant_entitlement_core` 未使用 `v_anchor`、`admin_prepare_feedback_delete_core` 未用 `v_actor`。应对涉及权限判断和实时数据的调用确认函数 volatility、语句/快照语义，必要时改 `VOLATILE` 并补 RLS/AAL1/撤权负例；纯未用变量单独清理，避免无意义改动。

**P1-02｜缺少统一的自动化质量门禁**：根 `package.json` 只有 dev/setup/seed/typecheck/build/lint，无 `test`/完整验收脚本；Git 跟踪清单中没有 `.github/workflows/`。虽然有 14 个 pgTAP fixture 和大量 `scripts/test-*.mjs`，但缺少统一的干净安装→lint→build→静态→数据库→真实 JWT→浏览器→证据归档跑道。至少为本地可重放门禁定义命令和必须 PASS 的范围；如计划启用 CI，应在获得相应仓库/推送许可后建立。生产密钥、真实数据不得进入 CI。

**P1-03｜Auth/账号恢复与运行时安全仍 OPEN**：`docs/Plans/TODO.md:36` 的浏览器邮件恢复回调、过期/重放、`PASSWORD_RECOVERY` 与正常会话区分、MFA 因子遗失/更换、旧 AAL2 与多会话撤权、503/超时、A-04 管理员失因子演练尚待统一签收。

**P1-04｜权限/并发/数据库规模矩阵仍缺口**：`docs/Plans/TODO.md:37,49–55` 涵盖 DEC-06 用户目录规模、策略执行计划、I/R/REV 完整负例、真实多用户并发和跨模块数据保护；不要只用纯模型/pgTAP 代替 GoTrue/JWT/HTTP/Chrome。

**P1-05｜Admin 功能/WCAG/性能/真实产品操作未综合签收**：`docs/Plans/TODO.md:33–35` 仍明确 401/403/409/429/503、迟到响应、断网、危险操作、NVDA/VoiceOver、键盘、缩放、320–1440 断点、人工视觉需补；匿名登录慢网 LCP 中位数记录约 2936ms，高于候选 2500ms。构建 chunk 不能替代首屏网络瀑布和 INP/P95 实测。

**P1-06｜AisenLens 私有模板备份的发布范围需冻结**：`docs/Plans/TODO.md:54` 将 `LENS-06` 明确 DEFERRED；20 份、5MiB（待测）、完整个人模板恢复、签名和对象/数据库一致性未达到完整跨端发布条件。若上线宣传包含“完整 AisenLens 云备份 MVP”，该项仍为发布阻塞；若首批仅 Core/Admin，需在范围说明中明确不发布此能力，并防止错误 UI 承诺。

**P1-07｜生产/预发配置和灾备 Runbook 尚未证实**：`docs/Plans/aisenlens-aisencore-local-integration/07-stage3-cloud-and-release.md` 和 `d4-release-acceptance.md` 要求真实 SMTP、域名回调、私有 R2、最小密钥、CORS/RLS、备份恢复、告警、人工账号注销留存/责任、管理员备用 MFA、公开授权。此类第三阶段测试不得被本地假定 PASS；云端操作须先授权。

### P1：文档状态错位（必须与代码修复同批治理）

| 文件与位置 | 已发现的问题 | 应改为 |
|---|---|---|
| `README.md:9–15,85,93–101,143` | 仍写“第二阶段准备期”、D1 仅四/五迁移、旧 286/286 及 D2 未进展状态 | 明确第二阶段本地联调已开展且部分真实联调 PASS，39 本地迁移已记录；把未签收和第三阶段 NOT RUN 分开 |
| `docs/README.md:13–25` | “2026-10-24 已验证”旧基线、第二阶段未开始、旧 SQL 数量 | 用一次短的 2026-10-29 真源状态替换旧流水 |
| `AGENTS.md:4` | 同一段前半说已进入 Stage2，后半仍称 Lens 真双端请求待接线 | 保留阶段授权约束，修正最新事实，删除失效断言 |
| `docs/Plans/TODO.md:3–7` | 核查基准写 `92e7c03`/2026-10-27，却已是 `b715a32`/2026-10-29 | 统一审查快照与证据日期，避免同一 TODO 混合历史状态 |
| `docs/Plans/TODO.md:21,38–39` | 上文已记 `20261029210000` 本地安装，FB-02 又称“仅回滚验证、待正式安装” | 更新为“本地安装 PASS，V4 Edge E2E/人工与云端仍 OPEN” |
| `docs/spec/requirements.md:124` | 同样误写 V4 SQL 未持久安装 | 同步精确本地状态；不把安装记作完整业务验收 |
| `docs/Plans/aisencore-mvp/2026-10-29-feedback-admin-ux-bulk-delete-remediation-plan.md:40–42` | 第 40 行写已安装，第 42 行写尚未持久安装，文件内部自相矛盾 | 清理旧一轮检查段落，以最新执行事实为准 |
| `docs/Plans/README.md` | 虽包含 V4 专项入口，却仍把 V3 四队列描述为“当前可编辑合同” | V4 单一现行合同，V3 仅历史证据 |
| `docs/architecture/backend/public-api-and-saas-integration.md:3,48–53,75–77` | Lens 未接线、V3 当前、F06/R16 未持久安装等旧假设 | 更新为本地已通过的范围和真实 OPEN；与 `spec`、`user-feedback`、实际 SQL 一致 |
| `docs/architecture/domains/user-feedback.md:98–99` | 旧 V3 编辑合同和“旧 reply 写路径将来清理”仍留在当前权威 | 立即将旧 RPC 退场设为当前阻塞，并将现行 V4 规则补全 |
| `docs/architecture/database/product-data-and-files.md:30`、`docs/architecture/current-main-architecture.md:84`、`docs/architecture/infrastructure/tech-stack.md:32` | V3/未联调/未进行 Edge HTTP 等范围描述过时 | 统一 V4 与最新本地 S3/JWT 证据，云 R2 保持 NOT RUN |
| `docs/Plans/aisenlens-aisencore-local-integration/README.md`、`04-stage2-feedback.md` | “阶段 A～E 全部 NOT RUN”、V3 四队列仍为新需求 | 区分已验证真双端切片与未综合签收；参考 V4 |

**确定的失效引用**：`docs/Plans/aisenlens-aisencore-local-integration/CORE-FEEDBACK-001-contact-email-design.md:3` 的 `../../spec/requirements.md#用户反馈-v3四队列轻量处理--私有图片--可选内容-zip`，现在需求章节是“用户反馈 V4：三队列、五分类、批量移动与永久删除 / 私有图片 / ZIP”。应直接链接现行 V4 标题，而非建一个旧 V3 假锚点。

### P2：历史资料与死代码候选（核实后精简，不直接批量删除）

1. **建议从活动入口移至 Git 历史或精简归档的过程文档**：`docs/Plans/aisencore-mvp/fb-v2-inbox-workbench.md`、`feedback-v3-lightweight-implementation.md`、`phase-transition-optimization-plan-2026-10-27.md`、`phase2-core-integration-contract-inventory-2026-10-27.md`、`docs/Plans/aisenlens-aisencore-local-integration/2026-10-27-cross-repository-audit-and-integration-plan.md`、`docs/development/testing/document-governance-audit-2026-10-27.md`。先提炼仍有效的验收条件与未完成项；不要因旧日期就简单删除可复测证据。
2. **已被新合同覆盖的开放清单要合并回唯一 TODO**：`feedback-v3-lightweight-implementation.md:95–106` 中“P4 缩略图未做”和“旧客户端兼容”等断言已过时；`fb-v2-inbox-workbench.md` 仍有历史勾选框。真正未测的真实 R2、读屏、性能可保留在现行任务。
3. **代码命名/死入口清理候选**：`apps/admin/src/resources/FeedbackV2.tsx`、`FeedbackV3Editor.tsx` 当前已承载新逻辑但名称指向旧代际；`useFeedbackTags.ts`、相关旧 `admin_feedback_tags` 查询和 V2/V3 测试链需做引用/调用图检查。仅删除确证不再被调用的内容，不要删除有效兼容测试以外的安全负例，且不得清除必要历史 SQL 迁移记录。
4. **测试与证据归档**：`docs/Plans/aisencore-mvp/ui-evidence/` 保留当前唯一扫描/截图/计时证据，按“当前验收引用”“历史对比”建立轻量索引，去掉已无意义的入口长清单。截图和不可重现的原始负例不要盲删。
5. **TODO 过度膨胀**：唯一 `TODO.md` 有 28 个未勾选顶层项，但不少条目是超长的历史 PASS 日志而非简洁的剩余工作；将 PASS 证据收敛到专项验证记录，TODO 仅放 ID/优先级/实际剩余问题/退出条件/链接。不要构造第二套状态账本。

## 四、建议的执行顺序和责任划分

| 顺序 | 工作包 | 责任建议 | 完成门禁 |
|---|---|---|---|
| 1 | 固化准入基线：锁文件+补丁修复；干净安装、构建、静态回归 | 前端/构建 | frozen install EXIT0；仓库 clean；新机器重放可复现 |
| 2 | 反馈旧 RPC 调用图/权限盘点与新迁移退场 | 数据库/安全 + Admin | 旧写端真实 JWT 负例，V4 正例无回归，旧 tags/回复/回收站入口不可用 |
| 3 | V4 删除真实本地全链及失败恢复、基线清理 | DB/Edge + QA | 0/1/2图和缩略图、故障矩阵、批量 20、权限/范围、误删负例、可重试证据 PASS |
| 4 | DB lint 分类及回归、核心新迁移 pgTAP/负例、专项并发/HTTP P95 | DB/安全 | 每条警告处置记录；RLS/旧token/死锁和重要写入完整证据 |
| 5 | Admin 高风险流程、无障碍和慢网/交互性能 | 前端 + QA/所有者 | 真AAL2浏览器矩阵；WCAG 自动+人工；关键页面/范围截图签收；性能门槛或书面豁免 |
| 6 | Core×Lens 阶段2全链与延后备份的发布范围 | 双仓集成/产品所有者 | 客户端真实操作链、故障与回收、LENS-06是否纳入首发决定、书面Stage2签收 |
| 7 | 全仓文档真源、索引、失效引用与历史归档 | 文档维护/技术负责人 | 链接0错误；所有权威合同反映迁移/接口；TODO只列OPEN；历史材料不误导 |
| 8 | 第三阶段申请与环境清单；授权后才做云端验证 | 发布/运维/所有者 | 真实 SMTP/R2/域名/私有权限/备份恢复/回滚/告警；独立部署许可、独立公开许可 |

## 五、建议的上线测试准入检查表

- [ ] `pnpm install --frozen-lockfile` 在干净环境 EXIT0，安装后 `git diff` 为零。
- [ ] 正式构建、typecheck、lint、Edge check、静态安全检查和文档链接全绿。
- [ ] 当前迁移版本表与 Git 一致；废弃公开函数不可访问；核心数据库 lint 问题均有处置结论。
- [ ] V4 删除在真实本地 Auth/AAL2/DB/隔离 S3 上的删除/失败/权限/回滚矩阵通过。
- [ ] 第一阶段遗留 P0/P1 有 PASS 或书面豁免，第二阶段真 Lens 综合验收有签收。
- [ ] 首批能力边界明示：AisenLens 模板云备份如继续延期，不得宣传为已交付。
- [ ] V4/Pro/用户中心/兑换单次合同和当前代码相符；`README`、`spec`、`architecture`、`Plans` 及其他索引不自相矛盾。
- [ ] 所有者明确批准“第三阶段测试环境部署”的目标、范围、执行人和回滚；这不自动批准正式公开上线。
- [ ] 真云 R2、邮件、域名、跨服务性能、安全恢复、监控、人工注销在测试环境真实完成后另出发布准入报告。

## 六、限制与没有声称完成的工作

- 本轮对全仓 Git 跟踪清单、文档索引、关键源码和 SQL 函数进行了系统扫描，对高风险路径做了针对性代码核查；**不代表人工逐行证明全部 364 文件无缺陷**。历史 2026-10-28/29 浏览器、SQL、S3、Lens PASS 属仓库文本记录，本轮没有重跑。
- 未连接或操作远程 Supabase/Cloudflare，未对真实用户数据执行删除或对业务数据库写入测试。本地迁移核对与 DB lint 均为只读观察。
- 文件删除和旧 RPC 清退**均为整改建议，未实施**。真实云测试仍需项目所有者授权。
- 本轮已证实的当前硬失败是**依赖 frozen install**、**文档失效锚点**；旧 RPC 的存在和可执行授权由已应用的迁移与源码静态确认，实际 JWT 响应/业务效果仍应有独立受控回归证据。

**总体建议**：先用一个受控“上线测试前收口”工作包集中完成 P0 修复与文档真源同步，再做一次干净环境全量门禁和所有者签收，之后才申请第三阶段云端测试。不要为赶进度把本地联调 PASS 直接等同生产可发布。
