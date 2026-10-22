# 计划工作区

本目录只保留**当前 ACTIVE/待办/受阻计划、尚有直接实施价值的设计正文与必要阶段基线**，不长期保留标记 `COMPLETED` 的阶段执行清单和重复验收流水。完成后的长期业务规则归入 spec/architecture/development；未完成事项集中于 [TODO](./TODO.md)。管理要求见下方[完成与删除](#完成与删除)及[总入口](../README.md)。

## 当前待办与唯一实施导航

- [Admin MVP 六项设计收敛与轻量交互方法](./20261022-admin-mvp-six-step-master-plan.md)：第 01～05 项设计合同保留；旧 development/G0B 原型已删除，已选定交互优先的单文件 HTML 方法，但**UI-G0A 尚未签收，正式 MVP 施工未授权**。
- [MVP 实施设计总计划（ACTIVE）](aisencore-mvp/aisencore-mvp-implementation-design-master-plan.md)：阶段依赖、实际开发准入、U03～U11/安全/视觉阻塞；**计划仍未结束**。
- [2026-10-22 审查整改专项总计划（ACTIVE / RUNTIME NOT RUN）](./20261022-review-remediation/master-plan.md)：14 项审查问题和 4 项横切任务的真实实施/验收；DEC-01～06 全 A 已批准但运行整改尚未验收。
- [MVP 当前待办（TODO）](./TODO.md)：真实运行/用户确认/上线前检查；不把已完成的文档型任务长期作为新计划。
- [D1 数据库实施设计](aisencore-mvp/aisencore-mvp-d1-database-implementation-design.md)：PostgreSQL/RLS/GRANT/锁序与 M1～M5，SQL/事务尚未运行。
- [D2 API/Auth/Aisenlens 实施设计](aisencore-mvp/aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)：RPC、JWT、产品边界与 R2 恢复/授权，**未实现**。
- [D3 Admin/环境实施设计](aisencore-mvp/aisencore-mvp-d3-admin-infrastructure-design.md)：React-admin Resource/Provider/环境/密钥/部署与 MFA，**未创建前端/云环境**。
- [D3-UI 页面线框与交互设计](aisencore-mvp/aisencore-mvp-d3-ui-admin-uiux-design.md)：导航、列表/表单、发码/MFA/响应式、D3-UI-X01～X18 全部 NOT RUN。
- [Admin UI-G0 全局视觉规范](../architecture/applications/admin-ui-design-system.md)：**强制编码前关口仍 NOT APPROVED / BLOCKED**；高保真画面与用户签收待完成。
- [Admin 前端设计与规则入口](../development/frontend/README.md)：唯一开发目录内维护视觉基础、共享组件、62 条 UX 原则与后续 UI-G3 审查。
- [交互基准产物目录](../interaction-benchmarks/README.md)：按需存放模拟网页；规范在 development，业务/视觉权威在 architecture；**签收和未解决问题在本 Plans**，不在 HTML 里自动批准。
- [D4 测试与就绪评审](aisencore-mvp/aisencore-mvp-d4-test-and-readiness-review.md)：原 55 项 I/R/A 用例和增量风险，均未真实运行。
- [F01～F04 安全收敛设计](aisencore-mvp/aisencore-f01-f04-security-convergence-design.md)：Design Resolved / Runtime Not Verified。
- [F05～F08 契约与兼容测试准备](aisencore-mvp/aisencore-f05-f08-contract-compatibility-readiness-design.md)：DEC-05 双模式直授/强类型幂等合同，F06/F07 仅剩具体产品/运营参数，F08 V00～V07 未运行。
- [U03～U11 用户确认及待定子项](aisencore-mvp/aisencore-u03-u11-user-decisions-2026-10-22.md)：已确认行为、仍需明确参数和公开运营门槛。
- [Auth/Pro 与 Admin MFA 低请求量设计](aisencore-mvp/aisencore-mvp-auth-entitlement-mfa-efficiency-design.md)：AUTH-P01～P12 待运行。

**清理说明（2026-10-22，更新）**：此前 13 份仅执行阶段任务的独立清单已删；本次继续清理**已完成 D0 详细执行记录、S0/候选/静态闭环一次性工作单、BaaS 外部建议评审和前端迁移流水（6 份）**。D0 U01/U02/公共职责基线、DEC 安全边界、BAAS-Q01～Q10 测试、设计规则来源与失败补偿分别已归入[现行需求](../spec/requirements.md)、[MVP 总计划](aisencore-mvp/aisencore-mvp-implementation-design-master-plan.md)、[整改总计划](./20261022-review-remediation/master-plan.md)、[测试指南](../development/testing/README.md)及[前端规则](../development/frontend/admin-design-rules.md)。未实测或未实施的 D1/D2/D3/D4/F/Auth 专项仍保留可执行设计与验收输入，历史复审文档仅作原始证据，不承担现行业务权威。

## 何时建立计划

小范围修复可在任务说明或审查问题中明确目标、范围和验证方式，不强制新增计划文件。

跨模块修改、重大契约变化或需要多阶段推进的工作使用单文件计划；只有实际需要独立设计正文时才建立任务目录。使用[模板](TEMPLATE.md)，不预建空文件或重复的交接、阶段 prompt 和进度副本。

当前模块归属与维护入口见项目架构，工程与浏览器证据见[测试规范](../development/testing/README.md)。已完成的职责拆分不再作为新任务入口；录制、真实素材和生产等独立待验收范围继续进入 TODO。

### 交互原型的增量决策记录（只在任务涉及原型时使用）

在该任务现有的「决定」和「验证记录」下用简短文字留下：**① 场景/业务合同引用；② 实际原型路径及被审阅的 Git commit/内容版本；③ 认可的跨模块路径、状态/恢复方式；④ 仍未解决的交互或视觉问题；⑤ 交互认可、视觉/Token 认可、正式施工许可三种独立状态；⑥ 关键 P0/P1/P2/P3 验证范围与真实证据**。用户没有明确认可时标 `PENDING/NOT APPROVED`，未运行测试写 `NOT RUN`。示例及测试边界见[复用与验证规范](../development/frontend/prototype-to-production-rules.md)。

**不另外创建签收计划或审批表**，不把同一业务字段、RPC、Theme Token 复制进 Plans，也不以网页「审核完成」按钮产生审批记录。完成后按本文件清理阶段过程计划；仍用于 UI-G0 签收/追溯的原型版本应保持可恢复。

## 内容与执行

用户问题、目标、范围、成熟度与验收条件以[当前需求](../spec/requirements.md)为权威。计划引用需求/条款及本次覆盖的验收编号，记录施工依赖、实现步骤和验证工作；不复制需求全文或另存一套确认状态。需求变化先更新同一正文及受影响引用，未确认子问题不随计划启动自动生效。

计划包含问题依据、范围、关键决定、按行为拆分的步骤与验证方式。步骤可覆盖紧密相关的多个文件，不能为了逐文件打勾破坏一次完整行为变更。

先用失败用例复现行为，再实施最小修复并更新所有调用者。发现方案与当前实现冲突时先更新方案，继续不依赖该决定的工作。
MVP 的 D0～D4 每一阶段先建立自己的具体执行计划，明确用户需决策的内容，再执行；阶段完成后核查 spec、architecture、development、Plans 与总索引之间的相关链接和事实，记录“已更新 / 不需要更新”的依据，不复制需求与架构权威。

状态使用 `DRAFT`、`ACTIVE`、`IN_PROGRESS`、`BLOCKED`、`COMPLETED` 或 `CANCELLED`，说明阻塞原因；状态不替代实际证据。

## 完成与删除

1. 运行受影响的检查，记录退出码、失败、跳过和未验证范围。
2. 同步架构与工程规范中的当前事实。
3. 按问题编号回写对应审查项；一个计划完成不代表整篇报告的全部问题都已解决。
4. 将未完成或另行验收的事项移入 TODO，不将延期写成完成。
5. 删除完成的计划、施工步骤和重复草案；必要复现证据进入所属模块。

不要求永久归档，不要求每次任务通过无关的全平台或真实供应商门禁。具体验收范围以[测试规范](../development/testing/README.md)和任务目标为准。
