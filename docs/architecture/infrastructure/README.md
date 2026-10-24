# 基础设施架构（infrastructure）

本分类说明**已选择的技术平台及其职责**，不意味着已配置或部署。

- [技术栈与平台边界](./tech-stack.md)：Supabase Auth / PostgreSQL / Edge Functions、React-admin、Vite、Cloudflare Pages、R2、GitHub 及分阶段支付渠道。
- [仓库目录结构与代码归属](./repository-structure.md)：参考开源工程后的分阶段目录蓝图，区分已存在、D3 初始化和按需目录；明确根索引、Supabase/SQL/Edge、React-admin 与 SaaS 边界。

独立环境划分、密钥配置、CI/CD、运维监控、备份和迁移策略在实际部署需要出现时再建文档；不提前添加空白专项或复杂运维平台。

业务规则参见 [业务领域](../domains/README.md)，服务接口参见 [后端](../backend/README.md)，数据归属参见 [数据库](../database/README.md)。
