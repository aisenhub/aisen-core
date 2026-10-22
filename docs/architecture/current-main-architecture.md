# AisenCore 主架构

> 状态：基于当前[统一需求](../spec/requirements.md)的已确定逻辑架构，**未授权实施**。专项入口见[架构总索引](./README.md)。

## 1. 定位、边界与设计原则

AisenCore 是多个**独立 SaaS 产品**共用的轻量公共底座。原则是**统一必须复用的身份、产品成员、产品级权益与轻量计费；业务数据和业务资源权限留在各 SaaS**。不把所有产品改造成一个统一业务后台，也不为假设需求预建大型通用框架。

公共账号使用同一 Supabase Auth 用户 ID；登录不自动加入全部产品，用户首次合法使用需登录产品能力时才按需创建成员。产品 A 的成员和 Pro 不赋予用户产品 B 的权限；公共管理员也不因此自动访问产品私有内容。产品退出、平台账号禁用、权益到期和数据删除互不等价。上述业务语义以[领域架构](./domains/README.md)为准。

## 2. 系统分层和职责

```text
    React-admin / 独立云端 SaaS / 本地优先与混合客户端
                    │
     Supabase Auth（统一身份与会话）
                    │
    AisenCore PostgREST + RLS（读取）/ PostgreSQL RPC（状态+审计）
      产品/成员管理 · 统一准入 · 权益 · 兑换/计费
                    │
          公共 PostgreSQL（Supabase 托管）
          公共状态 · 关系约束 · 最小审计

  通用文件客户端 ──► 限时授权 ──► Cloudflare R2（字节直传）
  Aisenlens 白名单配置 JSON ──► 受保护 Supabase Edge ──► R2 final（唯一条件写）

  各 SaaS 业务后端和产品业务库独立维护项目、任务、
  产品内角色、业务资源授权和数据生命周期。
```

PostgreSQL 与 R2 是**并列的数据承载**；一般私有文件仍可经授权签发临时凭证后由客户端直传，但**DEC-02 已批准 Aisenlens 受限非敏感小 JSON 配置备份经可信 Edge 校验后写入 R2 的明确例外**。这是**逻辑依赖关系**，不是强制所有客户端经过同一服务器转发业务数据或文件。比如本地拉片的 AI 输入由客户端按用户选择直接交给第三方模型；其本地视频和 AI 结果不经公共平台，Aisenlens 小 JSON 配置备份由 Edge 受保护中转校验并写 R2，恢复下载可短期签名后从 R2 直取。

**R2 已批准方案与实施门禁**：DEC-02 确认由现有 Supabase Edge Functions 承担 Aisenlens 非敏感小 JSON 校验和 R2 final 条件写，不增加未批准的 Cloudflare Worker；服务器按请求 ID/用户/产品保留最小元数据及原子预留，DB/R2 失败由对账者补偿，绝不宣称跨系统原子性。**方案已批准但 Edge/R2/数据库尚未实现或实测**，白名单、大小、版本保留及清理策略见[产品数据/文件长期架构](./database/product-data-and-files.md)。

| 架构分类 | 权威职责 | 详细设计 |
| --- | --- | --- |
| 业务领域 | 统一身份、产品成员生命周期、平台管理员、产品级权益/计费 | [domains/](./domains/README.md) |
| 后端服务 | 公共 API、首次接入、可信授权检查、接口异常与验收 | [backend/](./backend/README.md) |
| 数据与持久化 | PostgreSQL 关系/事务/RLS/审计、业务数据与 R2 边界 | [database/](./database/README.md) |
| 应用与接入 | 多产品 Auth 会话、React-admin 接入、本地优先业务边界 | [applications/](./applications/README.md) |
| 基础设施 | 技术选择、部署承载与迁移边界 | [infrastructure/](./infrastructure/README.md) |

## 3. MVP 公共能力

- **统一身份**：Supabase Auth 邮箱密码；正式开放前落实邮箱确认、找回密码和生产发信能力。统一身份**不保证跨站无感 SSO**。
- **产品与成员**：公共产品目录、按需加入、本人退出/明确重新加入、可信管理员暂停/恢复；当前状态以成员记录为权威，重要变更同事务写最小审计。
- **产品级权益**：各 SaaS 独立 Free / Pro 和功能开关、数量/使用额度、云端存储或备份配额、到期时间；退出不自动暂停期限或取消订阅。
- **轻量计费**：首版实现自有兑换码与统一授权记录；渠道优先级和目标商业模式统一以[权益专项](./domains/billing-and-entitlements.md)为权威。
- **内部 Admin**：使用 React-admin 现成管理资源与组件，最初仅本人或少数可信管理员；首版管理产品、公共用户/成员、权益及自有兑换码，高权限动作由可信服务端再次鉴权；应用层设计见[Admin 管理前端架构](./applications/admin-console.md)。

逻辑 API 和跨 SaaS 接入见[公共 API](./backend/public-api-and-saas-integration.md)，MVP 测试场景见[接口与验收](./backend/api-contract-and-mvp-acceptance.md)。

## 4. 三种 SaaS 接入方式

| 产品方式 | 公共平台介入点 | 业务与安全边界 |
| --- | --- | --- |
| 本地优先 | 首次实际使用需登录能力时，客户端凭本人 JWT 直连公共用户接口；Pro 启动在线校验并在运行中合理复核 | 匿名免费功能不要求联网；视频、项目、AI 结果及用户 AI Key 不默认进入公共服务 |
| 云端业务 | SaaS 可信后端在首次合法受保护服务中以用户 JWT 触发按需加入；后续关键操作重新核验公共准入 | SaaS 后端自己检查项目/文件权限，产品业务库由产品管理 |
| 混合型 | 本地 Free 路径与云端需登录路径分别应用相应规则 | 不自动将全部本地数据上传至公共后端 |

具体本地数据/备份设计参见[本地优先专项](./applications/local-first.md)；产品数据与 R2 参见[数据专项](./database/product-data-and-files.md)。

## 5. 已确认技术选型

| 职责 | 技术 |
| --- | --- |
| 公共用户身份 | Supabase Auth |
| 公共关系数据 | Supabase 托管 PostgreSQL |
| 公共读取与状态变更 | PostgREST + RLS / 受保护 PostgreSQL RPC |
| 仅需密钥的可信服务 | Supabase Edge Functions（Auth Admin、未来支付/R2 授权） |
| 内部 Admin | React-admin 默认 React/TypeScript/MUI 技术体系，以 Vite 构建 |
| Admin 网站 | Cloudflare Pages |
| 对象存储 | Cloudflare R2 |
| 源码与版本 | GitHub / Git |

技术选型不等于这些服务已连接或部署；具体环境、仓库、依赖版本、管理数据适配和可靠迁移见[技术栈与平台边界](./infrastructure/tech-stack.md)。

## 6. MVP 非目标及后续边界

**首版不建设**：第二套 Auth 或 OAuth/无感 SSO 服务、复杂企业组织/RBAC、通用离线 Pro 许可证、跨 SaaS 业务权限总表、每产品强制独立 Supabase 项目、Redis 授权撤权总线、事件溯源/分布式事务平台、复杂多支付插件框架或统一 AI 代理。React-admin 仅承担内部管理应用，不要求所有 SaaS 使用 React。

**仍待按产品及实施前确认**：具体数据库 DDL/RLS 与 RPC 签名、邮箱发送/回调、套餐内容及未来渠道对接参数、数据保留/注销/备份政策、长任务及临时文件凭据撤权时效、项目数据库部署拓扑与发布/迁移验收。MVP 事务机制、兑换默认规则和平台限制范围已在专项定稿。

每项详细决定只在所属分类维护完整内容；主架构保持总体地图。未经用户另行明确授权，不执行安装、开发、建库、平台接入、Git 提交或部署。