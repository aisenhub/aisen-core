# AisenCore｜阶段过渡与第二阶段联调前优化执行计划（2026-10-27）

> **状态**：执行中，首批 B0 已启动。**任务入口**：[唯一未完成任务清单](../TODO.md)；**阶段门禁**：[三阶段总则](./three-stage-delivery-gates.md)；**联调范围**：[第二阶段本地联调方案](./phase2-aisenlens-local-integration-plan.md)；**审查依据**：[文档治理报告](../../development/testing/document-governance-audit-2026-10-27.md)。本计划只定义工作顺序、验收证据和实施日志，**不复制需求/API 的权威合同**。
>
> **工程基线**：AisenCore `main` / `7735052e`；本次开始工作区已有上一轮文档治理的 **19 份修改、7 份删除、2 份未跟踪文档**。这些改动是现存工作，不得 `git reset/clean` 或覆盖。项目所有者已宣布第一阶段基本结束，但完整 UI/安全/性能及人工签收仍 OPEN；AisenLens 本地代码、真实客户端请求与第三阶段云端未核验。

## 一、优化目标与完成定义

1. **信息准确**：现行需求、公开 RPC、Edge、开发计划和客户端接口清单能映射到同一当前实现；任何已实现、已测、未测和候选决策有明确区分。
2. **进入第二阶段不会误接**：AisenCore 可暴露的真实 public RPC/Edge 名称、参数、认证/授权、稳定拒绝/故障、幂等边界有 Core 侧的可审阅清单；AisenLens 侧全部标记「待核验」，不推测其实现。
3. **前置风险可见**：先关闭或由所有者明确处置 GATE-01、UI-01/02、PERF-01、AUTH-01、DB-01、FB-01；不能为切换阶段把 FAIL/NOT RUN 改为 PASS。
4. **有自动化回归**：文档引用和核心安全行为有最小、可复现的检查入口；实际运行记录包括命令、退出码、数据/环境、负例和未覆盖项。
5. **安全且可回退**：仅本地定界修改；不部署、不推远端、不重置既有数据、不使用真实用户/生产密钥、不扩展产品权限。

**证据等级**：`DESIGNED`（规格或计划）→ `CODED`（文件存在）→ `STATIC PASS`（lint/typecheck/构建）→ `LOCAL PASS`（真实本地 JWT/RPC/Chrome/隔离存储，注明具体层）→ `HUMAN ACCEPTED`（人工签收）→ `DEPLOYED PASS`（单独授权后的第三阶段）。各项独立，不得跨级推定。失败统一标 `FAIL`，未执行标 `NOT RUN`。

## 二、优先级、依赖及分批执行

| 批次 / 对应 TODO | 优先级 | 明确动作（不得提前扩大） | 进入条件与准出证据 | 当前 |
| --- | --- | --- | --- | --- |
| **B0-01 基线保护** | P0 | 记录现有 Git/文档状态、有效权限约束和阶段准入；审查删除后的引用，保留既有变更 | 当前 HEAD、dirty 变更清单，`git diff --check`；无非本次计划的文件丢失 | **静态 PASS** |
| **B0-02 文档质量门禁** | P1 | 增加最小本地 Markdown 相对文件/标题锚点校验工具，修正查实的坏链接，避免后续改名后静默失效 | 可离线执行、输出文件/行/目标、以非零码拒绝坏链接；初始 647 个文件目标基线保留在前轮审计，新增文档后重新统计 | **静态 PASS** |
| **B0-03 Core 对接接口清单 / LENS-02 前置** | P0 | 从 SQL 最新迁移、现行 API 契约及 Edge 实现建立真实 Core 侧联调矩阵（身份、成员、Pro/兑换、反馈、备份）；注明明确缺口 | 每项能定位源码或明言未实现；区分 HTTP 200 的业务拒绝与 401/503；AisenLens 客户端侧仍为 NOT VERIFIED | **Core 静态清单完成；双端 OPEN** |
| **B0-04 文档索引和任务闭环** | P1 | 把优化计划与 Core 接口清单加到现有索引；TODO 只保留 OPEN，记录证据链接不重复重建任务 | Markdown 链接无坏目标、`git diff --check`、计划首批结果可追踪 | **静态 PASS** |
| **B1-01 / AUTH-01、UI-01** | P0/P1 | 先复测本地无依赖测试，再在隔离 Auth/Chrome 环境补齐密码恢复、失因子、管理员撤权/切身份/旧请求竞态 | 真实 Auth+JWT/HTTP + 关键 Chrome 正负例、环境关闭/QA 清理；单人运营 A-04 需人工演练 | 未执行 |
| **B1-02 / UI-01、UI-02、FB-01** | P1 | 完整业务状态/多页/429/503/409/UNKNOWN，反馈 V3 图片/ZIP/导出敏感范围，禁止盲重发或敏感越权 | 适用真实 RPC 负例、截图/断言、隔离对象协议与云 R2 证据分开 | 未执行 |
| **B2-01 / PERF-01、UI-02** | P1 | 在固定硬件/浏览器/限速条件下测登录冷/热、LCP/INP/P75/P95、大数据 100/1000/10000、权限切换与取消；先定位瓶颈后最小修改 | 受控 A/B、身份和请求量正确性、长列表无错页与无旧作用域闪现，人工键盘/读屏/200/400%/真机留证 | 未执行 |
| **B2-02 / DB-01、FB-01** | P1 | 隔离库完整迁移/权限/性能压测，DEC-06 EXPLAIN；反馈缩略图、孤儿对账策略与故障注入 | 只能操作明确标记的可销毁隔离实例；规模/版本/角色/结果齐全；真实 R2 云端留第三阶段 | 未执行 |
| **B3-01 / LENS-01～07** | P0/P1 | 取得 AisenLens 本地仓库与运行事实，双端对齐认证/成员/权益/兑换/反馈/备份，使用实际客户端操作产生的测试数据 | 双端版本、真实网络请求、服务端记录、幂等/越权/断网/撤权负例、所有者第二阶段签收 | **BLOCKED：Lens 侧未核验** |
| **B4-01 / DEPLOY-01～03** | P0 | 仅在第二阶段签收且取得独立云端授权后实施线上配置、私有 R2、恢复/监控/回滚及部署验收 | 另行书面上线许可、生产隔离、全链路真实证据 | **BLOCKED：无部署许可** |

**顺序**：B0-01 → B0-02/B0-03（互不依赖）→ B0-04；随后 B1（先正确性/身份）、B2（真实测量后优化）、B3（AisenLens 仓库已核验且 GATE-01 处理）、B4（额外独立授权）。P0 权限/数据隔离问题随发现立即阻断联调，不允许用美观或性能工作掩盖安全缺陷。

## 三、首批 B0 逐步施工单（本轮启动）

### B0-01｜冻结观察状态，绝不重置

- 读取 `AGENTS.md`、当前 TODO、三阶段门禁、现行 API 与迁移；检查 `git status --short`。
- 仅在既有项目文件基础上增量施工；对不同人的更改不做清理、`checkout`、`reset`、`clean`。
- **通过条件**：能列出此次新增与原有变更；`git diff --check` 为 0。

### B0-02｜小型可运行的文档引用守卫

- 单文件 `scripts/check-doc-links.mjs`，Node 标准库，读取真实存在的 Markdown（含未跟踪的文档）；仅本地 Markdown 相对文件和标准标题锚点，不联网。
- 输出明确源路径与行号；支持同文件 `#标题`，对 URL 编码、重复标题与常用中文 GitHub 标题 slug 作一致性核验；忽略 HTTP、mailto 及代码块中的示例。
- **回归**：真实项目无失效引用；人为制造的临时 fixture（不污染仓库）能让检查退出非零；仍需人工审阅渲染差异，不宣称检查所有 GitHub 解析规则。

### B0-03｜编制 Core 端最小接口矩阵

- 对照 `supabase/migrations` 内 public RPC 最新定义、`supabase/functions/*/index.ts`、`docs/architecture/backend/api-contract-and-mvp-acceptance.md`，记录实际入口/调用方/风险。
- **必须单列**：`check_access` HTTP 200 业务拒绝；`redeem_code(product_key, code)` HTTP 200 `ok=false`；AAL2 管理写不能由客户端直接使用；配置备份 Edge 若不存在明确写「未实现」。
- 不把抽象的 `CheckAccess` 产品术语混成实际 public 函数名，不把反馈私图和 AisenLens 设置备份混成一条链。
- 输出 `docs/Plans/aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md`；在 Lens 端代码未读到之前，所有双端验证为 `NOT RUN`。

### B0-04｜形成证据与交接

- `node scripts/check-doc-links.mjs`、`git diff --check`，可安全运行的现有本地静态或纯 Node 测试（不启动可能污染数据的服务）。
- 在本计划「执行日志」如实填写 PASS/FAIL/NOT RUN；仅标识 B0 子任务，保留 GATE-01/LENS-01～07 的 OPEN/BLOCKED。
- 不提交、不推送；后续批次的真实浏览器/数据库/云端门禁仍按真实执行才签收。

## 四、验证矩阵（每一批都要写清）

| 层级 | 检查 | PASS 证据 | 禁止的误报 |
| --- | --- | --- | --- |
| 文档静态 | 本地链接、标题锚点、引用旧文件、唯一任务入口、`git diff --check` | 命令+退出码+样本数量 | 目标文件存在 ≠ 标题锚点有效 |
| 工程静态 | `pnpm typecheck`、`pnpm lint`、`pnpm build`、受控源码安全扫描 | 实际运行并记录命令与退出码 | Build PASS ≠ E2E/安全/视觉 |
| 本地身份/API | JWT 签名/AAL1/AAL2、授权撤回、跨产品、401/403/409/429/503/UNKNOWN | 隔离真实 HTTP 与日志、清理证明 | SQL 模拟 ≠ 真实会话 |
| 业务 UI | 实际浏览器操作、非空多页、权限/异常/未知写入和安全导出 | 版本、路径、截图、脚本输出 | Demo DOM 或 axe 零违规 ≠ 人工 WCAG |
| 联调与云端 | AisenLens 真客户端与部署后的隔离/生产服务 | 两端请求日志、最终用户流、责任人签收 | Core 单端 PASS ≠ Lens 双端 PASS；隔离 S3 ≠ R2 |

## 五、风险与回退

- **既有脏工作区**：此前 28 份文档变更必须保留。若某项工程修改失败，逐文件恢复本次修改，不重置整个 Git 工作区。
- **安全边界**：Core JWT/RLS/RPC 权限为最终权威；前端只改善体验，不引入浏览器 service_role、全量用户枚举、直接 R2 长期密钥、重复请求导致的危险写入。
- **真实测试数据**：不得使用生产数据或隐式启动 Docker/Supabase 的非隔离服务；无法确认隔离性时该项状态为 `NOT RUN` 并记录原因。
- **业务与上线决定**：U09/U10/U11（备份 JSON 白名单/上限/离线 Pro）、人工验收/生产域名等仍待项目所有者确定；不能擅自固化候选数字。

## 六、实施日志（按本轮真实执行更新）

| 批次 | 已完成事实 | 检查/退出码 | 尚未覆盖 |
| --- | --- | --- | --- |
| B0-01 | 已读取现行文档与核心 API/迁移并确认上轮 dirty 工作区；无恢复/清理命令 | 具体最终检验在 B0-04 记录 | 未接入 AisenLens 端 |
| B0-02 | 创建 `scripts/check-doc-links.mjs`，首次发现并修正 1 处权益模型标题锚点；增加中文/重复标题正例与坏文件/坏锚点负例临时夹具 | `node scripts/check-doc-links.mjs`：71 份文档、678 处文件链接、12 处锚点、0 错误；临时夹具先退出 1（按预期）再退出 0，PASS | HTTP 外部链接、Reference 风格、GitHub 真实渲染未测 |
| B0-03 | 已生成 [Core 对接接口/缺口清单](./phase2-core-integration-contract-inventory-2026-10-27.md)；校验 `check_access` 只返回资格/拒绝，不返回功能/额度、两参 `redeem_code`、V3 反馈 Edge 与专用备份缺口；同步修正现行 API 接入文档 | SQL/Edge 源码静态只读核验，`CODED` 而非运行 PASS | Lens 客户端、JWT HTTP、真实 R2 与双端全部 NOT RUN |
| B0-04 | 已更新阶段索引、唯一 TODO 和第二阶段联调入口，保留 GATE-01/LENS-01～07 OPEN；本轮 `test-admin-date-display`、`test-admin-auth-inflight-race`、`test-d3-source-boundaries`、`pnpm lint`、`pnpm build`、`test-d3-phase1-foundation`、`test-d3-bundle-secrets` 均 PASS | `node scripts/check-doc-links.mjs`：71 份文档 / 678 个文件链接 / 12 锚点 / 0 失败；`git diff --check` 退出 0；正式 Vite 构建退出 0（2378 模块） | AisenLens 客户端、真实 JWT HTTP、DB、R2、浏览器 E2E、完整 WCAG/人工视觉未运行；B1～B4 尚未施工 |
