# AisenCore

**A lightweight shared backend for independent SaaS products.**

AisenCore（Aisen 公共核心服务）为多个彼此独立的 SaaS 产品统一提供必要的账号身份、产品目录和成员关系、产品级会员权益、兑换码与轻量计费，以及内部 Admin 管理入口。各 SaaS 仍自行管理项目、任务、业务权限与业务数据。

## Admin MVP 交互测试预览

AisenCore 提供一个**可直接在浏览器打开的 Admin 交互测试 Demo**，用于预览与评审管理后台的信息架构、操作流程和异常恢复交互。它是单文件 HTML，使用合成数据，**无需安装依赖或连接真实服务**。

- **[查看 Admin MVP 交互预览 HTML](./docs/interaction-benchmarks/aisencore-mvp-interaction-lab.html)**
- [查看功能说明、体验步骤与测试边界](./docs/interaction-benchmarks/README.md)
- [查看全平台 / 单产品工作空间设计与实施计划](./docs/interaction-benchmarks/workspace-scope-refactor-plan.md)

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
- **Backend**: Supabase Edge Functions
- **Relational data**: Supabase PostgreSQL
- **Admin**: React-admin + Vite, planned for Cloudflare Pages
- **Object storage**: Cloudflare R2 (where needed)
- **Source control**: GitHub

**Current status:** architecture and requirements design. The listed stack and workflows are architectural choices, **not** a claim that all services, APIs, billing integrations, or deployments are operational.

Repository: https://github.com/aisenhub/aisen-core
