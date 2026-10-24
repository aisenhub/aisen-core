# AisenCore｜当前执行计划索引

此目录只保留当前有效的 MVP 总计划、五份阶段计划、真实 TODO 与必要模板。业务规则/安全与技术规范分别以 [需求](../spec/requirements.md)、[架构](../architecture/README.md)、[AGENTS](../../AGENTS.md) 为权威；代码与真实测试结果决定当前进度。

## 唯一正式施工入口

- [MVP 总计划（主控/阶段关系/待决事项）](./aisencore-mvp/00-mvp-master-plan.md)
- [D1：数据库、Pro、兑换码与可信 RPC](./aisencore-mvp/d1-database-and-trusted-rpc.md) — **当前阶段**：首迁移六表、35 项本地 pgTAP 已通过，新增可信 RPC 与 LCK 测试尚未实现。
- [D2：真实 Auth、公共 API 与 TOTP MFA](./aisencore-mvp/d2-auth-public-api-and-mfa.md) — 可预先准备本地服务；真实 JWT/HTTP 验证尚未通过。
- [D3：React-admin](./aisencore-mvp/d3-admin-console.md) — 仅以 `apps/admin/` 为正式工程；前端代码与浏览器 E2E 尚未实现。
- [S1：AisenLens 私有备份/Edge/R2](./aisencore-mvp/s1-aisenlens-r2-backup.md) — 产品业务参数未冻结；AisenLens 客户端留在独立仓库。
- [D4：整体验收与发布准入](./aisencore-mvp/d4-release-acceptance.md) — 正式发布范围需要单独批准。
- [当前唯一 TODO](./TODO.md) · [新任务模板](./TEMPLATE.md) · [Coding Agent 子任务调度](../prompt/mvp-stage-dispatch.md)

## 执行边界和计划生命周期

1. 每次只执行一个可测试的子任务，允许合理并行准备，但敏感接口不得跨过对应安全验收；候选数字/方案不得私自固化为上线合同。
2. 每次真实修改数据库、RPC、API、Admin、备份或部署流程时，在**同一任务**更新权威架构、所属阶段验证记录、唯一 TODO 和相关索引；如实标记 SQL 角色模拟、真实 JWT/HTTP、浏览器、Mock/真实 R2、`NOT RUN` 等独立状态。
3. 计划只负责实现范围、依赖、具体动作、验收和真实进度；不得创造第二套需求/安全合同。已完成阶段应把有效规则、可复现测试和剩余任务迁入权威文件，再清理计划。
4. [全仓过期文档清理提示词](../prompt/cleanup-outdated-docs.md)仅按需调用；日常受影响的文档随开发及时增量清理。Git 提交、云资源和生产发布不是计划自动授予的权限。
