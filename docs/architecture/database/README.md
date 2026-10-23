# 数据与持久化架构（database）

本分类描述**数据权威、持久化约束、行级隔离、可信事务、审计及对象存储**；逻辑归类不要求各 SaaS 共用同一个数据库。

- [数据库逻辑约束与最小审计](./database-constraints-and-audit.md)：products、product_memberships、membership_events 及当前成员状态权威。
- [数据库访问隔离与可信事务](./database-access-and-transactions.md)：PostgreSQL GRANT/RLS、受保护 RPC、管理读取、并发与审计一致性。
- [受保护 RPC 与事务锁序](./rpc-security-and-locking-contract.md)：F01 的最小权限、F02 L0～L8 的长期不变量及失败回滚、幂等边界。
- [Pro 授权、期限与兑换码约束](./entitlements-and-redemption-constraints.md)：产品级 Pro Grants、固定期限码/批次、核销、哈希、限流与幂等事务；不建公共业务套餐功能版本。
- [产品业务数据与文件](./product-data-and-files.md)：公共/产品数据边界、PostgreSQL 与 Cloudflare R2、文件元数据与生命周期。

业务规则权威参见 [业务领域](../domains/README.md)；对外接口与调用顺序参见 [后端](../backend/README.md)。
