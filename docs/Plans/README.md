# AisenCore｜当前执行计划索引

此目录保留当前有效的唯一 MVP 总计划、**项目所有者确定的三阶段交付验收总则**、D1/D2/D3/S1/D4 技术工作流计划与 TODO。**交付顺序只有三阶段**：① 对接 AisenLens 本地环境前，使用合成数据达到完整 Admin 功能、性能/分包、无障碍和高标准视觉签收；② AisenLens 本地实际业务数据双端联调与余下业务开发；③ Admin/Supabase/AisenLens 部署后真实环境测试。旧 D1～D4/S1 不是交付阶段。业务规则/安全以 [需求](../spec/requirements.md)、[架构](../architecture/README.md)、[AGENTS](../../AGENTS.md) 为权威；代码和测试证据决定实际进度。

## 唯一正式施工入口

- [MVP 总计划（主控/阶段关系/待决事项）](./aisencore-mvp/00-mvp-master-plan.md)
- **[三阶段交付和验收准则（必须遵守）](./aisencore-mvp/three-stage-delivery-gates.md)** — 第一阶段 Admin 本地独立完整交付并完成性能、视觉/无障碍签收；第二阶段停用合成 fixture 作为联调依据，与 AisenLens 真实本地业务数据双端开发；第三阶段全部线上配置、部署与端到端测试。每阶段需要独立准出和所有者确认。
- **[第一阶段全站交付整改总计划与专项施工单](./aisencore-mvp/phase1-delivery-remediation-plan.md)** — 对审查出的功能/业务操作/表格/性能/代码拆分/WCAG/响应式/八维视觉缺口逐包施工及记录，按 W0～W7 关口复测；目前仅部分基础工程已实施，仍需完整质量验收。
- **[AisenCore Admin 前端 UI 生产级审查与整改计划（2026-10-27）](./aisencore-mvp/admin-frontend-ui-production-readiness-audit-and-remediation-plan-2026-10-27.md)** — 独立前端 UI 审查与验收矩阵：UI-01～14 问题/风险分级、各模块任务、UI-G0～G7 整改工作包、八维视觉/WCAG/异常/响应式和发布门禁；仅建立审查基线，整体 UI 尚未签收。
- **[Admin 前端性能与感知体验专项优化计划（2026-10-26）](./aisencore-mvp/admin-frontend-performance-optimization-plan-2026-10-26.md)** — 按 [全面性能审查](./aisencore-mvp/admin-frontend-performance-review-2026-10-26.md) PERF-01～09 分 O0～O3 实施；O0 基础工程和 O1 感知加载已实施；正式生产预览临时AAL2的29项列表加载场景 PASS，权限 RPC in-flight 去重和标签去重已局部实施；CPU/网络拆分基线已留证。跨产品负例、完整视觉/无障碍、真实负载与 O3 阶段签收尚未完成。
- **[Admin 第二阶段：真实加载与交互性能施工计划](./aisencore-mvp/admin-performance-phase2-real-load-and-interaction-plan-2026-10-26.md)** — 聚焦登录公共 JS 关键路径、标签短时缓存与权限隔离、SPA 非空数据连续交互、查询/精确计数、取消与无障碍完整验收；S2 代码先行，其它阶段仍开放。
- [D1：数据库、Pro、兑换码与可信 RPC](./aisencore-mvp/d1-database-and-trusted-rpc.md) — **D1 本地准出**：四份迁移从零重建成功，001～005 共 **239/239 pgTAP PASS**，双连接 LCK-01～07 全部通过；真实 JWT/HTTP/MFA 由 D2 验收。
- [D2：真实 Auth、公共 API 与 TOTP MFA](./aisencore-mvp/d2-auth-public-api-and-mfa.md) — **旧技术工作流，第一阶段需要收口独立可完成内容**：DEC-06 SQL 查询、[006](../../supabase/tests/database/006_admin_user_lookup.test.sql) 47 项 pgTAP，GoTrue/PostgREST/Mailpit 实际 HTTP、签名 ES256 JWT 与 TOTP `aal2` 测试已 PASS；真实 Mailpit 密码找回、签名恢复 JWT、旧密码失效和新密码登录也已 PASS；D2 完整退出门禁（浏览器回调、失设备恢复、全量错误分支、性能）仍未通过。
- [D3：React-admin（第一阶段交付重点）](./aisencore-mvp/d3-admin-console.md) — 正式 `apps/admin/` Vite/React-admin/TypeScript 已有全资源和主要真实 MFA 浏览器写入回归，仍需**全业务/表格流程、真实前端性能/代码拆分、WCAG 2.2 AA、高品质八维视觉和所有者签收**；不允许把这些任务移交至 AisenLens 本地联调阶段。
- **[FB-V2 最新施工合同：收件箱 → 处理工作台 + AI ZIP 导出](./aisencore-mvp/fb-v2-inbox-workbench.md)** — 2026-10-26 起优先，已在本地增量实施，第一阶段人工和真实 R2 签收未完成。
- **[FB 专项：跨 SaaS 用户反馈详细施工与验收计划](./aisencore-mvp/fb-user-feedback-implementation.md)** — FB-01A/B/C 数据/RPC、FB-02 图片安全与补偿、FB-03 Admin 交互、FB-04 本地 Lens/真实 R2 分阶段验证；当前从第一阶段 01A 启动。
  - [D3 专项：Admin 高标准前端完备化计划](./aisencore-mvp/d3-admin-experience-upgrade.md) — 以合成数据完成完整业务交互、八维视觉/无障碍、响应式/动效、真实 E2E 与最终签收；**部分代码及真实测试已通过，整体尚未签收**。
- [S1：AisenLens 私有备份/Edge/R2](./aisencore-mvp/s1-aisenlens-r2-backup.md) — 第二阶段与 AisenLens 本地实际业务数据共同开发 Core 后端和 Lens 前端；第三阶段验证实际部署端/R2；业务参数待冻结。
- [D4：整体验收与发布准入](./aisencore-mvp/d4-release-acceptance.md) — 前两阶段不得漏测各自本地可验收项目；第三阶段负责云端部署、生产级跨服务验收与单独发布审批。
- [当前唯一 TODO](./TODO.md) · [新任务模板](./TEMPLATE.md) · [Coding Agent 子任务调度](../prompt/mvp-stage-dispatch.md)

## 执行边界和计划生命周期

1. 每次只执行一个可测试的子任务，允许合理并行准备，但敏感接口不得跨过对应安全验收；候选数字/方案不得私自固化为上线合同。
2. 每次真实修改数据库、RPC、API、Admin、备份或部署流程时，在**同一任务**更新权威架构、所属阶段验证记录、唯一 TODO 和相关索引；如实标记 SQL 角色模拟、真实 JWT/HTTP、浏览器、Mock/真实 R2、`NOT RUN` 等独立状态。
3. 计划只负责实现范围、依赖、具体动作、验收和真实进度；不得创造第二套需求/安全合同。已完成阶段应把有效规则、可复现测试和剩余任务迁入权威文件，再清理计划。
4. [全仓过期文档清理提示词](../prompt/cleanup-outdated-docs.md)仅按需调用；日常受影响的文档随开发及时增量清理。Git 提交、云资源和生产发布不是计划自动授予的权限。
