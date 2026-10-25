# AisenCore 管理前端（D3 开发中）

正式源码位于 `apps/admin/`，使用 Vite + React + TypeScript + React-admin + MUI 和 Supabase Auth。生产部署、管理员恢复流程及视觉验收尚未通过。

**当前进行中的前端视觉/功能改造计划（UX-1 数据与 UX-3 核心视觉第一版已落地，未完成全部验收）**：[Admin 高标准前端完备化：功能缺口、原创视觉、隔离本地持久场景数据、UX-0～UX-7 与真实 E2E](../../docs/Plans/aisencore-mvp/d3-admin-experience-upgrade.md)。本地合成数据可持续用于前端开发，但在项目所有者批准前绝不接入真实 SaaS 平台。

## 本地运行

1. 在隔离的 Aisencore Supabase 开发环境启动 GoTrue / Kong / PostgREST（见 `docs/Plans/aisencore-mvp/d2-auth-public-api-and-mfa.md`）。
2. 本地 Supabase 服务启动后，在仓库根目录运行 `pnpm run setup:local`。它会自动创建 Git 忽略的 **`apps/admin/.env.local`（不是根目录 `.env`）**，只写入本地 `VITE_SUPABASE_URL` 与 Publishable Key，并拒绝覆盖不匹配的旧配置；绝不会写 Secret/service_role 密钥。手工方式仍可从 `.env.example` 复制并用 `pnpm dlx supabase status` 获取 Publishable Key。
3. 在仓库根目录运行 `pnpm install`、`pnpm typecheck`、`pnpm build`；开发服务器使用 `pnpm run dev`（http://localhost:3000/）。新增/修改 `.env.local` 后**必须重启 Vite**。只运行前端不会自动启动本地 Supabase；本地 Supabase 服务已经停止时，须按 D2 指南先启动相应容器，才能真正登录。
4. 在本地运行 `pnpm run setup:dev-admin`，创建或重置唯一开发测试管理员。固定邮箱 **`admin@aisencore.test`**，固定密码 **`Admin123456!`**；可重复执行，无需另找密码文件。账号仅存在于通过本机端口验证的 Supabase Auth 数据库，密码由 GoTrue 以哈希形式存储，不能用于线上环境。首次登录扫描官方 TOTP 二维码并验证 6 位动态码升至 `aal2`；仅输入固定密码的 `aal1` 会话依然不能进入管理后台。
5. 在同一个**隔离本地 Supabase** 中运行 `pnpm run seed:admin-demo`：自动填充 4 演示产品、24 合成用户、48 成员、26 授权、3 发行批次、18 仅摘要的安全码、6 核销及模拟审计/成员事件。重复运行不翻倍，不覆盖原本手建产品或固定开发管理员。**演示兑换码不存明文，也不是真实可兑换码**。正常本地重启会保留这些数据；本命令严格拒绝远程项目，暂不提供自动清理，切勿对本地人工数据执行 db reset。
6. `node scripts/test-d3-authenticated-pages.mjs` 在独立 Chrome、真实 GoTrue/TOTP `aal2` 会话下，实测 Dashboard、10 个运营/治理列表、8 类详情、用户 360、精确邮箱查找、产品范围空态恢复。用**随机测试对象**真正执行产品创建/启停、成员 `active/left` 暂停与恢复、Pro 授予与撤销、发码及单码/整批撤销、账号封禁/解封、管理员授予/撤权；核查数据库/审计与撤权后的旧 JWT。首次发码实际下载 TXT/CSV、核对 UTF-8，并测试明文不入持久化。通过浏览器网络拦截分别返回 429/503，核验发码与 Pro 授权的已知拒绝与 UNKNOWN 区分、原 request ID 跨刷新保留及幂等重试；Pro 还覆盖服务端已提交但客户端结果未知的原编号重放，数据库证实不会重复授权；每次退出核验随机 Auth/产品删除以及明文 TXT/CSV 文件立即销毁。程序以本机 TCP 3397 端口确保**不可双开并行验收**，截图只保留无明文页面。全部验收的精确覆盖与缺口见 [D3 验收矩阵](../../docs/Plans/aisencore-mvp/d3-acceptance-matrix.md) 和 [演示数据指南](../../docs/development/testing/admin-demo-data.md)。
7. 已使用 Vite 8 / Rolldown 将登录、Dashboard、产品/运营资源、详情与敏感操作页面按路由异步加载，并将 `ra-core`、MUI 等稳定依赖分包；主 App 块约 95 KB（gzip 31.6 KB）、MUI vendor 约 366 KB，原先所有业务同包约 428 KB 的状况已改善。**尚未据此宣称首屏 Web Vitals 或性能预算通过。****构建后真实验收**：PowerShell 在仓库根目录运行 `pnpm build`，然后运行 `$env:AISENCORE_UIQA_PREVIEW='1'; node scripts/test-d3-authenticated-pages.mjs`。此流程会在隔离端口 3396 启动正式 `vite preview`，通过 3397 排他锁禁止并发，执行真实 MFA/读写/注入异常回归与随机数据清理，不会影响 `localhost:3000` 的正常开发服务。

### 第一阶段性能与无障碍回归

- `node scripts/test-d3-phase1-foundation.mjs`：检查真实构建异步块、App 入口上限、四处已修复文本的对比度和通用表格源码语义。不是实际浏览器性能或全部 WCAG 认证。
- 正式生产预览 Chrome E2E 集成 axe-core（开发依赖），在 16 个实际管理员路由/状态运行 WCAG tags 自动规则测试；经三轮修复，第三轮 **0 个自动规则违规**，逐页结果写在 `docs/Plans/aisencore-mvp/ui-evidence/phase1-axe-wcag-baseline.json`。仍有 incomplete 与人工键盘/读屏/缩放任务，不得宣称 WCAG 2.2 AA 已完整验收。
- `phase1-perf-browser-sample.json` 是一次无网络限速的本地 Chrome 正式预览资源/导航采样，不等于 LCP/INP/CLS、P95 或 10k 数据规模签收；后续需复测并冻结预算。第一阶段完整施工和退出门禁见 [整改总计划](../../docs/Plans/aisencore-mvp/phase1-delivery-remediation-plan.md)。

### 首页空白的排查说明

原先 `src/supabaseClient.ts` 会在模块加载时检查环境变量；缺少 `.env.local` 导致直接抛错，React 来不及挂载，出现白屏。现在 `src/main.tsx` 在加载依赖 Supabase 的 Admin 模块前检查公共配置：**未配置或错用 Secret Key 时显示安全的配置引导页**，正确配置时才动态加载登录模块。测试 `node scripts/test-d3-missing-config.mjs`（独立端口 3393，Chrome 首页）与 `node scripts/test-d3-browser-smoke.mjs`（独立端口 3394，Chrome 登录页）均已 PASS。这只是页面渲染烟测，不是已认证的生产 E2E。

列表和产品范围来自受 RLS 保护的只读查询；所有业务写入必须走受保护 RPC。发行兑换码的明文只保存在 `IssueCodes` 组件的当前内存，不进入查询缓存、浏览器持久化、URL 或日志；仅非秘密的请求恢复元数据可以进入 `sessionStorage`。

本地已验证 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm build`、`pnpm lint`、`pnpm audit --prod`（无当前已知漏洞）、Chrome 未认证登录页烟测及构建产物秘钥静态扫描。`/auth/reset-password` 已编写固定回调地址的恢复邮件发送/重置表单，**仅 GoTrue 后端密码恢复链路真实 HTTP 已验证，前端浏览器重置流程尚未 E2E 验收**。

当前不是生产就绪运营后台。虽然本地已通过大量真实浏览器与数据库安全 E2E，但还有部分 UI-X 合同负例、完整 WCAG 2.2 AA、MFA 因子丢失恢复、生产规模性能测试、最终视觉确认和 D4 发布准入未完成。详见 [逐项验收矩阵](../../docs/Plans/aisencore-mvp/d3-acceptance-matrix.md)。
