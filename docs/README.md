# AisenCore 文档索引

项目文档依职责分为**唯一正式需求、系统架构、实施设计计划、开发规范与参考资料**。当前已开始 MVP **文档实施设计**，不因计划或文档完成自动授权代码开发、数据库执行或部署。

## 需求

- [当前统一需求](./spec/requirements.md)：项目定位、功能范围、已确认要求、非目标及待确认事项；**需求事实唯一权威**。

## 架构

- [架构总索引](./architecture/README.md)：五类架构目录（业务领域、后端、数据、应用、基础设施）及文档职责与维护规则。
- [当前主架构](./architecture/current-main-architecture.md)：系统边界、主要组成、MVP 范围、技术选型概要和分层导航。
- 深入专题直接从[业务领域](./architecture/domains/README.md)、[后端服务](./architecture/backend/README.md)、[数据与持久化](./architecture/database/README.md)、[应用接入](./architecture/applications/README.md)、[基础设施](./architecture/infrastructure/README.md)进入；平台的[Admin 管理前端架构](./architecture/applications/admin-console.md)位于应用层。

## 当前计划、待办与实施设计

- [Plans 工作区与保留/删除规则](./Plans/README.md)：只保留活动计划、实际待办、有效设计正文和必要阶段基线；完成的执行清单及时删除。
- [MVP 总计划（ACTIVE）](Plans/aisencore-mvp/aisencore-mvp-implementation-design-master-plan.md)：整体阶段依赖、实际开发与发布门槛。
- [当前 TODO](./Plans/TODO.md)：尚待确认的产品/运营参数、UI-G0 视觉签收及真实后端、MFA、R2、浏览器测试。
- [D1 数据库设计](Plans/aisencore-mvp/aisencore-mvp-d1-database-implementation-design.md)、[D2 API/Auth/Aisenlens 设计](Plans/aisencore-mvp/aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)、[D3 Admin/环境设计](Plans/aisencore-mvp/aisencore-mvp-d3-admin-infrastructure-design.md)：实施候选而非已运行代码。
- [D3-UI Admin 页面设计](Plans/aisencore-mvp/aisencore-mvp-d3-ui-admin-uiux-design.md)、[UI-G0 全局规范](./architecture/applications/admin-ui-design-system.md)和[六项设计收敛计划](./Plans/20261022-admin-mvp-six-step-master-plan.md)：旧 development 视觉基础/G0B 原型已删除，**轻量交互优先验证方法已选**，但 G0A NOT APPROVED、Token 未冻结，正式 MVP 业务代码与 G3 仍未开始。
- [D4 测试/开发就绪评审](Plans/aisencore-mvp/aisencore-mvp-d4-test-and-readiness-review.md)：逻辑/安全/R2 增量测试设计，全部 NOT RUN。
- [F01～F04 安全收敛](Plans/aisencore-mvp/aisencore-f01-f04-security-convergence-design.md)、[F05～F08 契约及兼容准备](Plans/aisencore-mvp/aisencore-f05-f08-contract-compatibility-readiness-design.md)：仅设计收敛，真实环境验收仍未执行。
- [U03～U11 当前决议](Plans/aisencore-mvp/aisencore-u03-u11-user-decisions-2026-10-22.md)：已确认项与真实待定条件。
- [Auth/Pro/MFA 低请求量设计](Plans/aisencore-mvp/aisencore-mvp-auth-entitlement-mfa-efficiency-design.md)：仍未实测；BAAS-Q01～Q10 已归入[测试指南](./development/testing/README.md)而非保留独立已完评审。

## 开发规范、资料与模板

- [开发总入口](./development/README.md)：开发规范和各主题参考。
- [前端指南](./development/frontend/README.md)：React-admin 前端约束与官方资料。
- [交互验证开发流程](./development/frontend/interaction-benchmark-workflow.md)、[原型制作规则](./development/frontend/interaction-benchmark-spec.md)、[复用与测试边界](./development/frontend/prototype-to-production-rules.md)：独立规范；frontend/README 仅作索引。
- [测试指南](./development/testing/README.md)：测试规范入口。
- [计费/订阅接入资料](./development/billing-subscriptions/README.md)：参考资料、集成指南与模板。

## 交互基准网页（验证产物，不是另一层权威）

- [interaction-benchmarks 原型目录](./interaction-benchmarks/README.md)：按具体任务保存可双击的单文件 HTML 和必要引导；规则在 development，业务/Token 在 architecture，人工认可和未决问题在 Plans。当前没有已批准的 UI-G0A 原型，不自动迁移根目录 `灵感/` 候选演示。

## 文档维护规则

1. **spec/**：唯一当前有效需求文档，不保存旧需求轮次。
2. **architecture/**：主架构 + 五个按职责分类的二级目录；以所属架构文档为详细规则权威，其他文档只摘要并交叉链接。分类不是要求部署多个服务。
3. **Plans/**：尚未实施的设计和阶段计划、执行记录、待用户确认事项与评审门槛；不能代替 spec 或 architecture 的正式决定。每阶段先有详细计划，结束后核查并按需同步所有相关文档。
4. **development/**：独立执行规范、接入指南、技术参考和模板；`frontend/README.md` 只索引，不在 README 里复述完整产物/验收规则。
5. **interaction-benchmarks/**：保存按任务生成的模拟网页，属于**四层文档工作流使用的验证产物，不是第五层权威**；不要在此存长期业务规则、真实凭据或独立审批决定。
6. 区分已经明确的逻辑架构与待实施确认的 HTTP/SQL/邮件/部署参数，不将推荐候选误写为已实施。
7. 持续更新索引和相对链接，不为未来假设创建空专项、不保留迁移日志或旧结构副本。
8. 文档改动**不授权**运行代码、建库、连接 Supabase/R2/Cloudflare/GitHub、提交/推送或部署；需另行明确许可。
