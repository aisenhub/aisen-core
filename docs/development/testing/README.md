# AisenCore 测试与验收规范

> 当前已采用 **Supabase CLI + pgTAP** 完成 D1-M1～M4 本地 PostgreSQL 结构/RLS、RPC 与双连接锁验证。D2 核心 GoTrue/PostgREST/Mailpit 真 HTTP 与签名 JWT/TOTP 场景已通过部分自动化；完整 Auth/浏览器、R2/云端验收仍未完成。

## 已有真实执行证据（2026-10-24）

| 验证 | 脚本 | 实测 |
| --- | --- | --- |
| 6 张基础表、约束、RLS、显式 GRANT / 禁止废弃公共表 | [001_core_foundation.test.sql](../../../supabase/tests/database/001_core_foundation.test.sql) | **25 PASS** |
| SQL 角色、合成身份下本人隔离、跨用户禁止读写/管理员表保护 | [002_membership_rls.test.sql](../../../supabase/tests/database/002_membership_rls.test.sql) | **10 PASS** |
| Pro/兑换表、私有 MFA 管理鉴权、无哈希投影、列 GRANT、RLS、约束负例（合成身份） | [003_entitlements_and_redemption_schema.test.sql](../../../supabase/tests/database/003_entitlements_and_redemption_schema.test.sql) | **57 PASS** |
| 成员/管理 RPC、M1 保底、审计（SQL 模拟身份） | [004_membership_and_admin_rpcs.test.sql](../../../supabase/tests/database/004_membership_and_admin_rpcs.test.sql) | **70 PASS** |
| 兑换/Pro、限流/幂等、异常回滚（SQL 模拟身份） | [005_redemption_and_grant_rpcs.test.sql](../../../supabase/tests/database/005_redemption_and_grant_rpcs.test.sql) | **77 PASS** |
| DEC-06 非登录最小授权 Auth 用户查询、五列白名单、RLS/参数/分页、模拟 MFA 禁止跨用户 | [006_admin_user_lookup.test.sql](../../../supabase/tests/database/006_admin_user_lookup.test.sql) | **47 PASS** |
| B1 原管理员请求核查、AAL2/匿名拒绝、跨管理员隔离、源键不泄露 | [007_admin_grant_request_lookup.test.sql](../../../supabase/tests/database/007_admin_grant_request_lookup.test.sql) | **19 PASS（2026-10-25）** |

2026-10-25 本地七份 pgTAP **305 PASS / 0 FAIL**（原286 + B1 19），在隔离本地 PostgreSQL 执行。数据库测试使用 `SET ROLE` / SQL 合成 JWT claims，**不等于真实 Auth 验签/MFA/HTTP**。另在本地运行了独立的实际 GoTrue/HTTP/MFA 脚本。所有合成用户/成员已在测试事务中回滚。

四份迁移已在核对端口为 55322 的空数据隔离库成功从零重建；[真实并发脚本](../../../scripts/test-d1-concurrency.py) `LCK-01`～`07` **7/7 PASS**，通过独立连接及 `pg_stat_activity` 观察锁等待，场景内未发生死锁，夹具清理后无残留。

[D2 实际 HTTP/MFA 测试](../../../scripts/test-d2-auth-api-mfa.mjs) `node scripts/test-d2-auth-api-mfa.mjs` **退出码 0 / 当前断言全部 PASS**，使用真实 GoTrue、Kong/PostgREST、Mailpit、签名 ES256 JWT 与 TOTP `aal2`；覆盖登录/邮件确认、禁用未确认会话、Admin 权限即时撤销、blocked、局部业务 HTTP 状态及多会话 local logout。已另外验证真实 Mailpit recovery 链接、恢复签名 JWT、修改密码/旧密码拒绝/新密码登录；完整 12 项 Auth 安全编号、浏览器回调与因素丢失恢复仍未完成。

**D3 静态/构建实证（2026-10-24）**：[正式 Admin](../../../apps/admin/README.md) 已运行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm build`、`pnpm lint`（均 `0`）、`pnpm audit --prod`（0 已知漏洞，修复传递依赖）、[源码安全边界烟测](../../../scripts/test-d3-source-boundaries.mjs)、[构建产物密钥扫描](../../../scripts/test-d3-bundle-secrets.mjs)、[真实 Chrome 未认证登录页渲染](../../../scripts/test-d3-browser-smoke.mjs)（均 `0`）。此外，已新增生产构建真实 Chrome 的 AAL2 管理员 E2E：完整 10 资源列表、8 类详情、授权/发码/账号等关键业务写入与错误恢复已覆盖；仍不等于完整 18 项 D3 UI、真实性能或视觉签收。

**第一阶段新证据（2026-10-24）**：`scripts/test-d3-authenticated-pages.mjs` 在正式 Vite 预览 + 独立 Chrome + 真实 GoTrue MFA `aal2` 下完成 10 列表、主要详情、真实写入/审计、Pro 503 UNKNOWN 跨刷新与原管理员/原编号幂等恢复（包括服务端已提交后重放不重复授权）、已知 429 无写入、发码 429/503/UNKNOWN、服务端列排序、无效 UUID 查询阻断、30 组视口检查与临时数据删除，exit 0。程序也使用开发依赖 axe-core 在 16 个已认证页面/状态执行实际自动 WCAG 规则：第 1 轮 281 个违规元素匹配项，第 3 轮 **0 项自动违规**；报告在 `docs/Plans/aisencore-mvp/ui-evidence/phase1-axe-wcag-baseline.json`，其 `incomplete` 和未覆盖交互/读屏/缩放必须另行人工验收。`phase1-perf-browser-sample.json` 仅为单次 Chrome 正式预览页面诊断，`scripts/test-d3-phase1-foundation.mjs` 仅检查分块和局部颜色，不是完整 Core Web Vitals 或 WCAG AA 证书。

**本地配置与 GitHub 新用户启动实测**：`pnpm run setup:local` 已创建 `apps/admin/.env.local`（Git `*.local` 忽略，恰好两个公开变量；不存在服务端密钥），重复运行结果一致；`node scripts/test-d3-browser-smoke.mjs --local` 使用**真实本地 Publishable Key** 和 GoTrue/Auth/API 在线环境在隔离 Chrome 中显示登录页 PASS；后端 `/auth/v1/health` 与 Mailpit `/api/v1/messages` 均 HTTP 200。根 README 包含离线单文件模拟演示和真实 Admin 开发服务两个入口。

**本地固定测试 Admin 实证**：`pnpm run setup:dev-admin` 严格限定本机 55321/55322，当前存在 active 测试管理员 `admin@aisencore.test`，固定密码 `Admin123456!` 通过受控 GoTrue API 写入 Auth 密码哈希，原临时随机密码文件已删除。真实 GoTrue 固定密码登录和 `admin_check_access` 检查：`aal1` 无权访问，均 PASS；首次 TOTP 绑定与完整浏览器业务 E2E 尚待测试。这个可公开开发密码只用于本地隔离数据库。

复测命令：

```powershell
# 警告：仅已核对的本地隔离数据库，重置会清空其数据
pnpm dlx supabase db reset --local --no-seed --yes
pnpm dlx supabase test db --local supabase/tests/database
python scripts/test-d1-concurrency.py
# Auth HTTP 测试先用 D2 计划中的最小 Supabase 栈启动指令
node scripts/test-d2-auth-api-mfa.mjs
```

## 未完成但必须真实验证

- **真实 JWT/HTTP、函数授权复核**：在 GoTrue 验证的真实签名令牌下复测匿名/跨用户/跨产品、`aal1`/`aal2`、blocked、Admin 撤权、私有函数调用/权限、RLS 与 schema cache；已有 SQL 角色模拟不可替代真实 HTTP。
- **完整业务 HTTP 验证**：SQL/双连接已覆盖成员、最后合格管理员、首响明文、跨产品/限流/幂等、Pro 续期、异常回滚；仍需真实 HTTP/JWT 下的 401/403/409/422/503、UNKNOWN 重试与超时、旧管理员会话/因子撤销边界，不能将 SQL PASS 归入浏览器 E2E。
- **真实客户端与产品**：Supabase Auth 密码找回完整验证、因子恢复、独立 SaaS 登录/登出、本地离线 Free、React-admin 使用已认证管理员的真实浏览器验证键盘/焦点/响应式和高危恢复；目前仅 Chrome 未认证登录页 smoke PASS，禁止将其当完整端到端 PASS。
- **R2 与网络恢复**：SaaS 资源属主/容量、白名单小 JSON 可信校验、唯一 final 条件写、防重放、pending/ready/孤儿对账、单边失败/超时、已签 URL 撤权窗口、手动备份恢复。
- **稳定性与上线**：LCK-01～07 已在本地独立 PG 连接实测通过；仍需真实服务请求的 P50/P95/请求次数、成本、日志脱密、账号注销、密钥隔离、备份/迁移恢复、部署和回滚。批准后在隔离环境运行，再判断生产就绪。

测试行为与编号以 [API 契约的 I-01～I-28、R-01～R-15 及补充用例](../../architecture/backend/api-contract-and-mvp-acceptance.md)、[事务锁序](../../architecture/database/rpc-security-and-locking-contract.md)、[Admin 应用合同](../../architecture/applications/admin-console.md)为权威；本文件不维护第二套逐案例期望。

## 额外安全底线

只对实际存在的业务能力测试。不为假设的通用积分余额、`consume_user_quota`、AI 网关或公共业务配额新建数据库表/RPC。若 SaaS 将来引入消费计量，应由可信主体确认资源属主与成本，并在事务里检查正数、上限、并发、请求幂等和必要审计；不得信任客户端传来的负成本，也不得把陈旧 JWT 自定义权限作为当前 Pro/Admin/blocked 的权威。

每次运行记录测试脚本、提交版本、环境/服务版本、可复核断言、实际 PASS/FAIL/SKIPPED/NOT RUN，失败不以设计说明遮盖；公开日志不得包含真实码、JWT 或高权限密钥。
