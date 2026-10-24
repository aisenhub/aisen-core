# 阶段 D4 执行计划：全链路安全回归、性能基线、MFA 恢复演练与发布准入验收

- **阶段代号**：`PHASE-D4`
- **前置依赖**：`PHASE-D1`、`PHASE-D2`、`PHASE-D3`（及 `PHASE-S1` 如纳入首批发版）全部退出门禁 100% 通过
- **权威依据**：
  - [统一需求 §10, §11, §12](../../spec/requirements.md)
  - [公共 API 契约与 MVP 验收清单（I-01~28, R-01~15, REV-*）](../../architecture/backend/api-contract-and-mvp-acceptance.md)
  - [平台管理员权限与公共账号生命周期（§1.1 单人运营 MFA 恢复控制 A-04）](../../architecture/domains/platform-admin-and-account-lifecycle.md)
  - [技术栈专项架构（§7 环境、迁移与最小变更管理）](../../architecture/infrastructure/tech-stack.md)
  - [过期文档清理提示词](../../prompt/cleanup-outdated-docs.md)

---

## 1. 阶段边界声明（Scope & Hard Boundaries）

### 1.1 准入条件（Entry Gate）
- D1（数据库与 RPC）、D2（Auth、API 与 MFA）、D3（React-admin 管理端）及 S1（如包含）均已在本地隔离环境全部实现并通过各自阶段测试。
- 项目所有者已提供或准备确认生产发布所需的运营参数（自定义 SMTP、域名/回调白名单、主/备 MFA 恢复责任人、人工注销渠道）。

### 1.2 本阶段必须完成的交付范围（In-Scope）
1. **全量 MVP 验收矩阵端到端联调（Master Acceptance Suite）**：
   - 运行统一的端到端验收套件，逐条核验并记录 **I-01 ~ I-28**（28 项身份与成员用例）、**R-01 ~ R-15**（15 项权益与兑换码用例）以及 **REV-DEC01 ~ DEC06 / REV-FREEPRO** 补充场景。
2. **性能、并发与配额消耗基线测量**：
   - 测量核心 RPC（`check_access`, `ensure_membership`, `redeem_code`, `admin_create_codes`, `admin_lookup_users`）在本地与预发环境下的 **P50 / P95 延迟** 与查询计划（`EXPLAIN (ANALYZE, BUFFERS)`）。
   - 验证低请求量原则：统计单次用户登录+产品启动+兑换、以及管理员登录+浏览列表+发码全流程的 Auth / PostgREST / Edge 请求总数，确保无冗余轮询或 N+1 查询。
3. **A-04 单人运营 MFA 设备丢失与恢复实战演练**：
   - 在隔离环境中实测：主管理员注册 2 个独立 TOTP 因子（主设备 + 离线保管的备用设备/因子）；模拟主设备遗失、撤销失控因子、旧会话拒绝、使用备用因子恢复 `aal2` 访问并重新加固的全流程，留存可复核操作步骤与审计日志证据，解除 `BLOCKED` 状态。
4. **数据库备份、迁移回滚与人工账号注销 SOP 演练**：
   - 演练 `pg_dump` / 数据备份、从零恢复、迁移前向修复，以及人工受理用户账号注销；须事先建立 `ON DELETE RESTRICT` 外键、审计合法保留及去标识化清单（在批准的保留/删除政策下先 `admin_block_account` 防止新受保护操作 → 各 SaaS 按归属清理私有数据/R2 → 对 `auth.users` 的 `ON DELETE RESTRICT` 依赖逐表处理、审计或匿名化 → 最后经批准处理 Auth 身份，不能假定已签发 JWT 立即失效）的标准操作程序（Runbook）。
5. **全仓文档一致性治理与发布准入报告**：
   - 执行 `docs/prompt/cleanup-outdated-docs.md` 规范，清理已完成的施工过程草稿，确保 `docs/spec/`、`docs/architecture/`、`docs/development/` 与真实代码 100% 同步，输出最终《AisenCore MVP 发布准入与实测证据报告》。

### 1.3 严禁越界行为（Hard Out-of-Scope）
- **【最高红线】未经项目所有者在当前对话中明确下达“允许连接云端 / 允许推送 GitHub / 允许部署生产”指令，Agent 严禁擅自执行 `git push`、`supabase db push`（针对远程生产库）、`wrangler pages deploy` 或创建任何计费云资源。**
- **严禁**将未在真实生产/预发云环境执行的项（如生产 SMTP 真实收发信、生产 Cloudflare Pages 域名 HTTPS）在本地测试中直接写成生产 `PASS`；必须诚实标注为 `LOCAL PASS / PROD PENDING OWNER AUTH`。

---

## 2. 详细技术设计与实施子任务（Milestones & Tasks）

### Milestone D4-M1：全量验收用例矩阵（I-01~28, R-01~15, REV-*）自动化回归与证据归档

建立 `scripts/acceptance/run-full-mvp-acceptance.mjs`，按模块输出结构化测试报告（含时间戳、Git Commit、数据库版本、每条用例的输入/输出断言与耗时）：

1. **身份与成员组（I-01 ~ I-28）**：重点复核跨产品隔离（I-17）、平台封禁与成员原状态独立（I-18）、最后一名合格管理员并发保底（I-27）、`CheckAccess` 对所有拒绝状态返回 HTTP 200 + `allowed=false/reason` 而对服务故障返回 503（I-28）。
2. **权益与兑换组（R-01 ~ R-15）**：重点复核首响明文唯一性（R-01/R-12）、`left/suspended` 兑换不扣码且不泄露码状态（R-03/REV-DEC01）、单次码双人并发争抢（R-04）、已兑本人返回 `REDEEM_ALREADY_USED`（R-05）、15 分钟 10 次失败限流持久化（R-11）、双设备并发续期正天数 Pro 精确顺延（R-07/R-13）、撤销码不影响已产生 Grant（R-09）、调整 UI 期限预设不影响已发行旧码（R-15）。

---

### Milestone D4-M2：A-04 管理员 MFA 应急恢复演练与人工注销 Runbook 验证

1. **执行 A-04 演练并生成实测记录**：
   - 步骤 1：管理员账号绑定主 TOTP 因子 `Factor-Primary` 与备用独立 TOTP 因子 `Factor-Backup`。
   - 步骤 2：模拟 `Factor-Primary` 遗失或泄露，使用 `Factor-Backup` 完成 `challengeAndVerify` 获得新的 `aal2` 会话，同时执行可审计的受控会话撤权操作。
   - 步骤 3：撤销失控因子后，另外验证既有已签发 `aal2` access token 的真实存活窗口、会话撤权/复核及是否仍可调用敏感 RPC；单纯移除 TOTP 因子不能被视为旧 token 即时失效。
   - 步骤 4：注册新的独立备用因子并验证 `admin_audit_log` / Auth 日志中无任何 TOTP 秘钥明文泄露。
2. **执行人工账号注销演练（I-25）**：
   - 模拟用户提交人工注销请求 → 管理员调用 `admin_block_account` 立即阻断所有产品新操作 → 清理该用户的 AisenLens 私有 R2 备份与配额记录 → 验证历史 `entitlement_grants` / `redemptions` / `admin_audit_log` 按外键与保留策略安全存留或去标识化，不因 `ON DELETE CASCADE` 误删财务/安全审计事实。

---

### Milestone D4-M3：生产部署配置清单核查与全仓文档收尾清理

1. **生成生产环境配置检查单（Pre-Flight Checklist）**：
   - Supabase Cloud 项目配置：`auto_expose_new_tables = false`、`Confirm Email = ON`、TOTP MFA = `ON`、自定义 SMTP 参数、Redirect URLs 白名单、Database Webhooks/Edge Secrets（仅服务端持有）。
   - Cloudflare Pages 构建配置：仅注入 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY`（Publishable Key；仅在有明确兼容需求时使用传统 anon key），构建产物零敏感信息验证。
   - Cloudflare R2 Bucket 配置：私有访问（禁止 Public Bucket）、仅授予 Edge Function 专用最小 S3 Token。
2. **全仓文档同步与过期清理**：
   - 对照 `AGENTS.md` 第 7 条与 `docs/prompt/cleanup-outdated-docs.md`，更新 `README.md`、`docs/spec/requirements.md`、`docs/architecture/` 中的实施状态说明。
   - 校验所有 Markdown 相对链接 100% 有效。

---

### D4 发布范围与真实性

- **首发范围**：若正式宣称“AisenCore + AisenLens 私有配置备份 MVP 完整上线”，S1 必须完成真实 Edge/R2 与产品端恢复验收；若只发布 Core + Admin，需在准入报告中明确 AisenLens/S1 尚未交付，不得声称完整 SaaS MVP 已完成。
- **令牌撤权**：去除 MFA 因子 ≠ 旧 access token 即时失效；紧急失设备场景要分别验证 `aal2` 声明、官方会话撤销能力、敏感 RPC 当前会话校验和 DB 管理员 blocked/active 实时拒绝。
- **注销数据矩阵**：对 `auth.users` 的全部 `ON DELETE RESTRICT` 外键、计费/核销、管理审计、跨 SaaS 数据及 R2 对象制定保留、脱敏、清理、合法期限与操作责任表；在隔离环境演练失败恢复，不直接删除生产数据。
- **分环境验证**：分别记录 `SQL ROLE PASS`、`JWT HTTP PASS`、`BROWSER E2E PASS`、`MOCK STORAGE PASS`、`REAL R2 PASS`、`PROD PASS`；没有执行则 `NOT RUN`。性能记录数据量、硬件与连接数，设定可复核的阈值。

## 3. 阶段 D4 退出门禁清单（Exit Gate Checklist）

- [ ] `I-01` ~ `I-28`（28 项）、`R-01` ~ `R-15`（15 项）及 `REV-DEC01` ~ `DEC06` / `REV-FREEPRO` 全部具备真实运行日志与 PASS 证据。
- [ ] `A-04` 单人运营 MFA 恢复演练在隔离环境完整跑通并留存可复核记录。
- [ ] 核心 RPC 查询计划与 P50/P95 延迟基线记录完毕，以明确的数据规模、实际查询计划、锁等待和性能指标判断；只可报告在规定测试条件下未观察到死锁或异常全表扫描。
- [ ] 全仓文档链接检查通过，无过期冲突计划残留。
- [ ] 向项目所有者提交最终发布准入报告，等待所有者明确签发生产上线授权。


---

## 4. 验证记录（Verification Log）

| 日期 | 命令或场景 | 退出码/结果 | 范围与限制 |
| --- | --- | --- | --- |
| 待执行 | `I-01` ~ `I-28`、`R-01` ~ `R-15` 及全部 `REV-*` 端到端验收回归 | `NOT RUN` | 须在 D1/D2/D3(/S1) 全部准出后执行 |
| 待执行 | `A-04` 单人运营 MFA 设备丢失与双因子受控恢复演练 | `NOT RUN` | 演练通过前生产恢复准入维持 `BLOCKED` |
