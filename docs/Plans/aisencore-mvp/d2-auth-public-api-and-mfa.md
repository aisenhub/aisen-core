# 阶段 D2 执行计划：统一身份、公共 API HTTP 契约、Admin TOTP MFA 与受限身份查询

- **阶段代号**：`PHASE-D2`
- **前置依赖**：D1 目标 API 和权限合同已稳定，可提前准备本地 Auth 栈；对应受保护接口在 D1 安全测试通过前不能进行正式验收或发布。
- **权威依据**：
  - [统一需求 §3, §6](../../spec/requirements.md)
  - [统一登录、邮件验证与多 SaaS 会话架构](../../architecture/applications/auth-and-multi-saas-sessions.md)
  - [平台管理员权限与公共账号生命周期（A-04）](../../architecture/domains/platform-admin-and-account-lifecycle.md)
  - [公共 API 契约与 MVP 验收（DEC-06 / 错误模型）](../../architecture/backend/api-contract-and-mvp-acceptance.md)
  - [公共 API 与独立 SaaS 接入时序](../../architecture/backend/public-api-and-saas-integration.md)

---

## 1. 阶段边界声明（Scope & Hard Boundaries）

### 1.1 准入条件（Entry Gate）
- D1 对应接口与权限规则明确、数据库迁移可本地复建；完整 GoTrue/PostgREST 启动可与 D1 并行，安全 E2E 仅在目标实现通过相关 D1 用例后认定 PASS。

### 1.2 本阶段必须完成的交付范围（In-Scope）
1. **启动并验收完整本地 Supabase 服务栈**：确保本项目独立端口（API `55321`、DB `55322`、Studio `55323`、Inbucket 邮件测试 `55324`）下的 GoTrue Auth、PostgREST Data API、Kong 网关和 Edge Runtime 全部健康运行。
2. **真实 GoTrue 签名 JWT 与会话生命周期验证**：测试邮箱+密码注册、Inbucket 捕获确认邮件完成 Confirm Email（未确认邮箱无法获取会话）、密码找回重置、本地登出（`signOut({ scope: 'local' })` 不误杀其他产品会话）；核验实际 JWT 签名算法，只有确实启用非对称密钥才要求使用 JWKS 公钥验证。
3. **PostgREST HTTP 状态码与稳定业务错误码端到端对齐**：验证通过真实 HTTP 调用 RPC 时，`CheckAccess` 业务拒绝返回 HTTP 200 + `allowed=false/reason`、`RedeemCode` 预期拒绝返回 HTTP 200 + `ok=false/code`，其余受控写入异常精确映射为 HTTP `401` / `403` / `404` / `409` / `422` / `429` / `503` 及稳定 `code`。
4. **Admin TOTP MFA 全链路验证（AUTH-P01 ~ P12）**：用真实 Supabase Auth SDK 完成管理员 TOTP 因子注册（`mfa.enroll`）、挑战与验证（`mfa.challengeAndVerify`）取得 `aal2` JWT；验证 `aal1` 访问管理 RLS/RPC 100% 被拒、`aal2` 正常放行且日常翻页/操作不触发额外 MFA HTTP 请求；验证管理员被撤权或 `blocked` 后即便持有效 `aal2` JWT 也会在下一次 RPC/RLS 请求中立即被拒。
5. **DEC-06 管理员受限用户查询实现与实测**：优先实现并测试受保护只读 PostgreSQL RPC（`admin_lookup_users_by_ids` / `admin_search_users`）在真实 Supabase Auth 权限体系下读取 `auth.users` 的安全白名单字段（仅 `id, email, created_at, email_confirmed_at, last_sign_in_at`）；仅在完整记录 SQL RPC 权限/性能无法安全满足目标后，依现行架构采用受保护 Edge Function 条件回退 `admin-user-lookup`。
6. **最小认证静态落地页逻辑验证**：D2 验证邮件回调、PKCE/OTP、Redirect 白名单和防开放重定向协议；正式 `/auth/confirm` 与 `/auth/reset-password` 页面归 D3 的 `apps/admin/`，不预建临时前端。

### 1.3 严禁越界行为（Hard Out-of-Scope）
- **严禁**自建 `/login`、`/register`、`/refresh` 接口或签发第二套自定义产品 JWT。
- **严禁**对普通 SaaS 用户强制要求开启 TOTP MFA。
- **严禁**将 `auth.users` 暴露到 PostgREST Data API，严禁允许匿名或普通 `authenticated` 用户调用管理员用户查询接口。
- **严禁**在每次前端页面渲染或普通按钮点击时串行调用 `supabase.auth.getUser()`。
- **严禁**在本阶段连接生产 SMTP、绑定生产域名或使用生产密钥。

---

## 2. 详细技术设计与实施子任务（Milestones & Tasks）

### Milestone D2-M1：完整本地 Supabase 栈启动与 PostgREST 错误映射核验

1. **启动与健康检查**：
   - 运行 `pnpm dlx supabase start`（确认使用 `supabase/config.toml` 中的 `project_id = "Aisencore"` 及 `55321`~`55327` 端口，绝不借用其他项目的容器）。
   - 验证实际启用的 Auth/Data API/网关健康；JWKS 公钥验签仅适用于真实非对称签名配置，不能把 JWKS URL 存在视为验签成功。
2. **核验 PostgreSQL → PostgREST HTTP 错误状态码映射**：
   - 在 PostgreSQL RPC 中，通过 `RAISE EXCEPTION USING ERRCODE = '...', MESSAGE = '...', DETAIL = '{"code": "..."}'` 或设置 `response.status` GUC（依据当前本地 PostgREST 版本实测支持度选择最稳定的标准机制），确保：
     - 未登录 / 无效 JWT → HTTP `401` (`AUTH_REQUIRED`)
     - 非管理员或 `aal1` 调管理接口、`left/suspended/blocked` 调 `ensure_membership`/`rejoin_product` → HTTP `403` (`ADMIN_REQUIRED` / `ACCOUNT_RESTRICTED` / `MEMBERSHIP_LEFT` / `MEMBERSHIP_SUSPENDED` / `PRODUCT_UNAVAILABLE`)
     - 状态竞争、M1 最后管理员保底拦截、幂等异参冲突 → HTTP `409` (`STATE_CONFLICT`)
     - 参数非法 → HTTP `400` / `422` (`INVALID_INPUT`)
     - `check_access(product_key)` 业务拒绝 → **HTTP `200`** + `{"allowed": false, "reason": "..."}`
     - `redeem_code(product_key, code)` 预期业务拒绝与限流 → **HTTP `200`** + `{"ok": false, "code": "...", "retry_after_seconds": ...}`

---

### Milestone D2-M2：DEC-06 管理员受限身份查询（SQL RPC 优先 + Edge 回退）

依据 `docs/architecture/backend/api-contract-and-mvp-acceptance.md` §3（DEC-06 已批准方案）：

1. **首选方案：受保护 PostgreSQL 只读 RPC**：
   - 实现 `public.admin_lookup_users(p_user_ids uuid[] DEFAULT NULL, p_email_exact text DEFAULT NULL, p_page integer DEFAULT 1, p_per_page integer DEFAULT 50) RETURNS jsonb`（委托给 `private.admin_lookup_users_kernel`）：
     - 首行强制校验 `IF NOT private.is_platform_admin() THEN RAISE ... ADMIN_REQUIRED END IF;`。
     - 限制 `cardinality(p_user_ids) <= 100`，`p_per_page BETWEEN 1 AND 100`。
     - 仅从 `auth.users` 投影白名单字段：`id`, `email`, `created_at`, `email_confirmed_at`, `last_sign_in_at`（**严禁返回 `encrypted_password`, `confirmation_token`, `recovery_token`, `raw_user_meta_data`, `raw_app_meta_data` 或 MFA 秘钥**）。
     - `p_email_exact` 使用 `lower(btrim(p_email_exact))` 精确匹配，严禁开放无界 `ILIKE '%...%'` 全表模糊扫描。
2. **真实验证与条件回退（REV-DEC06-01 ~ 06）**：
   - 在真实本地 Supabase 栈中测试：
     - `anon`、普通 `authenticated`、`aal1` 管理员、已撤权管理员、已 `blocked` 管理员调用 `admin_lookup_users` → 100% 拒绝（HTTP 403/401）。
     - 合格 `aal2` 管理员传入本页 50 个 UUID 批量补全邮箱 → 验证执行计划走主键索引且 P95 延迟达标。
   - **仅当**本地/目标 Supabase 环境的角色权限限制导致 `private` definer 无法安全 SELECT `auth.users` 时，无需再次询问用户，直接切换实现 `supabase/functions/admin-user-lookup/index.ts`（先验 JWT + 调 `admin_check_access` 确认 `aal2` 管理员资格，再在受控并发上限下调用 Auth Admin API 并标记 `search_incomplete`）。

---

### Milestone D2-M3：真实 GoTrue Auth、多 SaaS 会话与 Admin TOTP MFA 自动化验收脚本

编写自动化端到端验证脚本 `scripts/test-d2-auth-api-mfa.mjs`（使用 `@supabase/supabase-js` 与 `otplib` 或标准 TOTP 生成器直接对接本地 `http://127.0.0.1:55321`）：

1. **普通用户注册、邮箱确认与多 SaaS 隔离测试**：
   - 注册用户 U1 → 未确认邮箱前尝试登录或调用 `check_access` 被拒（I-23）。
   - 从本地 Inbucket API (`http://127.0.0.1:55324/api/v1/mailbox/...`) 提取确认链接/Token 完成邮箱验证 → 成功获取会话（无自动创建任何产品成员，I-01）。
   - 用两个独立内存客户端模拟 SaaS A 与 SaaS B 登录同一用户 U1 → 在客户端 A 执行 `signOut({ scope: 'local' })`，验证客户端 B 的 JWT 与刷新会话仍然有效（I-24）。
   - 检查真实 JWT `alg` 与项目密钥配置：非对称算法经 JWKS 校验，对称模式采用受信任的测试服务验签路径；始终检查 `iss`、`aud`、`exp`，不可向客户端暴露签名密钥。
2. **Admin TOTP MFA 全流程与安全负向测试（AUTH-P01 ~ P12）**：
   - 创建管理员候选用户 Admin1，通过受控运维 SQL 将其加入 `public.platform_admins`。
   - Admin1 仅使用邮箱+密码登录（此时 JWT `aal = 'aal1'`）：
     - 尝试读取 `public.product_memberships`（跨用户）、`public.redemption_codes`、`public.admin_audit_log` → 返回空集或 403。
     - 尝试调用 `admin_create_codes`、`admin_grant_entitlement`、`admin_lookup_users` → 100% 拒绝并返回 `ADMIN_REQUIRED`（I-26）。
   - Admin1 调用 `supabase.auth.mfa.enroll({ factorType: 'totp' })`，使用脚本计算当前 6 位 TOTP 验证码，调用 `challengeAndVerify` 升级会话，验证新 JWT payload 中 `aal === 'aal2'`。
   - 持 `aal2` JWT 重新调用上述管理读取与管理写 RPC → 全部成功，且验证在此期间**零额外 MFA 网络请求**。
   - **撤权与封禁即时生效测试**：创建第二名合格 `aal2` 管理员 Admin2，由 Admin2 调用 `admin_revoke_admin(Admin1)` → Admin1 手中尚未过期的 `aal2` JWT 立即再次调用管理列表或管理 RPC，验证 100% 被拒（I-26）。

---

### D2 安全边界补充

- **JWT / 错误码**：无效 JWT 可能在网关层即被拒绝，不能假定会执行 SQL RPC；PostgREST 自定义 SQLSTATE/响应状态需在当前版本实测，按契约区分预期业务拒绝 200 与身份/技术故障。
- **MFA**：旧 `aal2` access token 在移除因子或登出后可能持续有效至到期。正常管理撤权/blocked 应实时查数据库；失设备紧急撤权须测试会话撤销/`session_id` 检查等实际机制，不能将因子移除冒充即时令牌失效。
- **页面归属**：D2 负责认证契约与真实 HTTP 测试，正式认证回调页面在 D3 `apps/admin/` 实施；`auth.users` 查询必须走最小权限可信流程，不开放为客户端 Data API。

## 3. 阶段 D2 退出门禁清单（Exit Gate Checklist）

- [ ] 本地真实启用的 Supabase 服务健康运行，实际端口以 `supabase/config.toml` 为准，不借用其他项目容器。
- [ ] `scripts/test-d2-auth-api-mfa.mjs` 真实 HTTP + GoTrue JWT + TOTP `aal2` 自动化测试 100% PASS。
- [ ] `CheckAccess`（HTTP 200 + `allowed/reason`）、`RedeemCode`（HTTP 200 + `ok/code`）及普通写 RPC（401/403/409/422）的 HTTP 响应契约 100% 符合 `api-contract-and-mvp-acceptance.md`。
- [ ] `REV-DEC06-01` ~ `06` 管理员受限用户查询正负向与性能测试全部 PASS。
- [ ] 同步更新 `docs/Plans/aisencore-mvp/d2-auth-public-api-and-mfa.md` 验证记录与 `docs/Plans/TODO.md`。


---

## 4. 验证记录（Verification Log）

| 日期 | 命令或场景 | 退出码/结果 | 范围与限制 |
| --- | --- | --- | --- |
| 待执行 | 完整本地 Supabase 栈启动（`55321`~`55327`）与 JWKS / Inbucket 联调 | `NOT RUN` | 须在 D1 退出门禁 100% PASS 后执行 |
| 待执行 | `AUTH-P01` ~ `AUTH-P12` 真实 GoTrue JWT + TOTP `aal2` 正负向测试 | `NOT RUN` | 不得以 SQL `set_config` 模拟代替 |
| 待执行 | `REV-DEC06-01` ~ `06` 管理员受限用户查询安全与性能实测 | `NOT RUN` | 优先受保护 SQL RPC，不成立时自动回退受保护 Edge |
