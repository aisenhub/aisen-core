# AisenCore 文档入口

> 只维护当前需求、架构、开发规范与未完成工作。已完成的审查、交接和被推翻的方案通过 Git 历史追溯，不占据正式入口。

## 开发者 / AI 阅读顺序

1. [现行需求](./spec/requirements.md)：唯一当前产品要求。
2. [主架构](./architecture/current-main-architecture.md)和[专题索引](./architecture/README.md)：安全、领域、API、数据库与应用的长期约束。
3. [技术栈](./architecture/infrastructure/tech-stack.md)与[项目目录结构](./architecture/infrastructure/repository-structure.md)：选型、真正的代码归属及按阶段落地的目录蓝图。
4. [MVP 正式开发总计划](./Plans/aisencore-mvp/00-mvp-master-plan.md)、[阶段计划索引](./Plans/README.md)、[当前 D1 实施与证据](./Plans/aisencore-mvp/d1-database-and-trusted-rpc.md)及[未完成 TODO](./Plans/TODO.md)。
5. [开发规范](./development/README.md)、[测试指南](./development/testing/README.md)和[Admin 离线 Demo](./interaction-benchmarks/README.md)。

## 已验证工程状态（2026-10-24）

- 本地 Node 24、pnpm 12、Docker、Supabase CLI 已验证。独立 PostgreSQL 17.11 位于本地端口 `55322`。
- [首份迁移](../supabase/migrations/20261024011528_core_foundation.sql)已在隔离库应用：产品、成员、成员事件、管理员、限制与审计共六张表，均启用 RLS。
- [35 项 pgTAP 检查](../supabase/tests/database/) PASS（结构/GRANT 以及使用合成用户、**模拟 JWT 声明**的行权限）。
- **尚未验收**真实签名 JWT、Supabase Auth / PostgREST 完整服务、管理员 TOTP、可信 RPC、Pro/兑换、R2、正式 React-admin 和生产部署。
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
