# AisenCore｜当前执行计划索引

> **2026-10-28 状态**：Core×Lens 第二阶段实际本地联合开发已开始，真实 Auth/兑换/反馈与隔离本地对象已有分项 PASS，Admin D3 四队列与导航已分段复测 PASS，其余负例和整体签收仍 OPEN。第一阶段正式签收与独立 WCAG/性能门禁仍未关闭；旧 D1/D2/D3/S1/D4 是技术工作流，**不是五个交付阶段**。

## 当前阅读与执行顺序

**用户中心导航已调整（2026-10-29）**：一级「用户中心」直达 `/users` 的 AAL2 平台管理员专用、真实 Auth 用户列表；一用户一行，可直接进入五分区用户360。单产品筛选显示该产品关联账号；原「成员关系」只在用户详情内用于高级记录管理，不再占据用户导航。服务端分页 RPC 已在本地安装、真实 AAL2 Chrome 的用户目录/分页/作用域/权限拒绝子项 EXIT0；正式生产云端及人工验收仍 OPEN。详见[用户管理专项计划](./aisencore-mvp/2026-10-29-user-management-audit-and-optimization-plan.md)。

**2026-10-29 用户管理专项施工计划（正在执行）**：[用户管理全链路审查与 U01–U10 分批优化](./aisencore-mvp/2026-10-29-user-management-audit-and-optimization-plan.md)。覆盖邮箱身份/用户360/产品成员/Pro/全平台封解禁及管理员权限/审计/故障与无障碍；已施工用户360五分区展开卡、精准跨队列反馈/审计/成员事件深链及产品卡授权上下文；目前已取得Admin Build/Lint PASS，完整真实跨用户/跨产品/反馈非空/异常、CA/GE和人工生产门禁仍OPEN。

**2026-10-28 统一优化总施工计划**：[AisenCore 跨专项优化统筹与逐项实施](./aisencore-mvp/2026-10-28-optimization-execution-program.md)，在唯一 MVP 总计划下排 A～E 依赖；邮箱查找/实体编号复制及部分 Pro 表单已编码、构建通过，真实 AAL2 Chrome 精确邮箱/预选/390px 子项 PASS；**正式信用账本已本地安装并以真实 GoTrue/AAL2 HTTP 完成累计/撤销/永久/并发子项验证；Lens 的新跨端 Chrome/完整 CA/GE 与全站 UI/性能人工签收仍 OPEN**。

**2026-10-28 本轮独立收口施工**：[Core × Lens × Admin 三端计划](./aisenlens-aisencore-local-integration/2026-10-28-stage2-local-closure-execution-plan.md)。本文件记录继续开发/测试/清理/签收证据，不取代唯一 TODO。

**2026-10-28 用户实测 Admin 体验需求（本轮部分已实施）**：[CORE-ADMIN-UI-001｜用户邮箱查找、编号复制与 Pro 授权目标选择](./aisencore-mvp/2026-10-28-admin-user-search-id-copy-and-grant-ux-plan.md)。该原始草案记录管理员反馈、编号语义、安全边界与 CA 验收；本轮已根据新的实施指令修改代码并通过编译/静态检查，但 CA 真实浏览器矩阵仍 OPEN，详见统一施工计划。

**2026-10-28 用户实测权益架构优化（本地正式迁移/受限 RPC/真实 HTTP 已实施）**：[CORE-ENTITLEMENT-001｜Pro 立即入账、统一续期及 Admin 授权交互重构](./aisencore-mvp/2026-10-28-pro-entitlement-immediate-accrual-renewal-admin-ux-plan.md)。涵盖 CORE-ADMIN-UI-002、人工与兑换码统一的有限/永久权益、撤销后连续信用重算、旧 Grant 迁移风险、与 Lens 的权益显示契约及 24 项黄金验收；**本地 SQL 信用账本、固定天数/永久 Admin 表单及受限用户综合权益已编码并迁移；真实 HTTP 累计/撤销/永久/并发 PASS，Lens 真客户端新合同 Chrome 1/1 PASS、合同 8/8 PASS；Stage2/完整 GE、人工 UI 签收仍 OPEN**。

**本次双仓对接施工主控**：[详细总执行计划](./aisenlens-aisencore-local-integration/00-integration-master-plan.md)及其第一/二/三阶段文件；[阶段过渡计划B0～B4](./aisencore-mvp/phase-transition-optimization-plan-2026-10-27.md)保留前期事实/证据与原任务映射，不另行排一套对接步骤。

**规划与审查分开**：[对接目录索引](./aisenlens-aisencore-local-integration/README.md)列出原总计划、详细计划和[源码审查/已确认决定](./aisenlens-aisencore-local-integration/2026-10-27-cross-repository-audit-and-integration-plan.md)；实施与真实本地双端验收按最新专项证据更新，未综合签收不得标整个阶段 PASS。

1. **[唯一未完成任务清单](./TODO.md)** — 所有剩余事项、阶段、优先级和关闭条件，已完成施工流水不再夹杂。
2. **[第二阶段 AisenLens 本地端联调方案](./aisencore-mvp/phase2-aisenlens-local-integration-plan.md)** — 实际 AisenLens 操作数据、两端接口/身份/Pro/兑换/反馈/备份的对齐与验收。
3. [三阶段交付门禁](./aisencore-mvp/three-stage-delivery-gates.md)与[MVP 总计划](./aisencore-mvp/00-mvp-master-plan.md) — 阶段边界和正式签收原则。
4. [Admin UI 剩余验收矩阵](./aisencore-mvp/admin-frontend-ui-production-readiness-audit-and-remediation-plan-2026-10-27.md)、[性能 S1～S6](./aisencore-mvp/admin-performance-phase2-real-load-and-interaction-plan-2026-10-26.md)、[性能优化与基线](./aisencore-mvp/admin-frontend-performance-optimization-plan-2026-10-26.md) — 不因“基本结束”假报 WCAG、真人体验或慢网性能通过。
5. [当前反馈 V4 修复与待验收](./aisencore-mvp/2026-10-29-feedback-admin-ux-bulk-delete-remediation-plan.md)、[反馈 V3 历史实施证据](./aisencore-mvp/feedback-v3-lightweight-implementation.md)、[S1 AisenLens 私有备份专项](./aisencore-mvp/s1-aisenlens-r2-backup.md) — 第二阶段重点业务。
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
