# AisenCore 项目目录结构与代码归属

> **现行设计方案 · 2026-10-24**。下面区分已存在与未来目录；本文件不表示已经初始化前端、Edge、CI 或云环境。需求以[当前需求](../../spec/requirements.md)为准，实施状态以[TODO](../../Plans/TODO.md)及[当前 D1 计划](../../Plans/aisencore-mvp/d1-database-and-trusted-rpc.md)为准。

## 设计结论

采用 **单仓库、Supabase 原生后端、独立 React-admin、按需 pnpm workspace**。代码围绕真正的可部署单元组织，而不是将数据库、Auth、受保护 RPC 虚构成 Node.js 服务。只有真实复用需求出现才添加共享包。独立 SaaS 的业务项目、业务库、文件及 Free/Pro 功能额度不归 Core 管理。

## 参考的开源工程与取舍

| 参考来源 | 借鉴 | 不照搬 |
| --- | --- | --- |
| [Supabase CLI 工作流](https://supabase.com/docs/guides/local-development/cli-workflows) | 根目录 `supabase/config.toml`、`migrations/` 与可选 `seed.sql` | 不把迁移搬出 CLI |
| [Supabase 官方 Edge 结构](https://supabase.com/docs/guides/functions/development-environment) | `functions/<name>/index.ts`、`_shared/`、Deno 配置、函数测试 | 不为普通 SQL RPC 多套一个 Edge |
| [React-admin Vite](https://marmelab.com/react-admin/Vite.html)与[官方 Demo](https://github.com/marmelab/react-admin/tree/master/examples/demo) | 独立 React + Vite + TypeScript 应用和 Resource/Provider 模式 | 不重复造路由、表单、缓存 |
| [pnpm Workspace](https://pnpm.io/workspaces)和[Turborepo 目录指南](https://github.com/vercel/turborepo/blob/main/apps/docs/content/docs/crafting-your-repository/structuring-a-repository.mdx) | `apps/` 可部署应用，`packages/` 共用库 | 不引入 Turborepo/Nx 及空共享包 |
| [Supabase 开源仓库](https://github.com/supabase/supabase/blob/master/DEVELOPERS.md) | 多应用职责、明确的开发命令及目录索引 | 不复制大型平台组件数量 |
| [Cloudflare Pages Monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/) | Admin 独立构建与输出 | 不让 Pages 部署 DB/Edge |

## 目标目录图

`[现有]` 已在当前仓库，`[D3]` 正式 Admin 开发才创建，`[按需]` 有代码时才创建。**这是规划图，非当前磁盘清单。**

```text
Aisencore/
├─ README.md / AGENTS.md                    [现有] 根索引与 AI 工作规则
├─ .gitignore / .gitattributes              [现有]
├─ docs/                                   [现有] 唯一正式文档区
│  ├─ README.md
│  ├─ spec/requirements.md
│  ├─ architecture/                        领域/数据库/API/应用/基础设施
│  ├─ development/                         复用开发与测试规范
│  ├─ Plans/TODO.md                        未完成项及当前阶段计划
│  ├─ interaction-benchmarks/              V6 仅模拟 Admin Demo
│  └─ prompt/                              按需文档清理
├─ supabase/                               [现有] 可信公共后端的唯一根
│  ├─ config.toml / .gitignore             [现有] 本地项目配置
│  ├─ migrations/                          [现有] 扁平时间戳 SQL
│  │  ├─ 20261024011528_core_foundation.sql
│  │  ├─ 20261024025852_entitlements_and_redemption_schema.sql
│  │  ├─ 20261024032247_trusted_rpcs_and_locking.sql
│  │  ├─ 20261024033040_redemption_and_grant_rpcs.sql
│  │  └─ 20261024045105_admin_user_lookup.sql
│  ├─ tests/
│  │  ├─ database/                        [现有] 001～006 六组 pgTAP
│  │  └─ functions/                       [按需] Edge 测试
│  ├─ functions/                           [按需] 只有密钥/外部 I/O 才建
│  │  ├─ deno.json                        单独的 Deno 配置
│  │  ├─ _shared/                         复用出现时才建
│  │  ├─ admin-users/                     RPC 方案不适用时的回退
│  │  └─ aisenlens-config-backup/         SaaS 专属 JSON/R2 备份
│  └─ seed.sql                             [按需] 仅合成测试数据
├─ apps/                                   [D3已建] 待实测构建/发布的前端应用
│  └─ admin/                               React-admin + Vite + TS
│     ├─ package.json / index.html
│     ├─ vite.config.ts / tsconfig.json
│     ├─ .env.example                     只公开配置名、没有真实密钥
│     ├─ public/                          静态资产/必要 SPA 回退
│     └─ src/
│        ├─ main.tsx                      浏览器入口
│        ├─ app/                          App / Theme / Resource 注册
│        ├─ auth/                         Supabase Auth Provider / TOTP
│        ├─ data/                         Data Provider / RPC 命令适配
│        ├─ resources/                    按产品领域纵向组织页面
│        │  ├─ products/
│        │  ├─ memberships/
│        │  ├─ grants/
│        │  ├─ codes/
│        │  ├─ audit/
│        │  └─ admins/
│        ├─ components/                    仅实际复用组件
│        ├─ types/                         生成 DB 类型 / API DTO
│        └─ tests/                         组件单测
├─ package.json                           [现有] 根级脚本/工作区
├─ pnpm-workspace.yaml                    [现有] 只匹配实际 apps/*
├─ pnpm-lock.yaml                         [现有] frozen 安装/安全审计通过
├─ .github/workflows/                     [按需] CI 与经批准发布
├─ tests/e2e/                             [按需] 跨 Auth/API/Admin 测试
├─ scripts/                               [现有] 本地测试脚本
│  ├─ test-d1-concurrency.py              双连接 LCK-01～07
│  ├─ test-d2-auth-api-mfa.mjs            真实本地 JWT/HTTP/TOTP/密码恢复
│  ├─ test-d3-source-boundaries.mjs       前端静态边界检查
│  ├─ test-d3-bundle-secrets.mjs          生产 JS 包的静态密钥扫描
│  └─ test-d3-browser-smoke.mjs           Chrome 未认证登录页 DOM 烟测（非E2E）
└─ packages/                              [暂不创建] ≥2 实际消费者再评估
```

## 各目录职责与安全界线

| 目录 | 放什么 | 不放什么 |
| --- | --- | --- |
| `supabase/migrations/` | 顺序 SQL 迁移：表、约束、索引、GRANT/RLS、可信 RPC、同事务审计 | 第二套“最终 SQL”真源、独立 ORM/Prisma schema |
| `supabase/tests/database/` | pgTAP、SQL 角色、RLS 负例、事务和并发验证 | 把 SQL 模拟 claim 当作真实签名 JWT 的通过证据 |
| `supabase/functions/` | Auth Admin、未来支付/R2 访问、内容校验等必须由服务器持密钥执行的 I/O | 重写成员/Pro/兑换事务；浏览器密钥 |
| `apps/admin/src/resources/` | React-admin 按 Resource 分组的列表、详情、表单和操作 UI | 自建第二套框架或把 UI 当授权权威 |
| `apps/admin/src/auth/` 与 `data/` | 会话/TOTP、最小 Auth/Data Provider、受保护 RPC 的适配 | 在前端保存 secret key 或复制服务器状态机 |
| `docs/` | 最新需求、架构、可复用方法、真实进度与未完成项 | 历史交接和已失效计划 |
| `packages/` | 后续确有两个以上真实消费者的可共享代码 | 为一个 Admin 预制 SDK、UI、通用插件框架 |

数据库的 `public` / `private` 是**PostgreSQL schema 而不是文件夹**。使用官方 CLI 时间戳迁移，给文件起明确的主题名（例如 `*_member_rpcs.sql`、`*_pro_grants.sql`），**不移动已执行的迁移**。`SECURITY DEFINER`、函数默认 EXECUTE、RLS/GRANT、管理员 `aal2` 必须实测，不能仅凭目录看起来安全。

AisenLens、AisenNote 的完整应用和私有业务库留在各自仓库；当 AisenLens 限定非敏感 JSON 备份确需部署到共用 Supabase 时，只放**专属 Edge 函数及测试**在此仓库，不把 SaaS 备份额度纳入公共 Pro 表。

## pnpm、CI 与部署

- **pnpm ≥12**：初始化 Admin 时创建根私有 `package.json`，可以使用 `"engines": {"pnpm": ">=12.0.0"}`；不要求 `packageManager` 精确补丁版本。Node 兼容性及 CI 检查由实际依赖组合决定。
- **`pnpm-lock.yaml` 应提交**：锁定安装的依赖解析树，不等于锁死 pnpm 程序版本；不手写 lockfile。不需要 Turborepo 或 Nx。
- **测试分层**：数据库和 RLS 用 `supabase/tests/database`；Deno Edge 用 `supabase/tests/functions`；React 单测归 Admin；全链路浏览器/真实 JWT E2E 再使用 `tests/e2e`。
- **Cloudflare Pages**：将来只发布 `apps/admin` 的 Vite 静态输出 `apps/admin/dist`。独立配置构建根与命令、必要构建路径过滤；**不通过 Pages 自动迁移生产数据库**。[参考构建设置](https://developers.cloudflare.com/pages/configuration/build-configuration/)。
- **环境**：`.env.example` 仅占位，`.env*` 等秘密均不提交；公开前端仅放 URL/publishable key 等公开值，`service_role`、R2 长期密钥和真实兑换码只在可信环境。
- **文档同步**：每次新增/删除真实一级目录，必须同任务更新[根 README](../../../README.md)、本文件与相关索引；遵守[AGENTS](../../../AGENTS.md)的过时文档清理规则。

## 分阶段落地与完成条件

| 阶段 | 允许建立/维护 | 不提前做 |
| --- | --- | --- |
| **现在** | 本规范、根目录导航、现有 `docs/` 与 `supabase/` | 不创建空 `apps`/`packages`/`infra` |
| **D1** | 原 `supabase/migrations/` 继续做 Pro、兑换、可信 RPC，并补测试 | 不开第二个 Node 后端 |
| **D2** | 真实 Auth/PostgREST/JWT；有外部 I/O 需求时才建 Edge | 不预建支付网关/Edge 微服务 |
| **D3** | 建立 `apps/admin`、pnpm workspace/lockfile、真实 Resource/Theme | 不照搬 V6 的模拟业务鉴权 |
| **CI/发布** | 对应真实命令的 PR 校验、按授权部署和回滚 | 不擅自创建生产资源 |

**完成条件**：每个新目录都有实际归属和代码，根入口能找到真实工程与目录规划，原 D1 迁移/pgTAP 不被破坏，没有冗余的业务规则或第二个真源。
