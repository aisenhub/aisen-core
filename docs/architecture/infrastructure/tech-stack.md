# AisenCore 技术栈专项架构

> 状态：以下已确认的是技术选型与架构边界；**尚未获准初始化、安装、连接第三方服务或部署**。
>
> 适用范围：AisenCore **多 SaaS 公共后端及内部 Admin**。各产品独立的业务前端、业务服务器和业务数据库不因本文而强制采用相同技术。

## 1. 已确定的总体技术选型

| 层级 | 已选择的技术或服务 | 主要职责 | 说明 |
| --- | --- | --- | --- |
| 代码托管与版本管理 | **GitHub + Git** | 源代码、版本记录、未来与部署平台连接 | 仓库结构、分支与 CI 细则待实施时决定 |
| Admin 前端 | **React-admin（Marmelab）** | 管理平台公共用户、产品、套餐、订单/订阅、权益等 | 仅内部少数可信管理员使用，遵循框架默认技术栈 |
| Admin 构建工具 | **Vite** | 前端开发构建与生成静态资源 | 采用 React-admin 官方推荐路线；不是 React-admin 核心强制依赖 |
| Admin 网站部署 | **Cloudflare Pages** | 托管 React-admin 静态前端站点 | 已明确选定；域名、仓库连接、环境及自动部署尚未设置 |
| 当前公共后端平台 | **Supabase** | 公共身份、产品级权益和必要公共后端能力 | 未来按用户规模与需要评估可靠迁移或自部署 |
| 公共关系数据库 | **PostgreSQL（由 Supabase 托管）** | 公共结构化数据，例如用户关联、产品、权益和必要的计费状态 | 无需再为公共核心额外采购/选择另一款数据库 |
| 统一身份认证 | **Supabase Auth** | 全平台统一用户身份与会话；各产品权益隔离 | 首版邮箱 + 密码；邮箱确认、找回密码的发信服务正式上线前落实 |
| 可信服务端函数 | **Supabase Edge Functions** | 首版优先承接需要服务器保护的公共业务逻辑和 API | Deno 兼容运行时、TypeScript；具体函数及接口仍待设计 |
| 对象存储 | **Cloudflare R2** | 云端用户文件、按需的配置备份等文件本体 | 用户与产品访问控制、对象组织方式后续确定 |
| 会员开通首要入口 | **AisenCore 自有兑换码** | 管理员创建并分发，用户兑换后由公共权益系统开通相应产品会员 | 先于外部支付渠道实施，具体码规则待定 |
| 初期外部支付 | **爱发电（暂定）** | 打赏/支付后凭可靠订单结果同步会员权益 | 用户曾在此前项目简单跑通基本回调，新平台未对接 |
| 后续支付扩展 | **支付宝个体工商户支付 → Stripe** | 以后按主体资质与业务需要接入 | 本阶段不开发，避免提前构建复杂多渠道支付框架 |

**角色区别**：GitHub 存代码；Cloudflare Pages 部署/交付 **Admin 前端**；Supabase 托管 **PostgreSQL 数据库、Auth 与 Edge Functions**；R2 存文件对象。自有兑换码与外部支付订单只提供授权来源，**最终产品级会员权益由公共核心维护**。React-admin 并不等于后端 API 服务器，Pages 不负责替代 PostgreSQL 和可信业务接口。

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
- 依赖和版本随实际使用的 React-admin **兼容发行版本**确定，不预先逐个锁版本。
- **未确定的可选集成**：[ra-supabase](https://github.com/marmelab/ra-supabase) 是否使用，或者自行编写局部 Data Provider；专用图表、Schema 验证库等只有真实需求出现时才选。
- React-admin 可通过 Data Provider 对接 Supabase 普通数据或可信管理 API，不意味着浏览器能直接执行所有高权限操作。

**身份与成员边界**：Supabase Auth 管理公共用户身份；公共 PostgreSQL 管理产品目录、按需创建的产品成员关系及独立的产品权益。React-admin 复用现有前端管理组件，成员状态变更通过可信 Edge Functions 鉴权；逻辑 API 已在后端专项定义，具体 HTTP 路由与 Schema 仍待实施。管理应用的信息架构与交互见[Admin 管理前端架构](../applications/admin-console.md)，用户领域与 API 入口见[架构总索引](../README.md)。

## 3. Supabase 后端技术组成与职责

| 组成 | 技术 | 主要保存/处理的内容 |
| --- | --- | --- |
| 身份与登录 | Supabase Auth | 全平台统一用户身份；第一版邮箱密码 |
| 数据库引擎 | Supabase 托管 PostgreSQL | 产品注册、用户与产品关联、会员套餐及权益、必要公共业务记录 |
| 数据安全 | PostgreSQL 授权与 RLS（按实际访问设计） | 控制普通用户和不同产品的数据可见、可操作范围 |
| 可信服务端 | Supabase Edge Functions（TypeScript / Deno 运行时） | 需要保守机密、校验管理员权限或执行可信业务的服务端入口 |
| 对外数据访问 | Supabase 数据 API 或经 Edge Functions 提供的业务 API | 按适当权限和业务职责调用；接口形态未最终确定 |

**Edge Functions 已选为公共受保护逻辑的优先实现载体**，可能用于支付通知接收、订单与权益同步、敏感 Admin 操作、生成短期 R2 文件访问授权等；这里列的是**适用场景，而非确认已经设计或必须实现的接口清单**。Edge Functions 的运行时是 Supabase Edge Runtime（Deno 兼容，TypeScript 优先），不是把 React-admin 部署在 Edge Functions 上。

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
   +-- Edge Functions：可信管理 API、支付回调、必要业务处理
        |
        | 授权后按产品需要提供文件对象访问能力
        v
 Cloudflare R2：用户文件与可选配置备份

 独立 SaaS A / B / C
   +-- 可接入同一公共身份、权益和计费能力
   +-- 各自保留独立业务逻辑、存储与部署选择
```

**Cloudflare Pages 是 Admin 网站的托管位置，不意味着各产品网站也必须部署在 Pages。** 连接 GitHub 自动构建和部署是后续配置方向，现阶段没有建立仓库连接、生产站点或发布流水线。

**R2 保存文件本体，PostgreSQL 或相应产品业务库保存文件的属主、产品、对象标识和关联记录。** 私有文件需要按用户和产品授权，不能因为放在 R2 就直接开放访问。拉片产品的用户配置备份由客户端在获得受限授权后直接与 R2 传输文件字节，不经 Supabase 中转；视频、AI 结果和用户自己的 AI 密钥仍留在本地。

## 5. 首版业务范围与技术选型边界

- **公共最小核心**：统一账号、产品注册与管理、产品级 Free/Pro 功能开关、数量/使用额度、云端存储/备份配额、权益有效期、**优先建设自有兑换码授权，再分阶段接入订单/订阅支付**，以及必要的内部 Admin。
- **会员开通与支付顺序**：先建设平台**自有兑换码**（React-admin 创建、所有者分发），初期**暂定爱发电**打赏/支付及可靠订单回调；待个体工商户与商户资格具备后再接**支付宝**，更后期再评估 **Stripe**。月付、年付、一次性永久购买和免费试用仍是目标业务模式，不意味着初期渠道必须一次性实现所有自动续费能力。收款地区、各模式实际承载规则及计费事实存储边界待确定。
- **本地 Pro**：启动时在线校验、运行中按产品实际关键操作或适当时机合理复核；首版不做通用桌面离线会员授权，未来有需要再扩展。
- **产品独立性**：不强制各 SaaS 使用 React、Supabase 同一个数据库/Project、Cloudflare Pages 或统一的业务服务器。公共用户与权益有权威归属；每个产品可以选择自身的业务数据库和部署方式。
- **未来迁移**：Supabase 为当前托管选择，未来若迁移自托管环境，优先保证 PostgreSQL 数据、身份、服务端业务逻辑及 R2 文件关联能够可靠迁移；迁移目标与实施细则尚未确定。

## 6. 不做与待确定

**目前不做**：

- 不因为选定 React-admin 就额外引入一整套前端框架或把它当成业务后端。
- 不在首版建立复杂的企业计费平台、跨产品通用 Pro 套餐或多产品业务大一统数据库。
- 不在首版实现长期离线 Pro 授权，也不强迫本地拉片数据通过公共后端传输。
- 不在当前阶段开发支付宝和 Stripe，不为尚未接入的支付渠道搭建庞大插件平台。
- 不因为确认技术栈而立即初始化项目、购买服务、安装依赖、建库、连接 GitHub、设置域名或实际部署。

**待产品对接或实施时决定**：

- React-admin 的具体兼容版本、`ra-supabase` / Data Provider 接入方式、Admin 页面最终字段与布局（应用层 MVP 逻辑见[Admin 专项](../applications/admin-console.md)），以及敏感操作的最终权限配置。
- Pages 项目、域名、仓库连接、构建设置、分支环境、发布权限与密钥配置。
- Edge Functions 的具体接口、权限校验细节、异常处理和必要操作审计。
- 自有兑换码规则、爱发电订单到平台用户/产品的可信关联和回调核验；以后支付宝、Stripe 的商户资质及接入细节；订阅生命周期、免费试用与永久购买权益规则。
- 各 SaaS 业务数据库与部署拓扑、R2 Bucket/对象组织及配额计量方式。
- 未来自托管目标、迁移策略和可靠性验收指标。

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