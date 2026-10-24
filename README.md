# AisenCore

**A lightweight shared backend for independent SaaS products.**

AisenCore（Aisen 公共核心服务）为多个彼此独立的 SaaS 产品统一提供必要的账号身份、产品目录和成员关系、产品级会员权益、兑换码与轻量计费，以及内部 Admin 管理入口。各 SaaS 仍自行管理项目、任务、业务权限与业务数据。

## 项目目录与代码索引

AisenCore 使用**一个仓库、Supabase 原生可信后端、独立 React-admin 管理前端**的渐进式结构。完整目录蓝图、模块职责、代码归属和参考开源项目见 **[项目目录结构设计](./docs/architecture/infrastructure/repository-structure.md)**。

| 当前入口 | 代码/内容归属 | 实际状态 |
| --- | --- | --- |
| [`supabase/`](./supabase/config.toml) | PostgreSQL 迁移、RLS、可信 RPC；未来按需 Supabase Edge Functions | **已存在**；[首份迁移](./supabase/migrations/20261024011528_core_foundation.sql)、[pgTAP 测试](./supabase/tests/database/001_core_foundation.test.sql)已编写并在本地验证 |
| [`docs/`](./docs/README.md) | 现行需求、架构、开发与测试规范、TODO、Admin 离线原型 | **已存在** |
| [`AGENTS.md`](./AGENTS.md) | AI 开发、安全纪律、同步文档及过期清理规则 | **已存在** |
| `apps/admin/` | React-admin + Vite + TypeScript 正式管理应用 | **D3 规划，尚未创建** |
| 根 `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` | pnpm ≥12 工作区、依赖解析与脚本 | **D3 规划，尚未初始化** |
| `packages/`、`scripts/`、`.github/workflows/`、`tests/e2e/` | 只有确实出现共享代码、重复脚本、CI 或跨端验收时才建立 | **按需规划，尚未创建** |

**开发导航：** [当前需求](./docs/spec/requirements.md) · [架构总索引](./docs/architecture/README.md) · **[MVP 正式开发总计划](./docs/Plans/aisencore-mvp/00-mvp-master-plan.md)** · [D1 实施与验证记录](./docs/Plans/aisencore-mvp/d1-database-and-trusted-rpc.md) · [阶段计划总索引](./docs/Plans/README.md) · [当前 TODO](./docs/Plans/TODO.md) · [目录结构与归属规则](./docs/architecture/infrastructure/repository-structure.md)。

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

**Current status:** D1 local development has started. The first six PostgreSQL tables/RLS migration is applied and 35 local pgTAP checks pass; Auth/MFA, trusted RPC, Pro/redemption, React-admin, R2, payments, and cloud deployments are **not yet delivered or verified**.

Repository: https://github.com/aisenhub/aisen-core
