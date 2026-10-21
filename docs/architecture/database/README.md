# 数据与持久化架构（database）

本分类描述**数据权威、持久化约束、行级隔离、可信事务、审计及对象存储**；逻辑归类不要求各 SaaS 共用同一个数据库。

- [数据库逻辑约束与最小审计](./database-constraints-and-audit.md)：products、product_memberships、membership_events 及当前成员状态权威。
- [数据库访问隔离与可信事务](./database-access-and-transactions.md)：PostgreSQL GRANT/RLS、受保护 RPC、管理读取、并发与审计一致性。
- [权益、套餐与兑换码约束](./entitlements-and-redemption-constraints.md)：plans、grants、codes、redemptions、哈希、限流与事务不变量。
- [产品业务数据与文件](./product-data-and-files.md)：公共/产品数据边界、PostgreSQL 与 Cloudflare R2、文件元数据与生命周期。

业务规则权威参见 [业务领域](../domains/README.md)；对外接口与调用顺序参见 [后端](../backend/README.md)。
