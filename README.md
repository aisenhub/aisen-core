# AisenCore

**A lightweight shared backend for independent SaaS products.**

AisenCore（Aisen 公共核心服务）为多个彼此独立的 SaaS 产品统一提供必要的账号身份、产品目录和成员关系、产品级会员权益、兑换码与轻量计费，以及内部 Admin 管理入口。各 SaaS 仍自行管理项目、任务、业务权限与业务数据。

## 开发分为三个交付阶段

项目目前处于**第一阶段：对接 AisenLens 本地开发环境之前的完整交付**。使用隔离 Supabase 和合成测试数据，必须完成 Admin **所有模块的业务操作、表格、流程、异常状态、全站无障碍和高标准八维视觉验收**，并优先完成前端性能、路由/依赖拆包和代码质量；达到可交付标准、经项目所有者签收后才能进入下一阶段。已通过的局部测试不等于第一阶段签收。

**第二阶段**才与 AisenLens 本地开发环境联调，改用 AisenLens 客户端**真实操作产生的本地业务数据**而非合成 demo 作为验收依据，**同步完善 AisenCore 后端及 AisenLens 前端**，测试跨模块/端的 Auth、成员、Pro、兑换、备份等通信及故障恢复；第二阶段全部通过后进入部署测试。

**第三阶段**才配置和部署 Admin、Supabase 和 AisenLens 的线上环境，在真实部署端测试所有功能、跨服务通信、性能、安全、邮件、私有存储与备份恢复。部署、推送与正式上线仍须项目所有者**单独明确授权**。

完整任务边界与逐阶段签收标准见 **[三阶段开发与交付验收总则](./docs/Plans/aisencore-mvp/three-stage-delivery-gates.md)**、[MVP 总计划](./docs/Plans/aisencore-mvp/00-mvp-master-plan.md)和[TODO](./docs/Plans/TODO.md)。原 D1/D2/D3/S1/D4 是技术工作流编号，不代表新的交付阶段数量。

## 快速开始：本地开发与体验

有两种体验方式，请按目的选择。

### 方式一：直接体验交互原型（无需安装）

打开 [Admin MVP 交互预览](./docs/interaction-benchmarks/aisencore-mvp-interaction-lab.html)，在 GitHub 页面选择 **Raw / Download raw file** 保存 HTML，然后使用 Chrome 或 Edge 打开。可操作产品管理、成员、Pro 授权、兑换码及异常恢复等模拟流程。**这是纯前端模拟数据体验，不连接数据库，也不能使用真实账号。** [详细体验说明](./docs/interaction-benchmarks/README.md)。

### 方式二：运行真实 React-admin 开发客户端（需本地 Supabase）

当前正式客户端位于 [`apps/admin/`](./apps/admin/README.md)，使用 React + Vite + React-admin + Supabase Auth。开发环境已在 Windows / PowerShell 及 Docker Desktop 上测试，建议准备 Node.js 24、pnpm 12、Docker Desktop（Linux/macOS 可换用等效命令）。

1. 克隆仓库并安装依赖（已在仓库根目录则直接执行 `pnpm install`）：

   ```powershell
   git clone https://github.com/aisenhub/aisen-core.git
   cd aisen-core
   pnpm install --frozen-lockfile
   ```

2. 启动本项目隔离的最小 Supabase 开发服务（Auth / PostgREST / 网关 / Mailpit / PostgreSQL）：

   ```powershell
   pnpm dlx supabase start --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
   pnpm dlx supabase status
   ```

   默认端口：API `http://127.0.0.1:55321`，PostgreSQL `55322`，测试邮箱收件箱 `http://127.0.0.1:55324`。本命令不启动完整 Supabase 全套服务，不连接生产环境。

3. **一键生成本地配置文件**（自动读取当前运行中的本项目 Supabase Publishable Key，并写入被 Git 忽略的 `apps/admin/.env.local`；不保存 service_role 或数据库密码）：

   ```powershell
   pnpm run setup:local
   ```

   你也可以手工将 [`apps/admin/.env.example`](./apps/admin/.env.example) 复制为 `apps/admin/.env.local` 并填入 `pnpm dlx supabase status` 显示的 **Publishable Key**。文件结构如下；这里的占位符不是有效密钥：

   ```dotenv
   VITE_SUPABASE_URL=http://127.0.0.1:55321
   VITE_SUPABASE_PUBLISHABLE_KEY=粘贴本地PublishableKey
   ```

   **严禁使用 service_role、sb_secret_、数据库密码或其他私钥。** `.env.local` 已被 Git 忽略，不应提交；GitHub 只放 [`.env.example`](./apps/admin/.env.example) 模板。再次运行 `pnpm run setup:local` 会验证已存在配置；若文件与本地服务不一致，会先拒绝覆盖，防止误覆盖用户配置。

4. 从仓库根目录运行：

   ```powershell
   pnpm run dev
   ```

   打开 **[http://localhost:3000/](http://localhost:3000/)**。仅启动前端不会自动启动 Supabase；更改 `.env.local` 后需要重启 Vite。若尚未配置，首页会显示配置引导，不再白屏。

5. **创建或重置本地开发管理员**（仅本机，绝不用于生产）：

   ```powershell
   pnpm run setup:dev-admin
   ```

   本地固定测试账号：**`admin@aisencore.test`**，密码：**`Admin123456!`**。初始化脚本仅连接经过确认的本机 Supabase API `55321` 和数据库 `55322`；首次创建管理员，之后重复执行会将该本地账号恢复为上述固定密码。密码通过 GoTrue Auth 写入数据库中的**密码哈希**，无需额外保存任何密码文件。首次登录仍需绑定 TOTP 验证器并输入 6 位验证码达到 `aal2`；仅凭邮箱密码无法进行管理员操作。**这组公开开发凭据绝不能使用在生产、公网共享服务器或真实业务数据环境。**

   只想浏览无需账号的交互原型，请使用上面的离线 HTML；正式后台始终需要真实 Supabase Auth/TOTP。

**本地完整 UI 场景数据（已实测）**：在以上账号和数据库就绪后，于仓库根目录执行 `pnpm run seed:admin-demo`。它只访问本机 AisenCore Supabase，添加 4 个合成产品、24 个 `.test` 用户以及成员、Pro、发码批次、码安全摘要、核销和审计样本；可以重复运行，不会清空已有人为创建的数据，也不对接真实 SaaS。页面刷新后即可体验完整列表。本地 fixture 详细使用说明见 [Admin 演示数据与浏览器验收](./docs/development/testing/admin-demo-data.md)；截图与当前视觉工作参见 [D3 改造计划](./docs/Plans/aisencore-mvp/d3-admin-experience-upgrade.md)。

常用验证：`pnpm typecheck`、`pnpm lint`、`pnpm build`。**浏览其他管理板块**：使用左侧导航进入「用户与成员」「Pro 权益」「兑换码批次」「安全码管理」「核销记录」「成员事件」「账号查找」「平台管理员」「账号限制」「管理审计」。如果顶部产品范围选择 `aisenlens` 而当前产品没有演示成员，页面将显示专属空态；点击 **「切换至全平台查看数据」** 或顶部选择 Atlas、Orbit、Harbor 可看到合成测试记录。所有板块已接入正式 MUI 页面与数据查询，具体已验证范围仍以 D3 Chrome 回归记录为准。

完成体验后，可执行 `pnpm dlx supabase stop --project-id Aisencore` 关闭本地服务，数据卷默认保留（请勿误用 `db reset`，那会清空本地数据库）。

> 开发服务可能绑定所有网络接口，且本地 Supabase 使用开发密钥。**只在可信开发网络中运行，绝不要当成可公开访问的生产服务。** 正式客户端已通过多项实际 MFA/业务浏览器回归，但全模块操作、无障碍、视觉与前端性能的**第一阶段交付签收尚未完成**；AisenLens 本地联调和生产部署属于后两阶段。

## 项目目录与代码索引

AisenCore 使用**一个仓库、Supabase 原生可信后端、独立 React-admin 管理前端**的渐进式结构。完整目录蓝图、模块职责、代码归属和参考开源项目见 **[项目目录结构设计](./docs/architecture/infrastructure/repository-structure.md)**。

| 当前入口 | 代码/内容归属 | 实际状态 |
| --- | --- | --- |
| [`supabase/`](./supabase/config.toml) | PostgreSQL 迁移、RLS、可信 RPC；未来按需 Supabase Edge Functions | **已存在**；基础、Pro/兑换结构、[成员/管理 RPC](./supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql)和[兑换/Pro RPC](./supabase/migrations/20261024033040_redemption_and_grant_rpcs.sql)共四份 D1 迁移已从零重建；另已在本地应用[DEC-06 受限用户查询迁移](./supabase/migrations/20261024045105_admin_user_lookup.sql) |
| [`docs/`](./docs/README.md) | 现行需求、架构、开发与测试规范、TODO、Admin 离线原型 | **已存在** |
| [`AGENTS.md`](./AGENTS.md) | AI 开发、安全纪律、同步文档及过期清理规则 | **已存在** |
| [`apps/admin/`](./apps/admin/README.md) | React-admin + Vite + TypeScript 正式管理应用 | **第一阶段开发中、未签收**：认证/TOTP、资源与高危操作已有真实 Chrome 正反向回归、构建/安全检查 PASS；仍须完整表格/业务/异常测试、全站 WCAG、前端性能/代码分包测量与高标准视觉签收 |
| [`package.json`](./package.json) / [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) / `pnpm-lock.yaml` | pnpm 12 工作区、依赖解析与脚本 | **已验证**：完整依赖锁定、`pnpm install --frozen-lockfile` PASS；生产构建 PASS；固定安全的依赖覆盖配置后 `pnpm audit --prod` 为 0 个已知漏洞 |
| [`scripts/`](./scripts/test-d1-concurrency.py) | 本地数据库并发、真实 Auth/HTTP/TOTP、前端源码安全烟测 | **已存在**；[LCK-01～07](./scripts/test-d1-concurrency.py)、[真实 JWT/HTTP/MFA](./scripts/test-d2-auth-api-mfa.mjs)、[前端源码边界](./scripts/test-d3-source-boundaries.mjs)、[Chrome 登录页烟测](./scripts/test-d3-browser-smoke.mjs) 与 [构建产物密钥扫描](./scripts/test-d3-bundle-secrets.mjs) 已实测 |
| `packages/`、`.github/workflows/`、`tests/e2e/` | 只有确实出现共享代码、CI 或跨端验收时才建立 | **按需规划，尚未创建** |

**开发导航：** [当前需求](./docs/spec/requirements.md) · [架构总索引](./docs/architecture/README.md) · **[三阶段交付验收总则](./docs/Plans/aisencore-mvp/three-stage-delivery-gates.md)** · **[MVP 正式开发总计划](./docs/Plans/aisencore-mvp/00-mvp-master-plan.md)** · [D1 实施与验证记录](./docs/Plans/aisencore-mvp/d1-database-and-trusted-rpc.md) · **[D3 Admin 高标准前端完善计划](./docs/Plans/aisencore-mvp/d3-admin-experience-upgrade.md)** · [阶段计划总索引](./docs/Plans/README.md) · [当前 TODO](./docs/Plans/TODO.md) · [目录结构与归属规则](./docs/architecture/infrastructure/repository-structure.md)。

这里没有单独的 Node.js 后端服务器目录：身份来自 Supabase Auth，受保护读取依赖 PostgREST/RLS，可信状态变更与审计由 PostgreSQL RPC 承担。未来 Edge 仅处理必要的持密钥或外部 I/O；各 SaaS 自己维护业务功能、资源及项目数据。

## Admin MVP 交互测试预览

AisenCore 提供一个**可直接在浏览器打开的 Admin 交互测试 Demo**，用于预览与评审管理后台的信息架构、操作流程和异常恢复交互。它是单文件 HTML，使用合成数据，**无需安装依赖或连接真实服务**。

- **[查看 Admin MVP 交互预览 HTML](./docs/interaction-benchmarks/aisencore-mvp-interaction-lab.html)**
- [查看功能说明、体验步骤与测试边界](./docs/interaction-benchmarks/README.md)
- [Admin 应用架构](./docs/architecture/applications/admin-console.md)

**如何体验：** 在 GitHub 打开上述 HTML 文件，点击右上方的 **Download raw file（下载原始文件）** 保存到本地，再使用 Chrome 或 Edge 打开。也可以克隆仓库后直接打开 `docs/interaction-benchmarks/aisencore-mvp-interaction-lab.html`。

该预览展示全平台产品治理与**单产品独立管理空间**、用户与成员管理（含暂停/恢复）、Pro 授权、兑换码批次发行及 UNKNOWN 恢复、用户反馈处理、审计与模拟安全验证。自带 31 项测试场景卡（28 项本地模型检查与 3 项需要真实环境或人工验收的场景）。

> **仅用于 Admin UI / 业务交互测试与评审。** 所有用户、授权、兑换码、反馈和身份验证都是浏览器内存中的模拟数据，刷新后会重置；不连接 Supabase / PostgreSQL / Auth / RLS / RPC / Edge / R2，不提供真实生产级管理员安全保证。请勿输入真实的账户、密码或兑换码。

## Architecture

| Layer | Responsibility | Documentation |
| --- | --- | --- |
| Domain | 身份、产品成员、权益及计费规则 | [domains](./docs/architecture/domains/README.md) |
| Backend | 公共 API、可信授权与 SaaS 接入 | [backend](./docs/architecture/backend/README.md) |
| Database | PostgreSQL、RLS、事务、审计与 R2 数据边界 | [database](./docs/architecture/database/README.md) |
| Applications | React-admin、登录会话、本地优先 SaaS | [applications](./docs/architecture/applications/README.md) |
| Infrastructure | Supabase、Cloudflare、GitHub 与部署边界 | [infrastructure](./docs/architecture/infrastructure/README.md) |

- [需求文档](./docs/spec/requirements.md)
- [系统主架构](./docs/architecture/current-main-architecture.md)
- [架构总索引](./docs/architecture/README.md)
- [文档总入口](./docs/README.md)

## MVP technology choices

- **Identity**: Supabase Auth
- **Trusted backend**: PostgREST/RLS for reads, PostgreSQL RPC for state changes; Supabase Edge Functions for operations that require secrets
- **Relational data**: Supabase PostgreSQL
- **Admin**: React-admin + Vite, planned for Cloudflare Pages
- **Object storage**: Cloudflare R2 (where needed)
- **Source control**: GitHub

**Current status:** D1 isolated PostgreSQL SQL/RPC foundation passed 239/239 pgTAP and two-connection LCK-01～07 tests, with four migrations rebuilt from scratch. D2 has added a fifth migration for bounded admin Auth-user lookup, bringing local pgTAP to **286/286 PASS**; real local GoTrue, Kong, PostgREST and Mailpit HTTP checks, asymmetric signed JWT verification, TOTP `aal2`, and immediate admin revocation also PASS. **D2 remains in progress**: real GoTrue password recovery by Mailpit link, signed recovery JWT and old-password invalidation now PASS; browser callback coverage, 503/timeouts, scale P95 and lost MFA-device recovery remain unverified. The D3 React-admin implementation now builds, typechecks and lints successfully; an isolated Chrome login-render smoke test and static bundle key checks pass. Authenticated browser E2E (18 cases), visual owner approval, R2/payments, and deployment remain unverified or undelivered.

Repository: https://github.com/aisenhub/aisen-core
