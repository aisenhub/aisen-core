# AisenCore 文档入口

> **最新本地修复（2026-11-02）**：[后端B0～B5计划与证据](./Plans/2026-11-02-backend-audit-remediation.md)记录41项迁移、SQL543/543、Deno20/20及真实JWT/隔离S3回归；[原复核](./reviews/2026-11-02-aisencore-backend-supabase-audit.md)§8为修复前快照。管理员与AisenLens保留，完整上线门禁以TODO为准。

> 只维护当前需求、架构、开发规范与未完成工作。已完成的审查、交接和被推翻的方案通过 Git 历史追溯，不占据正式入口。

## 开发者 / AI 阅读顺序

1. [现行需求](./spec/requirements.md)：唯一当前产品要求。
2. [主架构](./architecture/current-main-architecture.md)和[专题索引](./architecture/README.md)：安全、领域、API、数据库与应用的长期约束。
3. [技术栈](./architecture/infrastructure/tech-stack.md)与[项目目录结构](./architecture/infrastructure/repository-structure.md)：选型、真正的代码归属及按阶段落地的目录蓝图。
4. **[项目所有者确定的三阶段交付与验收门禁](./Plans/aisencore-mvp/three-stage-delivery-gates.md)**、[MVP 正式开发总计划](./Plans/aisencore-mvp/00-mvp-master-plan.md)、[阶段计划索引](./Plans/README.md)、[D1 数据库工作流](./Plans/aisencore-mvp/d1-database-and-trusted-rpc.md)、[D2 Auth 工作流](./Plans/aisencore-mvp/d2-auth-public-api-and-mfa.md)、**[第一阶段必须完成的 D3 Admin 高标准前端计划](./Plans/aisencore-mvp/d3-admin-experience-upgrade.md)**及[未完成 TODO](./Plans/TODO.md)。
5. [开发规范](./development/README.md)、[测试指南](./development/testing/README.md)和[Admin 离线 Demo](./interaction-benchmarks/README.md)。
6. [阶段过渡优化执行计划](./Plans/aisencore-mvp/phase-transition-optimization-plan-2026-10-27.md)、[第二阶段 AisenLens 本地端联调方案](./Plans/aisencore-mvp/phase2-aisenlens-local-integration-plan.md)和[Core 侧实际接口清单](./Plans/aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md)：分批优化与双端对接准备；[文档深审/历史清理记录](./development/testing/document-governance-audit-2026-10-27.md)供历史回溯。

7. **[2026-10-29 上线测试前审查报告](./reviews/2026-10-29-aisencore-prelaunch-closeout-audit.md)**与[收尾详细执行计划](./Plans/2026-10-29-prelaunch-closeout/README.md)：独立记录发现、可复测风险、整改顺序和准出门禁；旧工程状态段落待专项治理复核，不因计划建立而视为更新完成。

## 已验证工程状态（2026-10-24）

- 本地 Node 24、pnpm 12、Docker、Supabase CLI 已验证。独立 PostgreSQL 17.11 位于本地端口 `55322`。
- [基础表](../supabase/migrations/20261024011528_core_foundation.sql)、[Pro/兑换表](../supabase/migrations/20261024025852_entitlements_and_redemption_schema.sql)、[成员/管理 RPC](../supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql)、[兑换/Pro RPC](../supabase/migrations/20261024033040_redemption_and_grant_rpcs.sql) 四份 D1 迁移已在本地空库重新应用（11 张 public 表）；[DEC-06 管理员查询迁移](../supabase/migrations/20261024045105_admin_user_lookup.sql) 已在本地增量应用。
- [001～006 共 286 项 pgTAP](../supabase/tests/database/) PASS（SQL 模拟角色/RLS/RPC/异常回滚）；[LCK-01～07 真实双连接测试](../scripts/test-d1-concurrency.py) 7/7 PASS。[D2 真实 GoTrue/HTTP/TOTP 测试](../scripts/test-d2-auth-api-mfa.mjs) 已在核心本地服务上通过脚本现有场景。
- **当前为已授权的Core×Lens第二阶段本地联合开发，第一阶段正式签收遗留并行推进**。真实Auth/MFA、权益兑换、Lens双图反馈与隔离私有S3及Admin业务回归已有分项证据；第一阶段全模块/WCAG/视觉/性能、完整联合验收及第三阶段云端部署仍开放。当前41项迁移、16组543项SQL验证见[本轮修复计划](./Plans/2026-11-02-backend-audit-remediation.md)，不以旧D1局部数量代表当前基线。
- D3 的 [React-admin 源码](../apps/admin/README.md) 已完成主要资源与高危操作，并已在真实 Chrome GoTrue/AAL2 会话及 Vite 正式构建预览中实测多条正反向业务链路，包含发码 HTTP 429/503 注入、CSV/TXT 明文生命周期；`pnpm typecheck/build/lint`、锁定依赖与构建密钥检查也通过。但这仅是**第一阶段部分证据**，不能代替全模块浏览器功能、WCAG 2.2 AA、前端真实性能/代码拆分质量和所有者视觉签收。
- 停用的旧 Aisenhubplatform 本地 Supabase Docker 资源已清理；旧源码与远程云端项目不在清理范围。

## 唯一权威与更新规则

- **spec/**：现行需求，不维护多轮决定的经过。
- **architecture/**：长期业务、权限与技术合同；明确区分已设计与已实现。
- **Plans/**：只保留活动计划和真实未完成事项；已完成执行清单、旧候选和审核快照删除，Git 历史承担追溯。
- **development/**：复用的工程、测试和 UX 约束；**interaction-benchmarks/**：合成原型，不是另一层业务权威。
- Core 只管理产品成员、Pro 资格/有效期/来源、码和审计；具体 Free/Pro 功能及额度由 SaaS 自己控制。不得恢复已取消的公共 `plans` / 功能版本模型。
- **开发与文档同步是任务完成条件**：需求、接口、数据库、权限、配置、UI 或真实测试改变时，同一任务更新所属权威文档、当前计划/TODO 与受影响的索引；无需修改的须确认现行说明仍准确，不能把旧状态留待未来再修。
- **及时清理直接受影响的过期内容**：已完成计划、被取代的方案、交接过程与重复台账，在转移其中仍有效的规则/测试/待办后及时删除或收敛，避免新旧合同并存；真实测试尚未运行必须明确标记。具体强制规则在项目根目录 [AGENTS.md](../AGENTS.md)。
- **按需专项清理**：文档整体积累矛盾、阶段结束或需要全面复查时使用 [过期文档清理提示词](./prompt/cleanup-outdated-docs.md)，对全仓进行事实和引用核验；这不能替代日常增量维护。Git 历史承担已跟踪旧文件的追溯，不擅自删除未跟踪唯一证据。
