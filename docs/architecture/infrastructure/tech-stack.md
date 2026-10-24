# AisenCore 技术栈专项架构

> 状态：以下已确认的是技术选型与架构边界；**本地 Node/pnpm/Docker/Supabase CLI 与 PostgreSQL D1 基线已初始化；正式 Admin、云服务和生产部署尚未完成**。
>
> 适用范围：AisenCore **多 SaaS 公共后端及内部 Admin**。各产品独立的业务前端、业务服务器和业务数据库不因本文而强制采用相同技术。

## 1. 已确定的总体技术选型

| 层级 | 已选择的技术或服务 | 主要职责 | 说明 |
| --- | --- | --- | --- |
| 代码托管与版本管理 | **GitHub + Git** | 源代码、版本记录、未来与部署平台连接 | 已有[仓库目录结构方案](./repository-structure.md)，Admin/workspace 和 CI 等按阶段创建，不等于已经实现 |
| Admin 前端 | **React-admin（Marmelab）** | 首版管理产品、成员、Pro 授权与兑换码；订单/订阅后续接入 | 仅内部少数可信管理员使用，遵循框架默认技术栈 |
| Admin 构建工具 | **Vite** | 前端开发构建与生成静态资源 | 采用 React-admin 官方推荐路线；不是 React-admin 核心强制依赖 |
| Admin 包管理器 | **pnpm（>= 12.0.0）** | Admin 前端依赖安装与脚本执行 | 已选定 pnpm；仅规定最低兼容版本，不锁定 pnpm 精确版本，也不设置版本上限；实际版本须满足 Node.js 及项目依赖的兼容性要求 |
| Admin 网站部署 | **Cloudflare Pages** | 托管 React-admin 静态前端站点 | 已明确选定；域名、仓库连接、环境及自动部署尚未设置 |
| 当前公共后端平台 | **Supabase** | 公共身份、产品级权益和必要公共后端能力 | 未来按用户规模与需要评估可靠迁移或自部署 |
| 公共关系数据库 | **PostgreSQL（由 Supabase 托管）** | 公共结构化数据，例如用户关联、产品、权益和必要的计费状态 | 无需再为公共核心额外采购/选择另一款数据库 |
| 统一身份认证 | **Supabase Auth** | 全平台统一用户身份与会话；各产品权益隔离 | 首版邮箱 + 密码；邮箱确认、找回密码的发信服务正式上线前落实 |
| 可信数据库接口 | **PostgreSQL 受保护 RPC + PostgREST/RLS** | 状态变更与同事务审计、按权限读取列表 | 事务/权限边界见数据库专项 |
| 需秘密的辅助函数 | **Supabase Edge Functions** | 必要 Auth Admin 查询、后续支付 Webhook、R2 签名及 Aisenlens 小型白名单 JSON 可信校验/写入 | TypeScript/Deno；数据库状态/审计仍由受保护 RPC 单事务提交，Edge/R2 跨系统补偿 |
| 对象存储 | **Cloudflare R2** | 云端用户文件、按需的配置备份等文件本体 | 用户与产品访问控制、对象组织方式后续确定 |


**角色区别**：GitHub 存代码；Cloudflare Pages 部署/交付 **Admin 前端**；Supabase 托管 **PostgreSQL 数据库、Auth 与 Edge Functions**；R2 存文件对象。自有兑换码与外部支付订单只提供授权来源，**最终产品级会员权益由公共核心维护**。React-admin 并不等于后端 API 服务器，Pages 不负责替代 PostgreSQL 和可信业务接口。

### 已批准 Aisenlens 小 JSON 备份路线（DEC-02 A；待实施）

项目所有者已批准 **Supabase Edge → Cloudflare R2**：仅由本人主动提交的**小体积、非敏感白名单 JSON 配置备份**进入 Edge，完成 JWT/当前权益/内容 schema/字节数/SHA-256/属主校验、DB 预留和唯一 final 条件创建；ready 确认与 R2 成功不具单事务保障，必须有清理/对账。**通用文件客户端直传边界仍在**，不部署单独 Worker 来处理该类 JSON。实际 R2 SDK 条件写与费用、单对象上限、异常处理须在隔离环境验证；当前尚未实现或创建资源，详见[产品文件架构](../database/product-data-and-files.md)。

## 2. React-admin 前端：完全遵循默认技术栈

| 领域 | 选用技术 | 使用原则 |
| --- | --- | --- |
| 前端框架 | **React** | 使用 React-admin 的 React 组件体系 |
| 开发语言 | **TypeScript / TSX** | 类型化业务页面与组件 |
| Admin 框架 | **React-admin / ra-core** | 资源、列表、增删改查、Data Provider 与 Auth Provider |
| 默认管理 UI | **ra-ui-materialui / Material UI（MUI）** | 使用现成管理组件 |
| 样式与主题 | **Emotion + MUI Theme / sx** | 遵循默认 MUI 样式机制 |
| 路由 | **React Router** | 不重复引入另一套路由系统 |
| 查询与数据缓存 | **TanStack Query** | 复用 React-admin 的查询缓存与刷新机制 |
| 表单 | **React Hook Form** | 复用 React-admin 的表单状态与验证机制 |
| 国际化 | **React-admin 的 i18n 机制** | 按实际界面语言提供词典 |
| 构建与开发 | **Vite（官方推荐方案）** | 与 Cloudflare Pages 的静态站点构建衔接 |

- **不引入平行的完整技术体系**：不另搭一套 Ant Design、Tailwind/shadcn UI、额外路由、表单或重复的全局状态/查询框架。
- 除已确定的 **pnpm >= 12.0.0** 最低版本约束外，React-admin、React、MUI、Vite 等具体依赖版本随实际兼容组合确定，不在当前架构阶段逐个锁定。pnpm 大版本升级仍须检查官方 Node.js 兼容矩阵并运行构建/测试。
- **未确定的可选集成**：[ra-supabase](https://github.com/marmelab/ra-supabase) 是否使用，或者自行编写局部 Data Provider；专用图表、Schema 验证库等只有真实需求出现时才选。
- React-admin 可通过 Data Provider 对接 Supabase 普通数据或可信管理 API，不意味着浏览器能直接执行所有高权限操作。

**身份与成员边界**：Supabase Auth 管理公共用户身份；公共 PostgreSQL 管理产品目录、按需创建的产品成员关系及独立的产品权益。React-admin 复用现有前端管理组件，成员状态变更经受保护 PostgreSQL RPC 鉴权并与审计同事务提交；逻辑 API 在后端专项定义，具体 HTTP 路由与 Schema 仍待实施。管理应用的信息架构与交互见[Admin 管理前端架构](../applications/admin-console.md)，用户领域与 API 入口见[架构总索引](../README.md)。

## 3. Supabase 后端技术组成与职责

| 组成 | 技术 | 主要保存/处理的内容 |
| --- | --- | --- |
| 身份与登录 | Supabase Auth | 全平台统一用户身份；第一版邮箱密码 |
| 数据库引擎 | Supabase 托管 PostgreSQL | 产品目录、用户与产品成员关系、Pro 资格/期限及必要公共业务记录 |
| 数据安全 | PostgreSQL 授权与 RLS（按实际访问设计） | 控制普通用户和不同产品的数据可见、可操作范围 |
| 可信业务变更 | 受保护 PostgreSQL 函数 | 成员、产品、Pro 授权、兑换、管理操作和审计均在单个事务内 |
| 必须保管密钥 | Supabase Edge Functions（TypeScript / Deno） | 必要 Auth Admin 查询/回退、未来支付通知、R2 临时签名与 Aisenlens 小 JSON 可信上传 |
| 对外数据访问 | PostgREST + RLS 读取 / 受保护 RPC 写入 | 已确定读写路径；最终函数签名与兼容版本待实施 |

**数据库 RPC 是公共状态变更与审计的唯一事务载体**。Edge Functions 承担必须保密的 Auth Admin 查询、未来支付核验/回调、R2 短期授权，及已批准的 Aisenlens 小型非敏感 JSON 内容验证/R2 写入；不得通过多个独立 Data API 请求拆分状态与审计。Edge Functions 的运行时是 Supabase Edge Runtime（Deno 兼容，TypeScript 优先），不是把 React-admin 部署在 Edge Functions 上。

**安全底线**：Supabase 的 `service_role` / secret key、R2 长期访问密钥以及支付服务商的机密密钥只留在可信服务端，**不能嵌入 React-admin、网页或本地客户端**。管理员是否有权限必须经可信端判定；RLS 及接口权限不能简单照搬开放式示例。

## 4. Cloudflare Pages、GitHub、Supabase 和 R2 的关系

```text
 GitHub（代码版本管理）
        |
        | Admin 前端源代码（未来接入自动构建/发布）
        v
 Cloudflare Pages
 React-admin + Vite 构建的 Admin 网站
        |
        | 管理员登录 / 数据查询 / 业务操作
        v
 Supabase 公共后端
   +-- Supabase Auth：统一登录、管理员身份基础
   +-- PostgreSQL：公共关系数据与必要计费/权益记录
   +-- PostgREST/RLS：普通和管理员按权限读取
   +-- 受保护 PostgreSQL RPC：状态变更和同事务审计
   +-- Edge Functions：Auth Admin 查询、后续支付与 R2 签名

 普通私有文件客户端 ──► 授权签发 ──► Cloudflare R2（客户端直传）
  Aisenlens 限定配置 JSON ──► 受保护 Supabase Edge ──► R2 final（条件创建）

 独立 SaaS A / B / C
   +-- 可接入同一公共身份、权益和计费能力
   +-- 各自保留独立业务逻辑、存储与部署选择
```

**Cloudflare Pages 是 Admin 网站的托管位置，不意味着各产品网站也必须部署在 Pages。** 连接 GitHub 自动构建和部署是后续配置方向，现阶段没有建立仓库连接、生产站点或发布流水线。

**R2 保存文件本体，PostgreSQL 或相应产品业务库保存文件的属主、产品、对象标识和关联记录。** 私有文件需要按用户和产品授权，不能因为放在 R2 就直接开放访问。Aisenlens **小型非敏感配置 JSON** 经受保护 Edge 校验并由服务器写 R2 final，下载恢复可经短期授权由客户端直取 R2；其他普通私有文件仍按直传设计，视频、AI 结果和用户 AI 密钥仍留在本地。

## 5. 业务范围以领域架构为准

本文只确认技术承载；MVP 业务范围参见[主架构](../current-main-architecture.md)，自有兑换码与支付渠道顺序参见[计费与权益专项](../domains/billing-and-entitlements.md)，本地 Pro 在线校验参见[本地优先专项](../applications/local-first.md)。独立 SaaS 不被强制使用相同的业务数据库或前端框架。

## 6. 不做与待确定

**目前不做**：

- 不因为选定 React-admin 就额外引入一整套前端框架或把它当成业务后端。
- 不在首版建立复杂的企业计费平台、跨产品通用 Pro 套餐或多产品业务大一统数据库。
- 不在首版实现长期离线 Pro 授权，也不强迫本地拉片数据通过公共后端传输。
- 不在当前阶段开发支付宝和 Stripe，不为尚未接入的支付渠道搭建庞大插件平台。
- 不因为确认技术栈而立即初始化项目、购买服务、安装依赖、建库、连接 GitHub、设置域名或实际部署。

**待产品对接或实施时决定**：

- React-admin 的具体兼容版本、`ra-supabase` 与已确定 PostgREST 读路径的适配方式、Admin 页面最终字段与布局（应用层 MVP 逻辑见[Admin 专项](../applications/admin-console.md)），以及敏感操作的最终权限配置。
- Pages 项目、域名、仓库连接、构建设置、分支环境、发布权限与密钥配置。
- 受保护 RPC 的签名、数据库 RLS 逐表 SQL、Edge Functions 中真正需要密钥的辅助接口与管理权限核验。
- 自有兑换码的 UI 批量上限和分发细节、未来支付订单到公共用户/产品的可信关联及回调核验；渠道资质与自动订阅/退款规则。MVP 兑换码与权益逻辑规则已在计费专项定稿。
- 各 SaaS 业务数据库与部署拓扑、R2 Bucket/对象组织及配额计量方式。
- 未来自托管目标、迁移策略和可靠性验收指标。

## 7. 环境、迁移与最小变更管理（实施时执行）

- **环境隔离**：至少有本地/开发环境与生产环境，使用各自独立的 Supabase 项目、回调域名和管理员初始化流程；测试环境不得连接生产数据库或复用生产密钥。
- **迁移版本化**：用 Supabase CLI 创建可复现的 SQL 迁移文件并纳入 Git，按版本应用到开发并验证，再进入生产；禁止以控制台手改作为唯一真实状态。上线前执行数据库备份、明确回滚/前向修复方案并核查迁移权限。
- **Secrets**：数据库 service_role/secret、支付凭据、R2 长期访问密钥仅放在 Supabase Secrets 或 Cloudflare Pages 的服务端环境配置等可信存储；**Cloudflare Pages 静态前端公开构建变量绝不能存放服务端秘密**，浏览器只允许 publishable/anon 配置。
- **安全验证门槛**：在隔离环境使用 Supabase CLI 和 pgTAP 对 GRANT/RLS 进行匿名、本人、他人、管理员、管理员撤销与 aal2 缺失的正反向测试，并补充 RPC 状态转换、并发核销、审计回滚与限流测试；每次策略/权限变更都重新测试。
- **部署流程**：先核对环境差异与迁移，再部署受保护函数和应用，最后用非生产账号检查管理读写、邮箱回调和关键准入；保留失败时停止发布/修复的明确措施。具体 CI 系统与发布命令在代码实施阶段确认，不预建设大型流水线。

## 对应文档

- [当前主架构](../current-main-architecture.md)
- [统一计费与权益专项](../domains/billing-and-entitlements.md)
- [产品业务数据与文件专项](../database/product-data-and-files.md)
- [本地优先专项](../applications/local-first.md)
- [当前统一需求](../../spec/requirements.md)

## 官方参考

- [React-admin](https://marmelab.com/react-admin/)
- [Cloudflare Pages：React 部署文档](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [Supabase：Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase](https://supabase.com/docs)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)