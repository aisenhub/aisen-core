# AisenCore

**A lightweight shared backend for independent SaaS products.**

AisenCore（Aisen 公共核心服务）为多个彼此独立的 SaaS 产品统一提供必要的账号身份、产品目录和成员关系、产品级会员权益、兑换码与轻量计费，以及内部 Admin 管理入口。各 SaaS 仍自行管理项目、任务、业务权限与业务数据。

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
