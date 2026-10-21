# Aisenhubsass 文档索引

本项目文档分为**一份最新且已确定的需求**、**按领域拆分的明确架构**，以及**按开发主题管理的规范、参考和模板**。不维护历史需求、旧架构方案或修改日志。当前未授权代码开发或服务部署。

## 需求（唯一现行文档）

- [`spec/requirements.md`](./spec/requirements.md) — **Aisenhubsass 当前统一需求**：项目定位、首版范围、统一身份、产品级权益、轻量计费、React-admin、本地拉片、文件/数据库边界、安全、未来迁移、非目标及待确定事项。

## 架构

- [`architecture/current-main-architecture.md`](./architecture/current-main-architecture.md) — **主架构**：总体系统分层、公共能力与产品独立边界、不同 SaaS 模式及专项入口。
- [`architecture/tech-stack.md`](./architecture/tech-stack.md) — **技术栈专项**：React-admin 默认技术栈、GitHub、Cloudflare Pages、Supabase Auth / PostgreSQL / Edge Functions、Cloudflare R2。
- [`architecture/billing-and-entitlements.md`](./architecture/billing-and-entitlements.md) — **计费与权益专项**：统一轻量计费、各产品独立套餐和会员、四类首期权益与在线验证。
- [`architecture/product-data-and-files.md`](./architecture/product-data-and-files.md) — **数据与文件专项**：结构化业务数据、产品隔离、文件元数据、R2 对象及数据安全边界。
- [`architecture/local-first.md`](./architecture/local-first.md) — **本地优先专项**：拉片客户端本地数据、第三方 AI 直连、R2 私有配置备份、在线 Pro 校验。

## 开发指南与参考（development）

- [`development/README.md`](./development/README.md) — **开发指南总入口**：按主题分类，开发规范与参考资料分离，不承载架构决定。
- [`development/frontend/README.md`](./development/frontend/README.md) — React-admin 前端开发基本要求与官方参考。
- [`development/testing/README.md`](./development/testing/README.md) — 测试规范入口、基本质量原则与待选测试工具。
- [`development/billing-subscriptions/README.md`](./development/billing-subscriptions/README.md) — **兑换码与订阅支付专题**；分别维护[参考资料](./development/billing-subscriptions/references.md)、[开发对接指南](./development/billing-subscriptions/integration-guide.md)和[模板资产](./development/billing-subscriptions/templates/README.md)。

## 文档维护规则

1. **`spec/`：需求**。唯一文件 `requirements.md` 仅记录**当前最新、用户已确认的正式需求**；未决定的细节标注待确认，不保留历史轮次或变更日志。
2. **`architecture/`：明确的架构**。一份主架构概述整体，各专项按需要拆分，必要时还可**创建子文件夹组织大型专项**；没有固定专项数量。不把操作教程、第三方参考链接合集写成架构。
3. **`development/`：开发规范、参考和资产**。按前端、测试、订阅等主题分目录；将外部参考/成熟项目链接与具体对接开发指南分文件维护，模板/资产放到主题下的 `templates/` 等目录。
4. **区分已确认和待实施**。参考来源不是已经选用的依赖；未定的接口、SDK、表结构或测试工具不能写成已经批准的开发标准。需求或架构变更时同步更新对应指南。
5. **不保留历史**。所有文档直接维护最新有效内容，更新索引和相对链接，不新增讨论轮次或修改历史。
6. **不自动实施**。技术选型和文档整理不构成安装、初始化、编程、连接 Supabase/R2/Cloudflare/GitHub、建库或部署的授权，实际实施须用户另行明确允许。
