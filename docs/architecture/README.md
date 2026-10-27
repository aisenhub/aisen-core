# AisenCore 架构总索引

架构的总体入口为 [主架构](./current-main-architecture.md)。本文按**架构职责**组织专项：同一业务规则只有一个权威说明位置；跨层的执行细节引用它，不再整篇复制。分类是文档职责，不意味着要部署五套独立系统。

| 二级分类 | 核心问题 | 进入分类 |
| --- | --- | --- |
| **domains/** 业务领域 | 平台有哪些业务概念、生命周期和规则 | [业务领域](./domains/README.md) |
| **backend/** 后端服务 | 公共 API、授权流程、SaaS 服务端调用和错误处理 | [后端服务](./backend/README.md) |
| **database/** 数据与持久化 | 数据归属、PostgreSQL/RLS/事务/审计、R2 文件 | [数据架构](./database/README.md) |
| **applications/** 应用与接入 | 浏览器/桌面 SaaS、React-admin、用户会话与客户端策略 | [应用接入](./applications/README.md) |
| **infrastructure/** 技术与运行平台 | Supabase、Cloudflare、GitHub、技术选型和未来部署 | [基础设施](./infrastructure/README.md) |

## 文档权威关系

- [当前统一需求](../spec/requirements.md)：**需求事实唯一权威**，明确必须做什么及不做什么。
- [主架构](./current-main-architecture.md)：系统整体边界、层次、MVP 范围与专题导航，不堆积详细接口、SQL 或实现规则。
- **domains/**：成员退出、封禁恢复、会员与订单关系等业务规则的首要出处。
- **backend/**：逻辑接口、可信授权、调用时序和 API 行为；需要业务规则时引用 domains。
- **database/**：逻辑表、唯一性/外键、RLS/事务和数据存储归属；需要业务语义时引用 domains。
- **2026-10-23 唯一会员资格边界**：[身份/Pro 与 SaaS 功能职责分离](./domains/membership-qualification-boundary.md)；各 SaaS 的导出、AI、备份额度策略独立，公共后端只管理身份、成员和 Pro 授权/有效期。
- **用户反馈唯一业务合同**：[跨 SaaS 用户反馈系统](./domains/user-feedback.md)；公共 PostgreSQL 保存正文与处理轨迹，R2 保存最多两张私有图片，Admin 统一处理；当前反馈 V3 四队列轻量流程/受保护 ZIP 已本地实现并取得部分真实 AAL2 Chrome 和 462/462 pgTAP 历史 PASS，V2 五态/负责人/公开回复只留历史数据读取；AisenLens 真客户端、真实私有 R2 含图、人工 WCAG/视觉/性能及线上签收仍开放。
- **applications/**：用户和管理员应用交互、本地优先和跨 SaaS 会话；调用 backend 接口。内部平台管理门面参见 [Admin 管理前端架构](./applications/admin-console.md)。
- **infrastructure/**：确认的技术平台和部署承载方式，不把技术选型当作业务规则。
- **development/**（[开发资料](../development/README.md)）：教程、接入指南、测试实践和模板，不承载新的架构决定。
- **交互基准产物**（[interaction-benchmarks](../interaction-benchmarks/README.md)）：按需展示跨模块任务与错误恢复的模拟网页，**不是第六类架构权威，也不作为新增业务状态/RPC/权限来源**；具体模拟范围和展示要求见[前端原型产物规范](../development/frontend/interaction-benchmark-spec.md)。

示例：用户退出产品的业务规则权威在 [成员生命周期](./domains/membership-lifecycle.md)；公共退出 API 在 [公共接口](./backend/public-api-and-saas-integration.md)；状态/审计约束在 [数据库模型](./database/database-constraints-and-audit.md)。其他文档不复制完整规则。

## 维护约束

1. 文件放在回答其**主要架构问题**的分类，而不是简单按所用技术/用户主题堆放；跨层内容保留必要解释和相对链接。
2. 同一决定以一处完整权威定义为准，其他地方保留简要结论和引用。确有独立设计价值才新建文章，暂不创建空文档或第三层目录。
3. 明确区分“已决定的逻辑架构”和“实施前仍需确认”的 HTTP/SQL/RLS、邮件服务、部署配置、数据保留时间等细节。
4. 文档整理**不授权**执行代码开发、数据库变更、第三方服务配置或部署；实际实施需单独授权。
5. 模拟原型如发现字段、权限、RPC、业务不变量不一致，必须回到对应 domains/backend/database/applications 的现有权威文件处理决定，再同步原型；**不能由原型脚本反向修改架构**。视觉 Token 只以 [Admin UI-G0](./applications/admin-ui-design-system.md) 为权威。
