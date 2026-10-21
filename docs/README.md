# AisenCore 文档索引

项目文档依职责分为**唯一正式需求、系统架构、开发规范与参考资料**。当前仍为架构阶段，不因文档整理自动授权实施。

## 需求

- [当前统一需求](./spec/requirements.md)：项目定位、功能范围、已确认要求、非目标及待确认事项；**需求事实唯一权威**。

## 架构

- [架构总索引](./architecture/README.md)：五类架构目录（业务领域、后端、数据、应用、基础设施）及文档职责与维护规则。
- [当前主架构](./architecture/current-main-architecture.md)：系统边界、主要组成、MVP 范围、技术选型概要和分层导航。
- 深入专题直接从[业务领域](./architecture/domains/README.md)、[后端服务](./architecture/backend/README.md)、[数据与持久化](./architecture/database/README.md)、[应用接入](./architecture/applications/README.md)、[基础设施](./architecture/infrastructure/README.md)进入；平台的[Admin 管理前端架构](./architecture/applications/admin-console.md)位于应用层。

## 开发规范、资料与模板

- [开发总入口](./development/README.md)：开发规范和各主题参考。
- [前端指南](./development/frontend/README.md)：React-admin 前端约束与官方资料。
- [测试指南](./development/testing/README.md)：测试规范入口。
- [计费/订阅接入资料](./development/billing-subscriptions/README.md)：参考资料、集成指南与模板。

## 文档维护规则

1. **spec/**：唯一当前有效需求文档，不保存旧需求轮次。
2. **architecture/**：主架构 + 五个按职责分类的二级目录；以所属架构文档为详细规则权威，其他文档只摘要并交叉链接。分类不是要求部署多个服务。
3. **development/**：开发规范、接入指南、技术参考和模板，不自行产生未经讨论的架构决定。
4. 区分已经明确的逻辑架构与待实施确认的 HTTP/SQL/邮件/部署参数，不将推荐候选误写为已实施。
5. 持续更新索引和相对链接，不为未来假设创建空专项、不保留迁移日志或旧结构副本。
6. 文档改动**不授权**运行代码、建库、连接 Supabase/R2/Cloudflare/GitHub、提交/推送或部署；需另行明确许可。