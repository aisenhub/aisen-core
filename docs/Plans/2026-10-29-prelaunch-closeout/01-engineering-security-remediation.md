# 01｜工程与安全整改执行细则

- **当前状态**：W0/W1/W2/W3 本地实施与分层验证已经发生，具体运行记录及尚欠负例见[2026-10-29 执行证据](./2026-10-29-w0-w3-execution-evidence.md)。本文件后续列出的步骤是准出标准，不是全部均已通过。
- **审查依据**：[报告 P0-01～03、P1-01/02](../../reviews/2026-10-29-aisencore-prelaunch-closeout-audit.md)，[总控](./00-master-closeout-plan.md)，[唯一 TODO](../TODO.md)。
- **权限**：先读取 `AGENTS.md`、当前 spec/architecture、真实源码、迁移和 Git 状态；写库/删对象仅限确认隔离的 QA 资源，云环境一律另批。

## E01｜P0-01 冻结依赖/补丁/构建可重复性

**最新本地验收：CLOSED（2026-10-30）**：`node scripts/test-frozen-clean-install.mjs` 在不含 node_modules 的独立 D 盘临时工作区，真实 offline frozen 安装 168 包、下载 0、pnpm 12.15.0、EXIT0，锁/补丁 SHA-256 未改变且 QA 目录已清理。此前的本机短超时已由新成功实测覆盖；远程 CI、生产尚未批准。详见[实际证据](./2026-10-29-w0-w3-execution-evidence.md)。

**问题**：2026-10-29 实际执行 `pnpm install --offline --frozen-lockfile --ignore-scripts`，得到 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`；审查时 `pnpm-lock.yaml` 的 `query-string@7.1.3` patch hash 与当前补丁不符。现有机器可构建不能证明干净构建。

**检查位置**：`pnpm-workspace.yaml` 的 `patchedDependencies` / `overrides`，`patches/query-string@7.1.3.patch`，`pnpm-lock.yaml` 的 patch hash 和 `react-admin` 解析依赖，`scripts/test-feedback-v4-contract.mjs` 中的运行时 `query-string` 解析断言。

**实施顺序**：
1. 在干净分支冻结 Node/pnpm 精确版本、`git status` 和当前文件 hash；核对 patch 内容是否唯一、是否仍是安全覆盖需要的最小代码改动，**先复现 frozen 安装失败**。
2. 仅为这一个补丁一致性问题按仓库包管理器生成正确 lock；审阅每个 diff，拒绝无关依赖升级和锁文件漂移。
3. 在全新安装状态，先执行 `pnpm install --frozen-lockfile --ignore-scripts`；如果验证离线缓存重放，则仅在已确认包缓存齐备时额外执行 `--offline`；冻结安装后 Git 差异必须为零。
4. 执行 `pnpm typecheck`、`pnpm lint`、`pnpm build`、`node scripts/test-feedback-v4-contract.mjs`、`node scripts/test-d3-bundle-secrets.mjs`；真实 Chrome 对反馈优先级、星标、类别筛选各做 URL 更新/返回/刷新场景，确保不再触发 `decodeComponent is not a function`。
5. 如计划接入 CI，先确定权限和安全边界；使用已有 scripts 建最小本地质量命令清单即可，不预建多套 pipeline。

**拒绝假通过**：不能先以 `pnpm install` 隐式修复锁文件再运行构建而声称 frozen PASS。离线缺缓存与锁文件配置不一致应分别分类。

**关闭条件**：干净安装 EXIT 0、工作树无隐式改动、最小补丁与真实筛选操作 PASS；日志含锁文件提交前后 diff、执行版本、退出码。

## E02｜P0-02 废弃反馈写 RPC 与 V4 单一合同收敛

**旧入口静态证据**：
- `supabase/migrations/20261025131845_feedback_trusted_rpcs.sql` 定义并授予 `public.reply_to_feedback` / `public.admin_update_feedback` 给 `authenticated`；其中有公开回复、旧工单状态迁移。
- `supabase/migrations/20261026060213_feedback_v3_lightweight_workflow.sql` 的 `admin_feedback_v3` 仍有 `trash/restore` 和 `p_tags` 历史分支；V4 新触发器不能替代 API 退场。
- `docs/spec/requirements.md` 现行反馈合同是 V4 三队列、五类别、无公开回复、无软删回收站、自定义 tags 不再编辑。

**先做只读盘点**：列出本地实际已安装函数签名、owner、EXECUTE 权限、调用次数可见证据、其他 public/private SQL 函数及 Edge/Admin/测试/协议调用者。确认哪些仍被 V4 合法链路复用，尤其不得粗暴删除当前 Admin `admin_feedback_v3` 仍用于的 `save/triage/archive/reopen` 逻辑。调查 `reply_to_feedback`、`admin_update_feedback`、`admin_screen_feedback`、`admin_feedback_tags` 和历史 `reply` 及标签路径，分类“废弃可删除 / V4 仍需收敛 / 必须只保留历史数据读取”。

**红测试（先失败）**：
1. 使用真实普通用户 JWT、AAL1 和具备当前有效资格的 AAL2 管理员，对废弃 RPC 进行调用/权限负例，记录实际状态码，不能只看 UI 是否隐藏。
2. 当前合法 V4 正例：队列转换、优先级/星标、备注、五类别筛选、乐观版本 409、产品作用域、审计与 AAL2。
3. 旧动作 `trash/restore`、旧公开回复、旧 tags 修改必须在合同规定的角色/入口中被安全拒绝，且不能通过别名或旧签名恢复。
4. 核对对用户/管理员历史记录读取是否保留必要事实，不将“移除写入口”误变成“删除真实历史数据”。

**整改**：在**新**正向 SQL 迁移中撤销/删除不再批准的公开/内部执行入口，必要时收窄当前受保护 RPC 允许的 action/参数；同步移除不再调用的前端和 Edge 胶水、重写过期测试断言。安全验证保留本人隔离、AAL2 当前资格、产品范围、并发锁、幂等与审计。**不得修改已实际应用的历史迁移当作修复**；不新增旧接口包装、兼容开关。

**关闭条件**：真实 DB catalog 和 JWT HTTP 两层确认废弃可写路径不再可用，V4 正反例及原有核心安全回归 PASS，既有业务数据基线完整，权威 `user-feedback`/API 文档已更新。

## E03｜P0-03 反馈 V4 永久删除可信 E2E

**源路径**：`supabase/functions/feedback-delete/index.ts`、`supabase/migrations/20261029210000_feedback_permanent_delete.sql`、`apps/admin/src/resources/FeedbackPendingDeletes.tsx` / `FeedbackV2.tsx` / `FeedbackV3Editor.tsx`。2026-10-29 **本地迁移安装已记录**，但真实永久删除验收仍 NOT RUN。

**前置**：E02 明确当前写合同；隔离真实 GoTrue/DB/AAL2 管理员、真实 Edge 入口和**本机隔离 S3 替身**就绪；备份与业务基线检查；用 QA 专有反馈 ID、私有对象前缀，**不拿已有真实反馈试删**。

**业务矩阵**：

| 编号 | 场景 | 预期观察与证据 |
| --- | --- | --- |
| VD-01 | 0 图单条永久删除 | 正文/事件/附件被当前受保护事务删除；最小无内容审计存在；重复请求不误操作其他记录 |
| VD-02 | 1 原图 + 1 缩略图 | 对象和 DB 事实全部消失；本人/管理员旧私图访问失效；不泄漏 key |
| VD-03 | 2 原图 + 2 缩略图 | 四对象/附件引用一致清理，ZIP/旧列表不可继续展示已删除事实 |
| VD-04 | 缩略图/原图已 404 | 依据实际对象删除语义决定“已不存在视为完成”与“不可确认失败”的准确分界，防止假成功 |
| VD-05 | 第 1/第 2 个对象删除 503 / 网络中断 | 保留 deletion intent、token、可重试信息；恢复后同号继续完成，绝不误删邻近对象 |
| VD-06 | Edge 与 DB 完成之间连接中断/响应丢失 | 原 token 安全核对，最后 DB 状态可判断；客户端不能将未知结果当成功 |
| VD-07 | 用户/管理员 AAL1、撤管、blocked、在途撤权 | 未授权应拒绝；不发送成功回执，不绕过服务器实时检查 |
| VD-08 | 产品切换、错误 product_id、旧 expected_version、并发 | 受保护事务返回稳定拒绝（含 409）；不越域处理 |
| VD-09 | 1–20 选中反馈批量永久删除，包含一次故障 | 单条结果分别可核实，部分成功不被说成“全成功”；改变选择或产品后原确认失效 |
| VD-10 | 历史 `trashed` 行与待清理恢复入口 | 不自动删除旧行；管理员手动确认目标，待清理面板只显示准确事实 |
| VD-11 | 假成功/假空态/查询 503 | Admin 明确失败或未知、保留可恢复入口；已存在对象不被隐藏为成功 |
| VD-12 | QA 清理与原始数据保护 | 合成用户/反馈/对象精确回收；原有 ID、Grant、反馈和附件清单完整 |

**收敛要点**：对象存储和 PostgreSQL 不能 ACID 合并，优先复用“冻结待删除→对象处理→DB 终结”的既有最小状态机；故障后必须由服务端持久事实恢复，不在浏览器存 R2 凭据。真实 Cloudflare R2 的对象权限、签名、删除与故障注入留到**获授权**第三阶段，不得记 `REAL R2 PASS`。

**关闭条件**：真实 AAL2/Edge/DB/本机私有对象执行记录，包含逐场景状态码、token/SQL 行数/对象键去敏摘要、审计、QA 前后快照和退出码；人工 320/390/768/1440px、键盘/读屏另记。无上述证据时保持 BLOCKED。

## E04｜P1-01 DB lint/权限快照性质核查

**范围**：审查显示 11 个函数触发 lint 警告，主要是 `STABLE`/`VOLATILE` 不匹配或变量未使用。逐条分四类：
1. 实时权限/会话/产品状态依赖：重点 `admin_list_users_core`、`admin_feedback_pending_deletes_core`、`admin_dashboard_metrics_core`、`admin_code_batches_v2_core` / `admin_batch_codes_v2_core`、`admin_feedback_tags_core` 等，检查函数调用链、锁/当前事务、请求内快照的正确性。
2. 权益相关 `admin_get_pro_entitlement_core` / `admin_get_user_pro_entitlements_core` 等，确保撤权后不会依赖错误缓存/快照。
3. `v_anchor`、`v_actor` 等未使用变量，仅确认非必要后移除，不做大规模无收益重构。
4. 真误报：附证据、批准人及无需修改的理由，不为“清零警告”破坏语义。

对需要修改项增加只读/权限/撤权/并发测试，创建合法后续迁移，复跑 `supabase db lint --local`、当前 pgTAP、真实 JWT HTTP、锁并发与基线。目标是无**未分类或影响正确性的**警告，不虚构“必须 0 warning”才能上线。

## E05｜P1-02 最小本地质量验证入口

**目标**：独立于 CI 是否建立，明确在干净 checkout 中可以重放的顺序。推荐命令矩阵：

1. 只读准备：`git status --porcelain`、版本、迁移列表、当前测试依赖/隔离环境。
2. 构建：冻结安装→`pnpm typecheck`→`pnpm lint`→`pnpm build`。
3. 静态安全：按功能跑既有 `scripts/test-*.mjs` 中与本轮变更直接相关的断言、`scripts/test-d3-bundle-secrets.mjs`、文档链接。
4. SQL 规则/并发：在隔离数据库按已有 pgTAP/本地回滚脚本和授权验证运行；成功退出、具体断言数、数据清理都要报告。
5. Edge/浏览器：`deno check` + Edge 真 JWT/本机 S3 + AAL2 Chrome；必须标识哪些是短测、哪些是高风险写入测试。
6. 报告：一条测试记录含 commit/运行环境、数据库迁移版本、用例、实际退出码、失败重试、QA 清理和验证范围；未跑 `NOT RUN`。

仅在测试真实需要时添加脚本/CI 配置，避免构建另一个测试调度框架。任何脚本不得读取生产密钥或重置共享数据。任务阶段状态按 [唯一 TODO](../TODO.md) 更新。
