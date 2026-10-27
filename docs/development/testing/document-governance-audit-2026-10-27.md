# AisenCore｜2026-10-27 阶段交接文档深审与清理记录

> 审查性质：只核对本地 AisenCore 仓库及其 Git 跟踪的文档/代码，不包含尚未接入的 AisenLens 仓库、线上数据或第三方云端。审查基点：`main` / `7735052e3b143cdbf50c1b0652110fcddb97ef51`，起始工作树 clean。

## 1. 执行计划与判定标准

1. **全量枚举**：根目录、Admin、`docs/Plans`、需求、架构、开发/测试、交互原型、提示词、测试证据的文档及链接。
2. **证据比对**：以现行所有者决定 + 实际源码/SQL 迁移/测试入口为事实，区分设计、实现、本地真实 PASS、人工验收、线上 NOT RUN。
3. **提炼归一**：业务合同放 `docs/spec`、长期安全/技术合同放 `docs/architecture`、可复用方法放 `docs/development`、仅未完成任务放唯一 `docs/Plans/TODO.md`。
4. **安全删除**：历史过程记录只有在有效原则/遗留问题已迁移或被权威文档覆盖、且 Git 可追溯时才删除；保留迁移、测试、UI 证据及含独有研究的报告。
5. **双重验证**：全量相对链接、已删除文件引用、阶段状态、`git diff --check`、变化清单；所有未执行的运行测试保持 NOT RUN。

## 2. 基线与主要问题

- Git 跟踪文件 **281**；其中 Markdown **74** 份。首轮 Markdown 本地链接 **672** 个，失效目标 **0**（本次工作前的基线）。
- 原 `docs/Plans/TODO.md` 包含 **46 个未勾选**以及 **34 个已勾选**项目，大量历史完成记录与待办混排，且 V1/V2/V3 反馈条款重复。
- 多个早期规范仍写“Admin/MFA 尚未实施”“Pro DDL/可信函数尚未实施”“反馈当前仅 V2 五态”等，与当前 `apps/admin`、`supabase/migrations` 和 V3 四队列代码冲突；必须分别修正，不以旧计划覆盖代码。
- `AGENTS.md`、根 README、阶段总则标记“第一阶段执行中/未签收”。所有者 2026-10-27 宣布**第一阶段基本结束**；审查按“开发基本完成/正在交接准备”和“正式全量签收尚无凭证”两个不同维度记载，不虚报 PASS。
- 本仓库不是 AisenLens 客户端仓库：对接是否具备实际调用、客户端 API 实现与真实 R2 条件仍为 NOT VERIFIED。

## 3. 现行文档归属（不新设平行权威）

| 主类 | 保留的唯一权威及证据 |
| --- | --- |
| 当前需求 | `docs/spec/requirements.md` |
| 长期安全/架构 | `docs/architecture/current-main-architecture.md` 与各领域/数据库/接口专题；`AGENTS.md` 为工程纪律 |
| 阶段与交付门槛 | `docs/Plans/aisencore-mvp/three-stage-delivery-gates.md` 和 `00-mvp-master-plan.md` |
| 未完成工作 | **仅 `docs/Plans/TODO.md`**，不再保留混杂的旧工作已完成流水账 |
| 当前专项 | Admin UI/性能（UI-01～14、S1～S6）、反馈 V3、AisenLens S1 备份；第二阶段本地联调方案 |
| 可重放证据 | `scripts/`、`supabase/tests/`、`docs/Plans/aisencore-mvp/ui-evidence/`、`docs/development/testing/`；不把截图或历史 pgTAP 数值当新验收 |

## 4. 清理保留准则与待复核事项

- 优先剔除**已被代码与后续文档取代**的 2026-10-25 导航五/六入口、UI 布局/文案、操作弹窗一次性施工计划；将必要的安全不变量与未签收项保留在当前 Admin 架构、UI 审查计划和 TODO。它们的 Git 历史保留。
- 早期 FB-V1/FB-V2 五态施工记录若只描述已替换的交互，不能再当 V3 当前合同；**旧数据库字段、读取与权限安全**仍需要迁移与测试保持完整，不删除 SQL。
- D1/D2/D3/D4、前端性能原始审查/基准报告中若包含唯一编号矩阵、性能条件或实测事实，优先保留或进一步拆分，不因文件名较旧机械删除。
- 证据不足时保留并写明 OPEN/待核；任何跨 Repo 一致性、真实含图 R2、完整 WCAG/视觉、生产 P95 等均不得推测为通过。

### 历史工程事实与风险已提炼（清除原施工流水前）

- **导航**：2026-10-25 曾有六入口方案、后续五入口基线，最终于 2026-10-26 按最新决定形成现行「概览 / 用户 / 权益 / 兑换码 / 用户反馈 / 平台管理」六入口。菜单不是授权边界，原资源深链不删除；当前权威以 `docs/architecture/applications/admin-console.md` 和 `apps/admin/src/App.tsx` 为准。历史方案不可成为新的自动化断言。
- **布局与体验**：独立顶栏/浅色导航卡/内容面板，产品范围仅供筛选，响应式优先不覆盖安全操作。2026-10-25 历史浏览器记录：1440px 范围选择器与正文 H1 左边缘同为 x=309px，320/390px 修复横向溢出，运营列表表头约 173–182px、首行约 221–230px；旧 Chrome 业务/异常回归曾 exit 0。**这些是历史测试条件的证据，不承诺当前所有环境、页面仍达到该几何指标**。
- **安全 UI 不变量**：Pro 授权、发码、平台治理和新建产品有上下文弹窗，也保留直接 URL 页面；首次发码明文只可临时显示与导出，确认保存前避免意外退出；UNKNOWN 按原目标与 request ID 查询，禁止未知写入盲重发；产品筛选与高危全平台影响需明确且由 RPC/AAL2 重新授权。风险语义、审计及状态真值已收敛在 Admin/安全架构及真实代码中。
- **人工门禁**：历史 axe 自动严重错误未见报出，但有 incomplete；旧记录中的 70 组响应式回归、本地 TOTP/AAL2 操作 PASS 均不等于 NVDA/VoiceOver、全键盘焦点、200/400% 缩放、真机及所有者八维视觉签收，OPEN 统一收入 `docs/Plans/TODO.md`。
- **反馈历史**：旧 FB-01/02/03 基础数据库/RPC/Edge 施工及 V2 公开回复/五态计划已经被 V3 四队列轻量业务替换；基础权限、幂等、私有 R2 图片校验、服务端审计、DB/R2 不具 ACID 以及图片失败补偿仍有效，已保留在 `docs/architecture/domains/user-feedback.md` 及当前 V3 专项；原 `fb-v2-inbox-workbench.md` 保留 ZIP 真实 HTTP、隔离 S3 与历史安全测试依据。**未删除任何数据库迁移、测试或原始证据。**

### 本轮按 Git 历史保留、从活动目录删除的 7 份过程文档

1. `phase1-admin-content-audit-execution-2026-10-25.md` — 文案/布局一次性施工流水；旧结果提炼至本节，人工门禁迁入 TODO。
2. `phase1-admin-layout-execution-2026-10-25.md` — 一次性布局执行记录，现行 UI 规则已在 Admin/Theme。
3. `phase1-admin-navigation-redesign.md` — 已被后续决定覆盖的旧六入口候选。
4. `phase1-admin-navigation-v2-2026-10-25.md` — 五入口中间方案，最新六入口已经进入正式合同。
5. `phase1-admin-operation-dialogs-2026-10-25.md` — 已完成弹窗施工与历史 Chrome 证据；一次性明文/UNKNOWN 安全合同保留。
6. `phase1-admin-shell-light-surfaces-2026-10-25.md` — 已落实的三分区视觉施工记录；人工视觉门槛保持 OPEN。
7. `fb-user-feedback-implementation.md` — 已由现行 FB-V3 轻量流程取代的旧 FB 施工计划；仍有效的安全/ZIP/对接项已经转入权威架构、V3 专项及 TODO。

以上路径原来均由 Git 跟踪；删除前已检查活动文档对它们的相对 Markdown 链接，外部残留引用 **0**。Git 历史可以查看和恢复内容，本轮不提交/推送 Git。

## 5. 本次执行结果与验证结论

- **全量文档与清理结果**：检查初始 Git 跟踪的 281 文件中所有 74 份 Markdown；删除 7 份过期过程文件、新建 2 份交接/审计文件，当前仓库实际存在 **69 份 Markdown**（含尚未纳入 Git 的 2 份新文档）。修改了 19 个现有文档、删除 7 个 Git 跟踪文档、新建 2 个文档；全部留在本地尚未提交，Git 历史可追溯原版本。
- **链接验证**：逐一检查当前 69 份 Markdown 的 **647 个带文件目标的相对链接**，**0 个目标文件缺失**；待删除 7 份过程文件已无活动文档链接。此检查针对文件目标是否存在，不代表已穷尽每个标题 anchor、GitHub 页面渲染及外部网络链接。
- **格式验证**：`git diff --check` 退出码 **0**；无补丁空格/缩进错误。
- **事实一致性复核**：需求、领域、公共 API、Admin、架构索引均已经把 V3 四队列设为当前可编辑反馈合同，并把旧 V2 五态/负责人/公开回复标为历史读取；Admin/MFA/Pro/RPC 已实现的事实与完整验收缺口分开记载。
- **独立未完成任务**：`docs/Plans/TODO.md` 只维护 OPEN/BLOCKED 项；第二阶段真实联调步骤另存 `docs/Plans/aisencore-mvp/phase2-aisenlens-local-integration-plan.md`。二者不声称 AisenLens 本地端已接入。
- **未在本次执行的验证**：未运行新的数据库/pgTAP、真实 Auth/AAL2 Chrome、R2、性能或 WCAG 测试；本报告引用的成功次数均属历史记录；AisenLens 客户端仓库未接入。本次文档治理**不代表**正式第一阶段签收、第二阶段实测 PASS、云部署、Git commit 或 push。
