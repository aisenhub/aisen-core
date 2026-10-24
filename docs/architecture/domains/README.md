# 业务领域架构（domains）

本分类定义**平台业务实体和业务规则**，与 API 路由、数据库物理实现和前端框架无关。

- [统一身份、产品及成员领域模型](./identity-and-product-model.md)：公共账号、产品目录、成员与产品权益的职责边界。
- [产品成员生命周期与数据保留](./membership-lifecycle.md)：按需加入、退出、主动重新加入、封禁/原状态恢复、历史授权与删除分离。**成员状态转换的业务规则权威**。
- [平台管理员与账号生命周期](./platform-admin-and-account-lifecycle.md)：平台管理角色、全局禁用与产品级封禁/注销的不同作用域。
- [计费与权益](./billing-and-entitlements.md)：产品级 Pro 资格、兑换码与分阶段支付；SaaS 自己执行具体功能/额度。

跨层实现参见 [后端服务](../backend/README.md)、[数据与持久化](../database/README.md)。
