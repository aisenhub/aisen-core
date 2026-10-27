# AisenCore｜当前执行计划索引

> **2026-10-27 状态**：第一阶段开发由项目所有者宣布基本结束，第二阶段 AisenLens 本地对接处于准备中。正式第一阶段签收和未执行的质量门禁仍在 [唯一未完成清单](./TODO.md) 中保持 OPEN；第二阶段真实双端互通为 NOT RUN。旧 D1/D2/D3/S1/D4 是技术工作流，**不是五个交付阶段**。

## 当前阅读与执行顺序

**本次双仓对接施工主控**：[详细总执行计划](./aisenlens-aisencore-local-integration/00-integration-master-plan.md)及其第一/二/三阶段文件；[阶段过渡计划B0～B4](./aisencore-mvp/phase-transition-optimization-plan-2026-10-27.md)保留前期事实/证据与原任务映射，不另行排一套对接步骤。

**规划与审查分开**：[对接目录索引](./aisenlens-aisencore-local-integration/README.md)列出1份总计划、7份详细计划和[源码审查/已确认决定](./aisenlens-aisencore-local-integration/2026-10-27-cross-repository-audit-and-integration-plan.md)；当前只编写文档，实施与真实双端仍NOT RUN。

1. **[唯一未完成任务清单](./TODO.md)** — 所有剩余事项、阶段、优先级和关闭条件，已完成施工流水不再夹杂。
2. **[第二阶段 AisenLens 本地端联调方案](./aisencore-mvp/phase2-aisenlens-local-integration-plan.md)** — 实际 AisenLens 操作数据、两端接口/身份/Pro/兑换/反馈/备份的对齐与验收。
3. [三阶段交付门禁](./aisencore-mvp/three-stage-delivery-gates.md)与[MVP 总计划](./aisencore-mvp/00-mvp-master-plan.md) — 阶段边界和正式签收原则。
4. [Admin UI 剩余验收矩阵](./aisencore-mvp/admin-frontend-ui-production-readiness-audit-and-remediation-plan-2026-10-27.md)、[性能 S1～S6](./aisencore-mvp/admin-performance-phase2-real-load-and-interaction-plan-2026-10-26.md)、[性能优化与基线](./aisencore-mvp/admin-frontend-performance-optimization-plan-2026-10-26.md) — 不因“基本结束”假报 WCAG、真人体验或慢网性能通过。
5. [反馈当前 V3 四队列实施与剩余事项](./aisencore-mvp/feedback-v3-lightweight-implementation.md)、[S1 AisenLens 私有备份专项](./aisencore-mvp/s1-aisenlens-r2-backup.md) — 第二阶段重点业务。
6. [D4 跨端和上线准入](./aisencore-mvp/d4-release-acceptance.md) — 真正云端上线属第三阶段，单独授权。

## 现行规范、需保留的专项验收依据

- 需求唯一真源：[spec](../spec/requirements.md)；长期安全和业务权限：[architecture](../architecture/README.md)；工程纪律：[AGENTS](../../AGENTS.md)。
- 历史技术工作流（记录代码/SQL 的真实测试依据，**不作为当前主任务表**）：[D1 数据库/锁](./aisencore-mvp/d1-database-and-trusted-rpc.md)、[D2 Auth/MFA](./aisencore-mvp/d2-auth-public-api-and-mfa.md)、[D3 Admin](./aisencore-mvp/d3-admin-console.md)、[D3 合同测试矩阵](./aisencore-mvp/d3-acceptance-matrix.md)、[Admin 体验改进依据](./aisencore-mvp/d3-admin-experience-upgrade.md)与[第一阶段整改审查基线](./aisencore-mvp/phase1-delivery-remediation-plan.md)。
- [FB-V2 历史安全/ZIP 记录](./aisencore-mvp/fb-v2-inbox-workbench.md)用于旧 RPC、ZIP 与实际安全证据溯源；**当前反馈可编辑合同已经是 V3**，不要恢复 V2 五态、负责人或管理员公开回复。
- [前端性能审查原始测量](./aisencore-mvp/admin-frontend-performance-review-2026-10-26.md)保留基线，不把早期 NOT RUN 当做当前项目未实现。
- [阶段文档治理审计记录](../development/testing/document-governance-audit-2026-10-27.md)解释已移除过程文件的提炼、删除及验证；历史 Git 版本可回溯。

**当前对接决定**：Core主导、Lens仅WebApp后端相关接线；完整模板20份、待测5MiB、到期取回、确认邮箱单向反馈和有效永久Pro拒兑已确认。AI/去水印/第二项目门槛及支付不在本轮范围，注销渠道上线前确定；细节统一到[需求](../spec/requirements.md)和[双仓审查](./aisenlens-aisencore-local-integration/2026-10-27-cross-repository-audit-and-integration-plan.md)。当前仅文档同步，不表示阶段签收。

## 文档生命周期与权限

计划只跟踪实施依赖和可复测验收，不重复 spec/architecture 的合同。每次功能或验证更新时同步唯一 TODO 和关联文档；已完成施工计划在迁移关键事实、证据索引与未完成项后删除。安全、真实迁移、测试、不可替代截图保留。未获明确授权不提交/推送 Git、不访问生产数据库、不配置上线环境。
