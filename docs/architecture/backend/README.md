# 后端服务架构（backend）

本分类说明**可信业务接口、授权顺序、服务间边界、异常语义及验收**；不把具体 SQL 或客户端界面放在这里做权威定义。

- [公共 API MVP 与独立 SaaS 首次接入](./public-api-and-saas-integration.md)：普通用户和 SaaS 后端的公共 API、首次按需加入、业务授权边界与调用时序。
- [公共 API 契约与 MVP 验收](./api-contract-and-mvp-acceptance.md)：候选请求/响应、标准错误、重试和 26 项验收用例。

数据库执行及权限的细节以 [数据库访问与事务](../database/database-access-and-transactions.md) 为准；成员状态合法流转以 [成员生命周期](../domains/membership-lifecycle.md) 为准。
