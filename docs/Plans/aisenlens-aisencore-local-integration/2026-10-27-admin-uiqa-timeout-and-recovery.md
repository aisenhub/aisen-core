# Admin 本地 UIQA 超时与测试数据恢复记录（2026-10-27）

**历史事故记录，2026-10-28 状态更新：原 QA 数据残留已恢复清洁，先前的“QA cleanup BLOCKED”不再是当前数据库状态。** 本地只读执行 `python scripts/check-local-admin-qa-cleanliness.py` 返回 `LOCAL_ADMIN_QA_BASELINE_PASS`：原管理员 1、active 原产品 2、QA 用户/Grant/反馈/发码/审计均 0。**这只证明当前清洁基线，不等于 D3 测试通过**；近期独立分段 Admin Chrome `operations-feedback` 仍 FAIL。继续执行须按[2026-10-28 三端收口方案](./2026-10-28-stage2-local-closure-execution-plan.md)严格逐段、每次写库测试前后再检查。

## 事件与可靠证据（以下“未清理/阻塞”为 2026-10-27 当时快照）

- 运行 `node scripts/test-d3-authenticated-pages.mjs` 的真实 Admin Chrome/AAL2 全流程，在外层任务执行时限 **320 秒** 时遭终止。测试没有走到 `finally`，即使若干功能断言已通过，**整套脚本 NOT PASS**。已将依赖被清空的 `demo_atlas`/48 条演示数据和隐藏空表表头的过期断言校正或明确标 N/A；脚本仍较长，应以分阶段可清理运行或足够长的实际测试任务时限复验。
- 终止前真实 Chrome 已打印 PASS：受保护产品创建/启停与审计，成员 active↔suspended、left↔suspended，Admin 授予 30 天 Pro，Grant UNKNOWN 503 与 429 恢复，超 20 条授权分页，发行码首次秘密读取及清除、TXT/CSV 无残留导出、发码 UNKNOWN 原号对账与批次撤销，AAL1 越权拒绝，管理员授予/撤销和旧 JWT 权限拒绝，单码/授权撤销，响应式导航与部分 a11y 基线。**本轮未到测试终态：不能因此认定整套 D3 PASS。**
- 本轮已对 Windows 临时目录中 **15 个具有确定 `aisencore-uiqa-*` 前缀且无仍在运行的 Chrome 进程使用的孤立 QA 浏览器配置目录**完成定向删除，失败 0；不触碰实际用户 Chrome 配置。数据库测试残留仍未清理。
- 超时之后的本地库**只读**快照：3 个 Auth 用户（原管理员 + 1 个 `admin-uiqa-%@aisencore.test` + 1 个 `ordinary-uiqa-%@aisencore.test`），3 个产品（原 `aisenhub`/`aisenlens` + 1 个 `qa_browser_%`）。active Admin 2 个；23 条测试 Grant、2 条代码/批次、1 条成员关系、6 条成员事件、36 条 Admin Audit；非 QA 授权和非 QA 审计均为零，Feedback/Redemption 为零。
- 原管理员 `admin@aisencore.test` 与两正式 active 产品保留。原 PostgreSQL 容器没有重置。确认旧 Node 浏览器测试主进程终止；未发现仍在运行的 D3 测试命令。
- 尝试对**精确匹配**的两条 QA 身份和一个 QA 产品进行先核对再事务清理及 Auth API 删除，但执行工具的安全检查拦截调用，**没有清理任何行**。不能换工具绕过拦截；需要在所有者认可的受控本机管理通道完成一致性的定向清理，不能无差别 `db reset`。

## 已完成的工程预防措施（尚未触发全套 PASS）

- `scripts/test-d3-authenticated-pages.mjs` 在**第一个写操作之前**增加严格的实际数据库前置检查，必须只有一个 Auth 用户、两个 active 正式产品、一个 active Admin、零成员/Grant/发码批次/码/审计。已在当前遗留状态实跑，按预期返回 `LOCAL_QA_BASELINE_DIRTY`，实际 `3|2|3|2|1|23|2|2|36`，未新增测试数据。
- Admin 长测试拆为 `navigation`（现为默认运行模式）、`operations-grants`（临时产品/成员/授权/UNKNOWN/分页）、`operations-issuance`（临时产品/成员、隔离授权依赖、发码/核销秘密保护/高权限治理）、`operations-responsive`（临时产品/成员与 320～1440px 响应式、429/503/AAL1 门禁），另保留显式完整 `operations`/`full` 调试模式。各切片创建随机 QA Admin 并共用严密 `finally`；相互不依赖前次测试产品，`morePages` 作用域已移到共享位置。**上述新拆分通过语法和差异检查，因脏库均 NOT RUN，不称通过。**
- 恢复干净基线后，Windows PowerShell 逐次运行：`$env:AISENCORE_UIQA_PHASE='navigation'; node scripts/test-d3-authenticated-pages.mjs`，再分别用 `operations-grants`、`operations-issuance`、`operations-responsive` 替换。各次必须退出 0、验证清理，然后才可开始下一次。**原 `full`/`operations` 易超时并遗留数据，不用作日常单次验收。**

- 新增 `python scripts/check-local-admin-qa-cleanliness.py` **只读**本地 Docker/SQL 前置核验（内置 55322 容器与正式产品门禁）；实测返回 `LOCAL_ADMIN_QA_BASELINE_DIRTY`，`auth_users=3,active_admins=2,products_total=3,grants=23,code_batches=2,codes=2,admin_audits=36`。脚本未更改任何数据；复原后应返回退出码 0 和 `LOCAL_ADMIN_QA_BASELINE_PASS`。

- 新加内部约 **180 秒软截止**：短切片在接近外层 320 秒执行上限前主动返回到 `finally`，不使 QA 清理受软截止约束。响应式页在空列表上改为核验实际有界查询控件，避免依赖不存在的第 N 条记录。以上属**静态逻辑改进，待恢复干净数据库后做真实超时/清理验证**，不能宣称已证明能阻止所有残留。

## 恢复准入

1. 运行 `python scripts/check-local-admin-qa-cleanliness.py` 并只读确认当前本机 API `127.0.0.1:55321`、DB `127.0.0.1:55322` 与 2 个 active 实际平台；核对 QA 身份生成前缀、随机产品标识及全部关联外键，确认没有新任务与该库并发。
2. 仅针对本次运行生成的**精确 QA ID**，按引用顺序处理审计、核销、授权、兑换码/批次、限流、成员事件/成员、受限记录、临时管理员、临时产品，再用本机 GoTrue Admin API 删除两个 QA Auth 用户；不修改原管理员、不删除两实际平台、不触碰其他数据。事务失败应完整回滚。该步骤目前**未执行**。
3. 删除成功后验证 `auth.users=1`、active `platform_admins=1`、两真实产品 active、其他合成授权/码/成员/审计均为 0，并单独核验本次 Chrome 临时用户目录是否遗留登录状态；勿无差别清除系统临时目录。
4. 恢复成功前，不要运行 D2、D3、F07、Lens Mail 或 Lens Entitlements 等会创建/删除 QA 用户、影响真实本地库的 E2E。可以继续纯代码静态验证和无实际数据库写入的单位测试。

此记录与 [本轮范围和证据](./2026-10-27-stage2-local-scope-and-acceptance.md) 配套；源代码改动及其它项目未提交工作均保留。**不得把阻塞修改成 PASS，直至验证清理。**
