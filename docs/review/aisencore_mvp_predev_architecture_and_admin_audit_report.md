> **历史审计报告，非现行开发指令（2026-10-23 更新）**：报告中的 Free v1/v2、`current_free_plan_id`、`products.free_features/free_limits`、公共 Pro 功能版本克隆、指定 Admin 页面线框及旧 UI-G0A 视觉硬门槛，均已被后续用户决定取代，不得据此恢复旧后端模型或约束正式 React-admin UI。现行后端职责以[轻量会员边界](../architecture/domains/membership-qualification-boundary.md)及 API/DB 合同为准；前端通用规范见[统一 Theme/UX](../architecture/applications/admin-ui-design-system.md)。报告正文只作历史意见追溯。

# AisenCore MVP 正式开发前架构与 Admin 前端设计深度审核报告

> **审查基线**：AisenCore 仓库全量 65 份需求、架构与实施设计文档（含 2026-10-22 `DEC-01` 至 `DEC-06` 全部采用推荐方案 A 后的最新架构合入基线）
> **审查范围**：后端架构（用户认证与跨端闭环、权益确认与兑换事务、并发锁序与物理 DDL、Supabase 免费额度极致优化）与 Admin 前端架构（全局底座与单产品控制关系、模块收敛、用户 360° 管理、关键高危交互设计、UI 设计系统落地与 `UI-G0A` 破局）

## 1. 架构演进基线评估与残留缺陷全景总览

AisenCore 作为面向多个独立 SaaS 产品（首发接入本地优先拉片产品 Aisenlens）的轻量公共底座，经过前期逻辑架构构建、D0 至 D4 实施设计、F01 至 F08 安全与幂等契约收敛，以及 2026-10-22 审查整改（`DEC-01` 至 `DEC-06` 全部确认采用推荐方案 A），已经在多产品身份共享、产品级独立成员与权益隔离、单事务受保护 PostgreSQL RPC 状态变更、自有高熵兑换码核销以及 Admin TOTP MFA 强制准入等核心领域建立了清晰的边界。现行文档体系将业务事实收敛于 `docs/spec/requirements.md` 与 `docs/architecture/` 五大分类目录（`domains`、`backend`、`database`、`applications`、`infrastructure`），有效避免了早期引入重型微服务、跨库分布式事务、通用 RBAC 引擎或公共 AI 网关等过度设计倾向。

然而，从“文档逻辑自洽”跨越到“正式编写首行 SQL 迁移脚本与初始化 `apps/admin` 前端工程”，现行文档体系仍存在一系列尚未暴露于静态链接检查的**物理实现断层、BaaS 免费配额隐性消耗陷阱、数据库 DDL 循环依赖，以及 Admin 前端架构在全局控制与单产品控制关系上的结构性失衡**。特别是在 `DEC-01` 至 `DEC-06` 拍板之后，部分新引入的架构规则（例如 `redeem_code(product_key, code)` 双参数前置成员校验、`products.current_free_plan_id` 版本指针、`DEC-02 A` 小体积 JSON 经 Supabase Edge Function 中转写入 Cloudflare R2、`DEC-05 A` 双模式人工直授强类型幂等比对、以及 `DEC-03 A` 三阶段 `UI-G0A/G0B/G3` 视觉签收门禁）与既有 D1/D2/D3/D3-UI 实施细节之间产生了新的局部冲突与工程卡点。

下表汇总了本次在全量审阅后识别出的 **16 项正式编码前必须闭环的设计缺陷与优化建议**（涵盖后端 `PREDEV-B01` 至 `PREDEV-B08` 共 8 项，Admin 前端 `PREDEV-A01` 至 `PREDEV-A08` 共 8 项）：

| 缺陷编号 | 所属维度与子域 | 严重度 | 核心缺陷摘要与潜在工程后果 | 涉及权威文档与计划 |
| :--- | :--- | :--- | :--- | :--- |
| **PREDEV-B01** | 后端：用户认证与跨端回调 | **P0** | Aisenlens 桌面端邮箱确认与密码重置依赖 Deep Link 候选方案，用户在手机端或异机浏览器点击邮件链接将直接失效，且自定义 URI Scheme 存在本机劫持风险 | `auth-and-multi-saas-sessions.md`、`aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md` |
| **PREDEV-B02** | 后端：Admin MFA 与会话安全 | **P1** | 多标签页重复调用 `signInWithPassword` 会用 `aal1` 覆盖本地 `aal2` 会话；`is_platform_admin()` 仅校验 JWT 声明，管理员撤权或丢失设备后旧 Token 在过期前仍可越权访问只读接口 | `aisencore-mvp-auth-entitlement-mfa-efficiency-design.md`、`platform-admin-and-account-lifecycle.md` |
| **PREDEV-B03** | 后端：多 SaaS 共享 Auth 路由 | **P2** | 单一 Supabase Auth 实例共享唯一下发邮件模板与默认 `Site URL`，缺少轻量静态认证中转路由规范，后续接入第二款产品时会出现邮件回跳错位 | `auth-and-multi-saas-sessions.md`、`requirements.md` |
| **PREDEV-B04** | 后端：权益确认与快照协议 | **P1** | `check_access(product_key, capability)` 按单能力查询设计与客户端聚合快照候选撕裂；若不合并返回全量有效 `features/limits` 快照，客户端启动将触发 N+1 次 RPC 调用 | `api-contract-and-mvp-acceptance.md`、`aisencore-mvp-auth-entitlement-mfa-efficiency-design.md` |
| **PREDEV-B05** | 后端：兑换核销与限流事务 | **P0** | `DEC-01` 规定 `left/suspended` 在查码前拒绝却仍计入 `redemption_rate_limits`，既无防枚举价值又误伤正常退出用户；`HTTP 200 ok=false` 若无严格写入隔离易提交脏数据 | `entitlements-and-redemption-constraints.md`、`rpc-security-and-locking-contract.md` |
| **PREDEV-B06** | 后端：人工直授幂等与续期计算 | **P0** | `DEC-05` 去除字节哈希后，`entitlement_grants` 缺少 `grant_mode` 与 `requested_duration_days` 物理列，无法对 `duration` 模式重试做 `IS NOT DISTINCT FROM` 比对；显式远期时段存在断档假续期漏洞 | `entitlements-and-redemption-constraints.md`、`candidate-architecture-and-acceptance-matrices.md` |
| **PREDEV-B07** | 后端：DDL 外键循环与锁序粒度 | **P0** | `products.current_free_plan_id` 与 `plans.product_id` 构成跨表双向复合外键，按 `M01→M02` 顺序建表必报语法错误；`L0` 全局管理排他锁未做读写分离，且 64-bit Advisory Lock 缺编码函数 | `aisencore-mvp-d1-database-implementation-design.md`、`rpc-security-and-locking-contract.md` |
| **PREDEV-B08** | 后端：Supabase 免费额度控制 | **P1** | `DEC-02 A` 经 Edge 中转备份 JSON 会双倍消耗 Supabase 5 GB 免费出站流量（Egress）；`redemption_rate_limits` 与审计表无自动修剪机制，逼近 500 MB 容量红线；缺 7 天防休眠机制 | `product-data-and-files.md`、`aisencore-mvp-baas-quota-security-lessons.md` |
| **PREDEV-A01** | Admin：全局与单产品控制关系 | **P0** | 导航与状态模型将“平台全局控制（封禁账号、停用产品、管理员任免）”与“单产品运营（Aisenlens 套餐、发码、成员暂停）”混杂平铺，极易引发跨产品误操作与爆炸半径混淆 | `admin-console.md`、`aisencore-mvp-d3-ui-admin-uiux-design.md` |
| **PREDEV-A02** | Admin：模块划分与信息架构 | **P1** | 机械按照 12 张数据库表 1:1 拆出 11 个顶层菜单模块（如独立的 `/restrictions`、`/codes`、`/redemptions`），导致单人运营高频任务被迫在多个割裂页面间复制粘贴 UUID | `aisencore-mvp-d3-admin-infrastructure-design.md`、`aisencore-mvp-d3-ui-admin-uiux-design.md` |
| **PREDEV-A03** | Admin：用户 360° 视图缺失 | **P1** | 用户身份、全局封禁、各产品成员状态、有效权益汇总、历史授权与兑换记录分散在 5 个独立模块，缺少一屏诊断用户“为何无法使用 Pro”的 360° 聚合详情页与准入模拟器 | `admin-console.md`、`aisencore-mvp-d3-ui-admin-uiux-design.md` |
| **PREDEV-A04** | Admin：DataProvider 邮箱关联 | **P1** | `DEC-06` 虽批准 `admin_lookup_users` SQL RPC，但未将其映射到 React-admin 标准 `dataProvider.getMany('users', { ids })`，导致 `<ReferenceField>` 无法自动批量补全列表邮箱 | `admin-console.md`、`api-contract-and-mvp-acceptance.md` |
| **PREDEV-A05** | Admin：发码一次性明文交互 | **P1** | 发码请求超时处于 `UNKNOWN` 状态时，刷新页面会丢失内存中的 `request_id`；确认明文丢失后需人工分 4 步先撤批再重发，缺少非秘密意图暂存与“一键作废并重发”复合交互 | `aisencore-mvp-d3-ui-admin-uiux-design.md`、`aisencore-f05-f08-contract-compatibility-readiness-design.md` |
| **PREDEV-A06** | Admin：套餐冻结与版本克隆 | **P2** | 套餐被码或授权引用冻结后，新建 `v2` 版本需从零手写 `features/limits` 原始 JSON，缺乏“一键克隆当前套餐为新版本”及结构化能力键值表单控件，极易因拼写错误导致客户端鉴权失灵 | `aisencore-mvp-d3-ui-admin-uiux-design.md`、`entitlements-and-redemption-constraints.md` |
| **PREDEV-A07** | Admin：人工直授三态防错交互 | **P1** | `DEC-05` 双模式人工直授若在同一表单混放天数与起止时间，操作员漏填 `ends_at` 易误发永久 Pro，且顺延模式缺少基于用户当前最远到期日的实时生效区间预览 | `aisencore-mvp-d3-ui-admin-uiux-design.md`、`billing-and-entitlements.md` |
| **PREDEV-A08** | Admin：UI 设计系统与 G0A 破局 | **P0** | `UI-G0A` 要求先签收 4 类高保真画面才允许写 `apps/admin` 代码，而候选规范尚未冻结精确 HEX 色值与排版参数，且部分线框残留冗余说明文字，违背 `AGENTS.md` 极简布局原则 | `admin-ui-design-system.md`、`admin-design-guide.md`、`AGENTS.md` |

## 2. 后端架构深度审查：用户认证、会话安全与多端协同

### 2.1 本地优先桌面端（Aisenlens）邮件验证与密码重置的跨端闭环缺陷（PREDEV-B01）

在 `docs/architecture/applications/auth-and-multi-saas-sessions.md` 与 `docs/Plans/aisencore-mvp/aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md` 第 4.1 节中，针对首发本地优先产品 Aisenlens 的身份认证设定为：复用公共 Supabase Auth 的“邮箱 + 密码”体系，强制开启 `Confirm Email = on`，未验证邮箱的账户无法获取有效会话；同时提出桌面客户端采用“系统浏览器 + 安全回跳（如受控 HTTPS 回调或 App Deep Link / PKCE）”作为登录与密码恢复的候选路径。

这一设计混淆了**桌面端 OAuth 授权码流程**与**邮箱密码原生认证流程**，在实际跨设备场景下会导致严重的可用性断裂与安全隐患：

1. **邮件点击设备与桌面客户端设备分离（Cross-Device Email Verification Breakdown）**：当用户在 Windows 或 macOS 桌面端打开 Aisenlens 注册账号或发起“忘记密码”时，Supabase Auth 发送的确认邮件或重置密码邮件极有可能被用户在**手机邮件客户端（iOS/Android）**或另一台电脑上点击打开。如果邮件的 `redirectTo` 配置为桌面端私有协议（如 `aisenlens://auth/callback`）或本机回环地址（`http://127.0.0.1:xxx`），用户在手机上点击邮件链接将直接提示“无法打开网页 / 未知协议”，导致注册激活与密码重置彻底失败。
2. **桌面端密码登录本无需浏览器跳转**：由于 MVP 首版明确仅采用“邮箱 + 密码”认证（不接入 Google/GitHub/微信等第三方 OAuth），Aisenlens 桌面端完全可以在应用原生界面内直接调用 [Supabase JavaScript SDK `signInWithPassword`](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) 与 `signUp` 接口，直接通过 HTTPS 与 Supabase Auth 通信获取 Access Token 与 Refresh Token，根本不需要唤起系统外部浏览器或注册操作系统自定义 URI Scheme。Custom URI Scheme 在桌面操作系统中缺乏包签名强绑定机制，任何本机恶意进程均可通过覆写注册表劫持 `aisenlens://` 回调中的一次性 `code` 或 Token。

**架构整改建议**：

- **桌面端原生直连登录 + 静态 Web 认证落地页（Auth Web Bridge）分离架构**：Aisenlens 客户端内部仅使用原生表单调用 `supabase.auth.signUp()` 与 `supabase.auth.signInWithPassword()`，彻底移除桌面端 Deep Link 回调依赖。
- **在 Cloudflare Pages 上托管极简公共认证中转路由**：利用已规划的 Cloudflare Pages 静态站点（可与 Admin 同源分路径，或挂载于统一身份子域），提供两个无需额外后端成本的纯静态页面：
  - `/auth/confirm`：作为注册确认邮件的统一 `redirectTo` 目标。用户无论在手机还是电脑浏览器点击确认链接，页面通过 Supabase Auth SDK 完成 token hash / PKCE 交换后，直接展示清晰的成功提示（“邮箱已验证成功，请返回 Aisenlens 客户端直接登录”）。
  - `/auth/reset-password`：作为密码找回邮件的统一 `redirectTo` 目标。用户在任意设备的浏览器中点击邮件链接后，直接在该静态网页内输入新密码并调用 `supabase.auth.updateUser({ password })` 完成重置，随后返回 Aisenlens 客户端使用新密码登录。

### 2.2 Admin TOTP MFA 会话生命周期、多标签页降级与撤权时间窗缺陷（PREDEV-B02）

根据 `docs/Plans/aisencore-mvp/aisencore-mvp-auth-entitlement-mfa-efficiency-design.md` 第 4 节与 `docs/architecture/domains/platform-admin-and-account-lifecycle.md`，Admin 后台强制要求管理员通过 [Supabase Auth TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp) 升级至 `aal2`，且为了节省请求量，在有效会话期间由 PostgreSQL 的 `private.is_platform_admin()` 直接检查当前请求 JWT 中的 `(auth.jwt() ->> 'aal') = 'aal2'` 结合 `platform_admins.active = true` 与非 `blocked` 状态。这一机制在常规路径下兼顾了安全与性能，但在以下三个边界场景存在设计漏洞：

1. **多标签页或多实例下的 `aal1` 会话覆写降级**：Supabase JS SDK 默认将当前会话存储在浏览器同源 `localStorage` 的同一键名下。当管理员在标签页 A 已完成 TOTP 验证处于 `aal2` 状态时，若因会话临近过期在标签页 B 重新触发了 `signInWithPassword()`，但尚未完成标签页 B 的 TOTP 输入，GoTrue 会立即签发一张新的 `aal1` JWT 并覆写 `localStorage`；此时标签页 A 通过 `onAuthStateChange` 同步到新的 `aal1` 令牌，正在填写的套餐或发码表单一旦提交就会突遭后端 `403 ADMIN_REQUIRED` 拒绝。
2. **TOTP 因子紧急重置后的 JWT 残余有效期漏洞（A-04 延伸）**：在单人运营场景下，若管理员手机遗失或怀疑 TOTP 泄露，按照 `A-04` 预案在服务端重置 `auth.mfa_factors` 并吊销 `auth.sessions`。然而，PostgREST 在验证请求时**仅做无状态 JWT 签名与 `exp` 校验，不查询 `auth.sessions` 表是否已被删除**。如果攻击者已截获一张处于有效期内的 `aal2` Access Token（Supabase 默认 `jwt_expiry` 为 3600 秒即 1 小时），而该管理员账号在 `platform_admins` 中仍为 `active = true`（因为 M1 规则禁止将最后一名管理员设为 `inactive` 或 `blocked`！），那么即使服务端删除了所有会话与 MFA 因子，攻击者在整整 1 小时内依然可以凭旧 `aal2` JWT 读写所有管理 RPC！
3. **`authProvider.checkAuth` 缓存与静默刷新竞态**：当 Access Token 过期触发 SDK 后台 `refreshSession()` 时，若网络抖动导致刷新尚未返回而 React-admin 率先发起列表请求，旧过期 JWT 会触发 `401`；若 `authProvider.checkError` 直接清空状态跳转 `/login`，会打断管理员正在编辑的长表单。

**架构整改建议**：

- **在 `platform_admins` 表增加 `min_valid_iat timestamptz NOT NULL DEFAULT transaction_timestamp()` 字段**：在 `private.is_platform_admin()` 函数中，除了检查 `active = true`、未 `blocked` 以及 `(auth.jwt() ->> 'aal') = 'aal2'` 外，增加一行签发时间比对。当发生设备遗失、重置 TOTP 因子或怀疑 Token 泄露时，只需更新 `min_valid_iat = transaction_timestamp()`，即可在**不违反 M1 最后一名管理员非零约束**的前提下，使此前签发的所有旧 `aal2` JWT **毫秒级全局失效**：

```sql
CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins AS pa
    WHERE pa.user_id = (SELECT auth.uid())
      AND pa.active = true
      AND ((SELECT auth.jwt()) ->> 'aal') = 'aal2'
      AND pg_catalog.to_timestamp((((SELECT auth.jwt()) ->> 'iat')::bigint)) >= pa.min_valid_iat
      AND NOT EXISTS (
        SELECT 1
        FROM public.platform_account_restrictions AS par
        WHERE par.user_id = pa.user_id
          AND par.kind = 'blocked'
      )
  );
$$;
```

- **缩短项目 JWT 有效期并隔离未完成 MFA 的临时态**：在 Supabase Auth 配置中将 Access Token 有效期（`jwt_expiry`）从默认的 3600 秒缩短至 **900 秒（15 分钟）**（SDK 会在后台利用 Refresh Token 自动静默续期 `aal2` 会话，用户体验零打扰，但跨系统 Edge/R2 的 TOCTOU 窗口缩短 75%）。同时在 Admin 登录页发现当前已有 `aal2` 有效会话时，直接重定向进入后台，避免重复执行 `signInWithPassword` 将 `aal2` 降级回 `aal1`。

### 2.3 单一 Supabase Auth 实例下多 SaaS 的邮件路由与回调白名单治理（PREDEV-B03）

`docs/architecture/applications/auth-and-multi-saas-sessions.md` 第 5 节指出，所有独立 SaaS 共用同一个 Supabase Auth Project，因此共用同一套 `Site URL`、Redirect Allowlist 与邮件模板。但在具体设计中，尚未规定邮件模板如何动态适配不同产品。

如果 Supabase 邮件模板中使用默认的 `{{ .SiteURL }}` 构造链接，那么无论用户是在 Aisenlens 还是未来的云端 SaaS 产品 B 中触发注册或找回密码，邮件链接都会跳回单一的 `Site URL`。为此，必须在 D3 基础设施配置中明确：**所有 Supabase Auth 邮件模板（Confirm Signup、Reset Password）统一使用 `{{ .RedirectTo }}` 变量而非硬编码 `{{ .SiteURL }}`**，并在客户端调用 `signUp` 或 `resetPasswordForEmail` 时显式传入经白名单校验的完整回调 URL（如 `https://auth.aisen.com/auth/confirm?product=aisenlens`），由统一的静态认证落地页根据 `product` 查询参数渲染对应的产品名称与返回指引。

## 3. 后端架构深度审查：权益确认、兑换核销、并发锁序与物理 DDL

### 3.1 `check_access` 单能力查询与全量权益快照的协议合并（PREDEV-B04）

审视 `docs/architecture/backend/api-contract-and-mvp-acceptance.md` 第 1、3 节与 `docs/Plans/aisencore-mvp/aisencore-mvp-auth-entitlement-mfa-efficiency-design.md` 第 3.2 节，可以发现当前设计在“单能力校验”与“聚合快照”之间存在明显的协议割裂：

- 正式契约将准入接口定义为 `check_access(product_key text, capability text DEFAULT NULL)`：当不传 `capability` 时仅判断成员准入；当传入单个 `capability` 时，若为功能开关则返回布尔允许性，若为额度键则返回该单项的 `limit` 上限。
- 与此同时，性能设计文档（`aisencore-mvp-auth-entitlement-mfa-efficiency-design.md`）意识到 Aisenlens 客户端在启动或进入工作台时，需要同时获知 `ai.analysis`、`video.export.no_watermark`、`backup.config` 等多个布尔开关以及备份容量、版本数量等多个 `limits` 配额，于是提出了一个“可选独立只读聚合权益接口候选”，但又声明“未批准替代原 RPC，初期继续使用现有 `check_access`”。

**设计缺陷分析**：在 PostgreSQL 内部执行一次 `check_access('aisenlens', 'ai.analysis')` 时，数据库函数已经完成了 `platform_account_restrictions`、`products`、`product_memberships`、`products.current_free_plan_id` 以及该用户在该产品下所有有效 `entitlement_grants` 关联 `plans` 的读取与 JSONB 聚合计算。如果因为接口只返回单个 `capability` 的结果，迫使客户端为了渲染 UI 连续发起 N 次 `check_access` 调用，不仅白白放大了网络往返延迟与数据库 CPU 消耗，还增加了客户端 `single-flight` 缓存键的管理复杂度。

| 方案对比维度 | 现行分离方案（单 `capability` 返回 + 未批准候选快照） | 推荐统一方案（`check_access` 原生返回全量有效快照 + 可选单项断言） |
| :--- | :--- | :--- |
| **客户端启动请求次数** | 需调 1 次 `ensure/get_my_products` + 3～5 次按 capability 的 `check_access` | **仅需 1 次 RPC**（且 `ensure_membership` 与 `redeem_code` 成功时可直接内联返回该快照） |
| **数据库单次查询成本** | 每次调用均需扫描同一组 `memberships + grants + plans` 行，重复消耗 CPU | **0 额外 I/O 开销**：一次扫描在内存中合并出完整 `features[]` 与 `limits{}` |
| **客户端本地缓存结构** | 需按 `(user_id, product_key, capability)` 维护碎片化缓存，极易部分不一致 | 按 `(user_id, product_key)` 维护**单一原子快照对象**，15 分钟窗口内本地内存查表 |
| **API 契约向后兼容性** | 未来若新增聚合接口需维护两套只读准入 RPC | **100% 兼容现行契约**：保留 `capability DEFAULT NULL` 形参，响应固定附带完整快照 |

**架构整改建议**：

1. **将全量产品权益快照正式并入 `check_access(product_key text, capability text DEFAULT NULL)` 的标准返回体**：无论调用方是否传入 `capability`，只要成员准入通过，`check_access` 始终在一次数据库调用中返回该用户在目标产品下合并后的完整 `features`（字符串数组）、完整 `limits`（键值数值对象）、`current_period_ends_at`、`effective_ends_at` 与 `is_lifetime`。当调用方显式传入 `capability` 时，`allowed` 与顶层 `limit` 针对该具体能力给出布尔判定（供轻量 Edge Function 服务端鉴权直接使用）；当 `capability IS NULL` 时，`allowed` 代表产品成员准入通过，客户端直接缓存返回的完整 `entitlement` 快照对象：

```json
{
  "allowed": true,
  "reason": "OK",
  "product_status": "active",
  "membership_status": "active",
  "evaluated_at": "2026-10-22T10:30:00Z",
  "entitlement": {
    "active_plan_keys": ["free", "pro_365d"],
    "features": ["ai.analysis", "video.export.no_watermark", "backup.config"],
    "limits": {
      "backup.max_bytes": 262144,
      "backup.max_versions": 10
    },
    "is_lifetime": false,
    "current_period_ends_at": "2027-10-22T10:30:00Z",
    "effective_ends_at": "2027-10-22T10:30:00Z"
  }
}
```

2. **在 `ensure_membership` 与 `redeem_code` 成功响应中顺带返回最新权益快照（Piggybacked Entitlement Snapshot）**：当用户在 Aisenlens 客户端首次触发 `ensure_membership('aisenlens')` 或成功调用 `redeem_code('aisenlens', code)` 时，事务末尾直接调用内部只读计算函数并将最新 `entitlement` 快照嵌入返回 JSON 中，使客户端在入会或核销成功后**零额外网络请求**即可刷新本地权益缓存。

### 3.2 `DEC-01` 兑换前置成员校验与 `redemption_rate_limits` 计数的逻辑矛盾（PREDEV-B05）

在 2026-10-22 批准 `DEC-01 A` 后，`docs/architecture/database/entitlements-and-redemption-constraints.md` 第 2.1 节与 `docs/architecture/backend/api-contract-and-mvp-acceptance.md` 第 2.1 节将 `redeem_code(product_key, code)` 的执行顺序修订为：

> “以 `auth.uid()` 验证身份，在统一 F02 L0～L8 长期事务锁合同中先取目标本人 L1 并排除 blocked、L2 失败限流锁；按不可信声明 `product_key` 先取得 L3 产品锁并验证产品，再取 L5 已有成员锁；**left/suspended 不接触码表即一致拒绝并计入本人失败窗口** → 对 none/active 才规范化哈希、非锁定定位码 ID……”

这一修订虽然成功消除了 `B-01` 侧信道漏洞（因为 `left/suspended` 分支完全不读取 `redemption_codes` 表，攻击者无法利用成员状态差异探测某个兑换码是否真实存在），但规定**“left/suspended 不接触码表即一致拒绝并计入本人失败窗口”**却引发了两个新的设计缺陷：

1. **安全目的与限流惩罚对象错位**：`redemption_rate_limits`（每用户滚动 15 分钟最多 10 次失败）的唯一设计目的是**防止攻击者暴力枚举猜测 `redemption_codes` 表中的 `code_hash`**。既然在 `DEC-01 A` 下，当用户在目标产品处于 `left`（主动退出）或 `suspended`（成员暂停）时，数据库函数**根本没有查询 `redemption_codes` 表**，该请求对兑换码字典没有任何枚举能力。此时若将其计入 10 次失败限流，一个曾主动退出产品、后来购买了正版兑换码却忘记先点“重新加入产品（Rejoin）”的正常用户，在尝试点击兑换或客户端重试几次后就会被打入 `RATE_LIMITED` 锁定 15 分钟，即使其随后点击了 `rejoin_product` 恢复为 `active`，依然无法兑换手中的合法兑换码！
2. **`HTTP 200 ok=false` 正常返回路径下的事务脏写风险**：为了将失败时间戳写入 `redemption_rate_limits` 并持久化，设计规定 `redeem_code` 的预期业务拒绝不抛出 SQL 异常，而是正常返回 `HTTP 200 {"ok": false, "code": "..."}`。在 PostgreSQL 函数中，正常 `RETURN` 意味着**当前事务中执行过的所有 `INSERT/UPDATE/DELETE` 都会被正式 `COMMIT`**。如果未来开发者在编写或维护 `private.redeem_code_core` 时，在任何一个业务检查点之前误写了状态变更语句，正常返回 `ok=false` 将直接导致半成品脏数据落库。

**架构整改建议**：

- **精确界定 `redemption_rate_limits` 的触发边界**：仅当请求通过了 `blocked`、产品 `active` 以及成员状态 `none/active` 校验，**真正进入 `redemption_codes` 表查询且判定为不可兑换（码不存在、跨产品、已撤销、已过期、已用尽）**时，才向 `redemption_rate_limits.failed_at` 追加当前时间戳。对于查码之前的 `ACCOUNT_RESTRICTED`、`PRODUCT_UNAVAILABLE`、`MEMBERSHIP_LEFT`、`MEMBERSHIP_SUSPENDED` 以及本人重复兑换 `REDEEM_ALREADY_USED`，由于完全不构成码枚举攻击，一律直接返回对应 `ok=false, code=...`，**不消耗用户的 10 次核销试错配额**。
- **在 `private.redeem_code_core` 中实施严格的“只读校验前置 + 单点失败记账 + 末尾原子写入”三段式结构**：
  - **阶段一（纯加锁与只读验证，零业务表 DML）**：按 `L1 → L2 → L3 → L5` 顺序加锁并校验账号、限流阈值、产品与成员状态；若拦截则直接 `RETURN`（仅保存 `L2` 对已过期超过 15 分钟旧时间戳的修剪，不新增失败项）。随后按 `L6 → L7` 锁码并校验本人已兑、码归属与有效性；若码无效，调用唯一辅助语句记录本次失败时间戳并立即 `RETURN jsonb_build_object('ok', false, 'code', 'REDEEM_CODE_INVALID')`。
  - **阶段二（L8 纯写入提交阶段）**：仅当阶段一 100% 校验通过后，才在函数末尾连续执行 `INSERT product_memberships`（若 `none`）、`INSERT membership_events`、`INSERT entitlement_grants`、`INSERT redemptions`、`UPDATE redemption_codes` 以及清理 `DELETE FROM redemption_rate_limits WHERE user_id = v_user_id`。阶段二任何一句触发约束违例或异常，直接向上抛出 SQL Exception，由 PostgreSQL 自动回滚整笔事务。

### 3.3 `DEC-05` 双模式人工直授的强类型幂等列缺失与续期断档漏洞（PREDEV-B06）

在 `docs/Plans/20261022-review-remediation/owner-batch-decisions.md` 与 `docs/architecture/database/entitlements-and-redemption-constraints.md` 第 1.2、2.1 节中，`DEC-05 A` 批准了两个关键变更：一是将管理员人工直授 `admin_grant_entitlement` 拆分为互斥的 `mode = 'duration'`（按正整数 `duration_days` 自动顺延）与 `mode = 'explicit_window'`（显式传入 `starts_at` 与 `ends_at`，明确 `null` 才代表永久）；二是优先使用强类型持久化列进行 `IS NOT DISTINCT FROM` 幂等比对，以消除 `entitlement_grants` 表上导致普通客户端 `select=*` 报 `42501 permission denied` 的隐藏列 `admin_request_fingerprint bytea(32)`。

然而，对照 `docs/Plans/aisencore-mvp/aisencore-mvp-d1-database-implementation-design.md` 第 2.2 节中 `public.entitlement_grants` 的物理列定义，当前表结构**根本无法支撑 `DEC-05 A` 的无指纹强类型幂等比对**，同时在 `effective_ends_at` 连续周期计算上存在断档漏洞：

1. **缺少 `grant_mode` 与 `requested_duration_days` 物理列导致 `duration` 模式重试必然冲突**：在现有 `entitlement_grants` 表中，只存储了计算后的结果列 `starts_at` 和 `ends_at`，没有存储管理员调用 RPC 时的输入模式 `mode` 和请求天数 `duration_days`。假设管理员以 `request_id = R1, mode = 'duration', duration_days = 30` 发起请求，服务端在 `t0` 时刻计算出 `starts_at = t0, ends_at = t0 + 30d` 并落库，但响应因网络超时丢失。3 秒后（`t1` 时刻）客户端使用相同 `request_id = R1` 重试：此时数据库命中 `UNIQUE(source_type, source_ref)`，若不存储首次请求的 `grant_mode = 'duration'` 与 `requested_duration_days = 30`，服务端如果用 `t1` 重新计算 `starts_at = t1` 去和已落库的 `starts_at = t0` 比对，会因 3 秒时钟差误判为“同键异参”抛出 `409 STATE_CONFLICT`；反之，若不比对时间参数，又无法拦截管理员用同一 `request_id` 把 30 天改成 365 天的冲突请求！
2. **`explicit_window` 远期排期造成的“假连续续期（Disconnected Future Grant）”漏洞**：`billing-and-entitlements.md` 第 3 节规定，周期续期计算 `starts_at = max(now(), 同用户同套餐未来最晚的非撤销周期 ends_at)`，且 `CheckAccess` 返回 `effective_ends_at`（“在未撤销、已确认、可连续衔接的同套餐未来授权链上最远的截止”）。然而，`explicit_window` 模式允许管理员手动指定任意未来的 `starts_at` 和 `ends_at`。假设用户当前有一笔明天到期的 Pro 授权（`ends_at = D+1`），管理员通过 `explicit_window` 为其预发了一笔下个月某活动期间的 7 天授权（`starts_at = D+30, ends_at = D+37`），中间存在 29 天的断档（Gap）。此时：
   - 如果 `CheckAccess` 用简单的 `MAX(ends_at) WHERE revoked_at IS NULL AND ends_at > now()` 计算 `effective_ends_at`，用户在明天之后就会看到“有效截止至 `D+37`”但实际上从 `D+1` 到 `D+30` 没有任何 Pro 权限！
   - 更严重的是，如果用户在 `D+2` 兑换了一张 30 天充值码，续期算法 `starts_at = max(now(), latest_unrevoked_ends_at)` 会直接从 `D+37` 开始顺延到 `D+67`，导致用户刚刚充值的 30 天兑换码要等一个月后才生效，而眼前的 `D+2` 至 `D+30` 依然无法使用 Pro！

**架构整改建议**：

- **在 `public.entitlement_grants` 表直接新增两个非敏感、对本人与管理员均可安全读取的强类型列**：

```sql
ALTER TABLE public.entitlement_grants
  ADD COLUMN grant_mode text NOT NULL DEFAULT 'duration'
    CHECK (grant_mode IN ('duration', 'explicit_window')),
  ADD COLUMN requested_duration_days integer NULL
    CHECK (requested_duration_days IS NULL OR requested_duration_days > 0),
  ADD CONSTRAINT entitlement_grants_mode_consistency_chk CHECK (
    (grant_mode = 'duration' AND requested_duration_days IS NOT NULL AND ends_at IS NOT NULL)
    OR
    (grant_mode = 'explicit_window' AND requested_duration_days IS NULL)
  );
```

- **彻底删除 `admin_request_fingerprint bytea` 隐藏列**：由于 `grant_mode`、`requested_duration_days`、`product_id`、`plan_id`、`user_id`、`revoke_reason` 等均不含任何秘密或哈希，可直接在 `entitlement_grants` 上恢复干净的**表级 `GRANT SELECT ON TABLE public.entitlement_grants TO authenticated`**（由 RLS 控制本人只看 `user_id = auth.uid()`），彻底根除 `select=*` 触发 `42501` 错误的隐患！
  - 当 `admin_grant_entitlement` 命中相同的 `source_ref = 'admin:' || actor_uid || ':' || request_id` 时：
    - 若原记录 `grant_mode = 'duration'`，只需用 `IS NOT DISTINCT FROM` 比对 `(user_id, product_id, plan_id, grant_mode, requested_duration_days, btrim(reason))` 是否完全一致；一致则直接返回原记录已持久化的 `starts_at` 和 `ends_at`，完全不受重试时的时钟偏移影响！
    - 若原记录 `grant_mode = 'explicit_window'`，则比对 `(user_id, product_id, plan_id, grant_mode, starts_at, ends_at, btrim(reason))` 是否完全一致。
- **收敛 `explicit_window` 的起点约束以消除周期断档**：在 MVP 阶段，规定 `admin_grant_entitlement` 的 `explicit_window` 模式仅用于“立即生效或衔接当前有效周期的指定截止日授权”（即校验 `starts_at <= max(transaction_timestamp(), COALESCE(current_contiguous_ends_at, transaction_timestamp()))`），禁止创建与当前有效期之间存在空窗断档的远期孤岛授权。这样既满足了管理员指定具体到期日（如“统一授权至 2026-12-31 23:59:59”）和永久授权（`starts_at = now(), ends_at = NULL`）的全部运营需求，又保证了同一用户同一套餐下所有未过期授权在时间轴上**严格连续无断档**，使 SQL 层只需一次简单的 `MAX(ends_at)` 索引查询即可 100% 精确得出 `effective_ends_at` 和顺延起点！

### 3.4 `F02` 事务锁总序优化：`L0` 读写锁分离、64-bit Advisory Lock 编码与循环外键死锁修复（PREDEV-B07）

在 `docs/architecture/database/rpc-security-and-locking-contract.md` 与 `docs/Plans/aisencore-mvp/aisencore-mvp-d1-database-implementation-design.md` 中，存在三处直接影响 DDL 编译与并发吞吐的底层设计缺陷：

1. **`products` 与 `plans` 的双向复合外键循环依赖导致 `M01/M02` 迁移脚本无法编译**：
   - `DEC-04 A` 在 `public.products` 表新增了 `current_free_plan_id uuid NULL`，并要求通过复合外键 `(current_free_plan_id, id) REFERENCES public.plans(id, product_id)` 保证其只能指向同产品的套餐。
   - 然而，在 D1 第 6.1 节的迁移顺序中，`M01` 先创建 `products` 表，`M02` 才创建 `plans` 表（且 `plans.product_id REFERENCES public.products(id)`）。在执行 `M01` 时 `public.plans` 尚不存在，直接在 `CREATE TABLE public.products` 中声明该外键会立即导致 PostgreSQL 报错 `relation "public.plans" does not exist`！
   - 此外，即使建表成功，如果外键不是延迟约束（`DEFERRABLE`），任何尝试在同一事务中创建产品并初始化其默认 Free 套餐的操作都会遇到外键先后顺序卡点。
2. **`L0` 全平台管理排他锁（Global Exclusive Mutex）的不必要串行阻塞**：
   - `rpc-security-and-locking-contract.md` 第 2.2 节坚持要求**所有 12 个管理写 RPC**（包括日常高频的 `admin_create_codes`、`admin_grant_entitlement`、`admin_upsert_plan`）在入口处一律获取**全局排他锁 `L0`**。
   - 事实上，引入 `L0` 的唯一安全理由是保障 **M1 不变量**（防止管理员 A 在执行写操作的同时被管理员 B 撤销权限或封禁，以及防止两名管理员并发互撤导致合格管理员归零）。这是一个典型的**读者-写者问题（Reader-Writer Lock）**：只有改变管理员可用资格集合的操作（`admin_revoke_admin`、`admin_grant_admin`、`admin_block_account`、`admin_unblock_account`）是“写者”，需要获取排他锁 `pg_advisory_xact_lock`；而其余所有常规管理写操作（发码、改套餐、发授权、暂停成员）只是“读者”（要求操作期间当前管理员资格不被撤销），只需获取**共享事务锁 `pg_advisory_xact_lock_shared`**！PostgreSQL 原生支持事务级共享咨询锁，改为读写锁分离仅需改动一个函数名，即可在 100% 保持 M1 串行安全的前提下解除常规管理操作之间的全局互斥阻塞。
3. **`L0 / L1 / L7` Advisory Lock 缺少确定性双 `int4` 命名空间编码函数**：
   - `rpc-security-and-locking-contract.md` 第 2.1 节承认：“L0、L1、L7 的 advisory lock 编码必须在物理 DDL/RPC 实现中明确固定 namespace、类 ID、UUID 的编码/哈希算法”。若留到写代码时由开发者临场发挥，极易混用单 `bigint` 与双 `int4` 重载函数导致锁空间交叉。

**架构整改建议**：

- **固化 `private` Schema 下的双 `int4` 咨询锁辅助函数规格**：利用 [PostgreSQL Advisory Locks](https://www.google.com/search?q=https://www.postgresql.org/docs/current/explicit-locking.html%23ADVISORY-LOCKS) 的 `pg_advisory_xact_lock(key1 int4, key2 int4)` 双参数重载形式，将 `key1` 固定为锁层级常量（`0` = L0 管理锁，`1` = L1 账号锁，`7` = L7 用户套餐续期锁），将 `key2` 固定为基于 `hashtext()` 的 32-bit 确定性整数哈希：

```sql
-- L0 管理写入口锁：p_exclusive = true 仅用于 grant/revoke_admin 与 block/unblock_account
CREATE OR REPLACE FUNCTION private.acquire_l0_admin_lock(p_exclusive boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_exclusive THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(0, 1);
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(0, 1);
  END IF;

  IF NOT private.is_platform_admin() THEN
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = '{"code":"ADMIN_REQUIRED","message":"Active MFA admin required"}',
      DETAIL = '{"status":403}';
  END IF;
END;
$$;

-- L1 目标账户事务锁（确保不存在 restriction 行时也能串行化封禁与入会/兑换）
CREATE OR REPLACE FUNCTION private.acquire_l1_account_lock(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(1, pg_catalog.hashtext(p_user_id::text));
$$;

-- L7 用户+套餐续期计算锁
CREATE OR REPLACE FUNCTION private.acquire_l7_user_plan_lock(p_user_id uuid, p_plan_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(
    7,
    pg_catalog.hashtext(p_user_id::text || ':' || p_plan_id::text)
  );
$$;
```

- **修正 `M01/M02` 迁移 DAG 中的双向外键声明顺序**：
  - 在 `M01` 创建 `public.products` 时，仅定义 `current_free_plan_id uuid NULL` 列（暂不挂外键约束）。
  - 在 `M02` 创建 `public.plans`（含 `plan_family text NOT NULL DEFAULT 'pro' CHECK (plan_family IN ('free', 'pro'))` 与 `UNIQUE (id, product_id)`）之后，在 `M02` 末尾通过 `ALTER TABLE public.products ADD CONSTRAINT products_current_free_plan_fk FOREIGN KEY (current_free_plan_id, id) REFERENCES public.plans(id, product_id) DEFERRABLE INITIALLY DEFERRED;` 补齐双向约束，并在 `admin_set_default_free_plan` RPC 中强制校验目标套餐的 `plan_family = 'free'`。

## 4. 后端架构深度审查：节省 Supabase 免费额度与 BaaS 成本控制

用户特别关注如何在 MVP 阶段最大化节省 **Supabase Free Tier** 的免费额度。根据 [Supabase 官方定价与配额说明](https://supabase.com/pricing)，Free 计划的核心硬性上限并非 Data API 请求次数（官方标称 Unlimited API Requests），而是以下五项稀缺物理资源：**500 MB 数据库存储空间**、**5 GB 数据库/Edge 出站流量（Egress）**、**500,000 次/月 Edge Function 调用**、**Nano 级共享 CPU 与 500 MB 内存**，以及 **7 天无活动自动暂停实例（Inactivity Pause）**。现行文档虽在 `aisencore-mvp-auth-entitlement-mfa-efficiency-design.md` 中限制了 `auth.getUser()` 的滥用，但在存储膨胀、中转流量与查询开销上仍存在 4 个显著的额度消耗漏洞（**PREDEV-B08**）。

### 4.1 `DEC-02 A` Edge 中转配置备份引发的双倍流量消耗与去重缺失

在 `DEC-02 A` 批准后，Aisenlens 的非敏感配置/模板 JSON 备份改为“客户端上传至 Supabase Edge Function → Edge 校验白名单与 SHA-256 → Edge 调用 R2 SDK 写入 Cloudflare R2 final 对象”。

**额度隐患分析**：
1. 当客户端向 Supabase Edge Function 发送 200 KB 的配置 JSON，Edge Function 再将该 200 KB 数据通过 S3 PutObject 发送给 Cloudflare R2 时，Edge Function 向外网（Cloudflare R2）发起的请求与响应在 Supabase 计费系统中会被统计入出站带宽开销，且每次备份消耗 1 次 Edge Function 额度与宝贵的 Deno Isolate CPU 时间（若解析大型 JSON Schema 极易触发 Free Tier 的 2 秒 CPU 时间软限制）。
2. 如果用户在 Aisenlens 客户端频繁点击“备份配置”，而两次点击之间配置内容并未发生实质变化（或仅改变了一个无意义的时间戳字段），现行设计仍会每次生成新的 `final_key`、上传 R2 并插入一条新的数据库记录，快速耗尽额度与版本槽位。
3. 关于 Aisenlens 备份元数据表（`aisenlens_backups`）的物理位置，D3 第 4.3 节仍留有“同 Project 独立 Schema 或另一个独立数据库/Project”的摇摆。由于每个 Supabase 账号（Organization）最多只能创建 **2 个免费项目（Free Projects）**（一个用于 `dev/staging`，一个用于 `prod`），绝不能为 Aisenlens 备份元数据单独再开第三个 Supabase Project！

**节省额度整改建议**：
- **客户端预计算内容哈希与零流量短路去重（Content-Hash Deduplication）**：客户端在序列化白名单配置 JSON（按固定键序 canonicalize，剔除易变本地时间戳）后，先在本地计算 `content_sha256`。在上传请求头或轻量预检中携带 `X-Content-SHA256`；若服务端检查该用户在当前配置类别下最新一条 `ready` 备份的 `final_content_digest` 与之完全一致，直接返回 `HTTP 200 {"status": "unchanged", "backup_id": "..."}`，**跳过 R2 写入与新行插入，实现 0 R2 写入、0 额外数据库行增长**。
- **强制 Gzip 压缩传输与严格体积上限（≤ 64 KB 压缩后 / 128 KB 原文）**：配置与拉片模板纯文本在 Gzip 压缩后通常不足 5～15 KB。Edge Function 验完 JSON 白名单后，在内存中将其 Gzip 压缩后再写入 R2（设置 `Content-Encoding: gzip`），可将 Edge → R2 的传输体积与 R2 存储占用直接压缩 **80%～90%**。
- **明确备份元数据落点为同一 Supabase Project 下的受保护表**：在 MVP 阶段，直接将备份元数据表 `public.aisenlens_backups` 建在同一个 Supabase PostgreSQL 实例中。这样 Edge Function 仅需调一次本库 RPC 即可完成“身份/Pro 权益校验 + 配额 `ready + unexpired pending` 核算 + 幂等落账”，避免跨库网络请求与额外免费项目名额消耗。

### 4.2 数据库 500 MB 容量红线防御：限流表自清理、精简审计与 `pg_cron` 维护

Supabase Free Tier 的 **500 MB 数据库空间**一旦写满，整个项目将自动进入只读模式（Read-Only Mode），导致所有发码、兑换、入会全部瘫痪。现行 D1 设计中存在三个只增不减的膨胀源：

1. **`redemption_rate_limits` 死行堆积**：每次有用户输入错误兑换码就会插入一行 `redemption_rate_limits(user_id, failed_at timestamptz[])`。虽然同一用户下次输错时会修剪 15 分钟前的时间戳，但对于输错一两次后成功兑换、或再也不尝试兑换的广大用户，这些行将永久残留在表和主键索引中。
2. **`admin_audit_log` 全量 `before/after` JSONB 快照膨胀**：若每次修改套餐或批量撤销 100 张兑换码都在 `before` 和 `after` 中完整拷贝整行或整批 JSONB，单条审计记录就可能高达数 KB 至数十 KB。
3. **过期 `pending` 备份记录与历史日志堆积**：断网遗留的 `pending` 备份预留行虽在查询时按 `expires_at > now()` 逻辑忽略，但物理行始终占据表空间。

**节省额度整改建议**：

- **在 `redeem_code` 成功分支内联删除限流行（Inline Self-Cleaning）**：当用户在 `redeem_code` 中核销成功时，或当修剪 15 分钟窗口后 `failed_at` 数组为空时，直接在同事务内执行 `DELETE FROM public.redemption_rate_limits WHERE user_id = v_user_id;`，使 `redemption_rate_limits` 表在常态下保持近乎 **0 行**的极小体积（常驻内存 Buffer Hit 100%）。
- **审计日志仅存增量变更字段（Diff-Only Audit Payload）**：在各管理 RPC 写入 `admin_audit_log` 时，`before` 与 `after` 仅记录实际发生变化的字段键值对（如 `{"status": "active"}` → `{"status": "suspended"}`）；对于批量发码/批量撤码，仅记录 `{ "batch_id": "...", "affected_count": 50 }`，严禁将 100 条子记录明细塞入 JSONB。
- **启用 Supabase 原生免费的 `pg_cron` 扩展执行每日瘦身任务**：Supabase Free Tier 原生预装 `pg_cron`，无需外部服务器或消耗 Edge Function 额度即可在数据库内部定时执行清理 SQL：

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 每 30 分钟清理已过 15 分钟限流窗口的残留限流行，保持表体积趋近于 0
SELECT cron.schedule(
  'cleanup-expired-redemption-rate-limits',
  '*/30 * * * *',
  $$DELETE FROM public.redemption_rate_limits WHERE updated_at < now() - interval '15 minutes';$$
);
```

### 4.3 PostgREST 流量、连接池与 7 天防休眠（Keep-Alive）全方位优化对比

下表汇总了针对 Supabase Free Tier 各计费维度的具体架构优化措施及其量化节省效果：

| Supabase 免费资源维度 | 免费额度硬上限 | 现行架构潜在浪费点 | 推荐架构级优化手段 | 预期节省效果与收益 |
| :--- | :--- | :--- | :--- | :--- |
| **Auth API 请求与 CPU** | 50,000 MAU；共享 Nano CPU | 客户端频繁调 `getUser()`；Admin 每次路由切换调 `admin_check_access()` | 启用非对称 JWT（JWKS 缓存）；客户端只用 `onAuthStateChange`；Admin 路由复用 60s 本地内存态，鉴权下沉至业务请求内联校验 | 减少 **90%+** 冗余 Auth HTTP 请求，消除后台切换卡顿 |
| **PostgREST 权益查询** | 共享 CPU / 连接池并发限制 | 按 `capability` 逐项调用 `check_access`；`ensure_membership` 后立刻再调 `check_access` | `check_access` 一次返回全量 `features/limits` 快照；`ensure_membership` 与 `redeem_code` 响应直接捎带最新权益快照 | 首次入会/兑换链路 RPC 往返从 3 次降为 **1 次** |
| **Data API 列表分页 Count** | Nano CPU 慢查询限制 | React-admin 默认 `Prefer: count=exact`，在大表上每次翻页触发全表 `COUNT(*)` 扫描 | 对 `products/plans/code-batches` 小表保留 `count=exact`；对 `membership_events/admin_audit_log/redemptions` 流水表无过滤条件时改用 `count=planned` | 避免审计与事件表增长后翻页触发全表顺序扫描 |
| **Database Egress（出站流量）** | **5 GB / 月** | 列表未严格限制列投影；Edge 中转未压缩 JSON；客户端无内容哈希去重重复备份 | 全部 DataProvider 查询显式指定最小列白名单；Aisenlens 备份先比对 `content_sha256` 去重，且 Gzip 压缩后直写 R2 | 出站流量降低 **70%～85%**，单月可支撑数万次活跃使用 |
| **Edge Functions 调用次数** | **500,000 次 / 月** | 原设计用 `admin-user-lookup` Edge 逐个查成员邮箱（每页 25～50 次调用） | 彻底落实 `DEC-06 A`：由 `public.admin_lookup_users` SQL RPC 在库内一次批量返回本页 50 个 UUID 的邮箱；Edge 仅用于 R2 备份 | Admin 浏览列表的 Edge Function 消耗直接降为 **0 次** |
| **7 天无活动自动暂停** | 连续 7 天无 API 请求自动 Pause | 早期内测或低频阶段若连续 7 天无用户请求，Supabase 实例休眠导致桌面端 Pro 校验返回 503 | 在 GitHub Actions（免费定时工作流）或 Cloudflare Cron 中配置每 72 小时调用一次轻量匿名只读查询 `GET /rest/v1/products?select=id&limit=1` | **100% 防止免费实例休眠**，保障桌面端随时在线可用 |

## 5. Admin 前端架构深度审查：全局平台控制与单产品控制的边界架构

### 5.1 全局底座与单产品空间混杂的架构缺陷（PREDEV-A01）

用户明确提出需要审视**“如何处理好全局与平台控制的关系”**。在现行 `docs/architecture/applications/admin-console.md` 与 `docs/Plans/aisencore-mvp/aisencore-mvp-d3-ui-admin-uiux-design.md` 第 2.1、4.1 节中，Admin 的导航被设计为一个扁平的四分组树：

- `工作台`（`/`）
- `产品与用户`（`产品管理 /products`、`用户查询 /users`、`产品成员 /memberships`）
- `权益运营`（`套餐管理 /plans`、`授权管理 /grants`、`兑换码 /code-batches`、`兑换记录 /redemptions`）
- `安全与审计`（`平台账号限制 /restrictions`、`管理员资格 /admins`、`管理审计 /audit`）

**深层架构缺陷分析**：

AisenCore 的核心定位是**“一套公共账号底座，支撑多个彼此独立的 SaaS 产品（Aisenlens、未来产品 B、产品 C）”**。在这个体系中，管理权限与业务实体天然存在两个截然不同的控制层级（Control Scopes）：

1. **全平台全局控制层（Global Platform Scope）**：作用于整个 AisenCore 底座，一旦变更将横跨所有接入的 SaaS 产品生效。包括：
   - **公共身份主档与全局账号封禁（`platform_account_restrictions.kind = 'blocked'`）**：封禁后，该用户在 Aisenlens、产品 B、产品 C 中的所有受保护能力全部被一票否决。
   - **产品目录注册与产品级停服（`products.status = 'suspended'`）**：停用后，该产品下所有用户的准入、入会、兑换立即全面熔断。
   - **平台管理员名册与 MFA 安全（`platform_admins`）**：拥有全平台最高管理权限。
   - **全平台管理审计日志（`admin_audit_log`）**。
2. **单产品运营控制层（Product-Scoped Operations）**：仅作用于某一个特定 SaaS 产品（如 `Aisenlens`）内部，绝不影响其他产品。包括：
   - **产品内套餐与当前默认 Free 版本指针（`plans` + `products.current_free_plan_id`）**。
   - **产品内兑换码批次发行与单码撤销（`redemption_code_batches` / `redemption_codes`）**。
   - **产品内用户权益授予与撤销（`entitlement_grants`）**。
   - **产品内成员资格暂停与恢复（`product_memberships.status = 'suspended'`）**：仅禁止该用户访问当前产品，其在其他产品的 Pro 权益正常可用。

在现行 D3-UI 扁平设计中，这两层被混杂在一起：
- **上下文丢失与重复筛选负担**：管理员在日常 95% 的时间里是在围绕某一个具体产品（如首发 `Aisenlens`）进行发码、配套餐、查成员、授 Pro。但在现行设计下，管理员从“套餐管理”切到“兑换码批次”，再切到“授权管理”和“产品成员”时，每个页面都是全平台混排列表，管理员必须在每个页面顶部手动重新下拉选择 `产品: [Aisenlens ▼]`！
- **跨产品误发码/误授权风险**：当接入第二个产品 `SaaS-B` 后，管理员在查看 `Aisenlens` 成员后点击新建兑换码或新建授权，若表单未锁定当前产品上下文，极易将 `Aisenlens` 的兑换码误发到 `SaaS-B` 名下。
- **爆炸半径（Blast Radius）混淆**：`封禁产品成员（Suspend Membership，仅单产品生效）` 与 `封禁平台账号（Block Account，全平台所有产品连坐封杀）` 在 UI 上缺乏清晰的层级隔离与视觉警示，极易造成客服处置误伤。

### 5.2 “双层上下文架构”设计：顶部产品视角切换器与爆炸半径分级防线

为了彻底理顺全局控制与单产品控制的关系，建议将 AisenCore Admin 的前端架构升级为**“顶部产品上下文切换器（Product Context Switcher）+ 双层导航分区（Product Workspace vs. Platform Global Control）”**架构：

| 架构层级 | 作用域与状态持久化 | 包含的核心模块 | 视觉与交互边界规范 |
| :--- | :--- | :--- | :--- |
| **顶部上下文栏（AppBar Context Switcher）** | 持久化于 URL 查询参数 `?product=aisenlens` 及本地 `localStorage`；MVP 默认自动选中首个 `active` 产品 `Aisenlens`；支持切换为 `[全平台汇总视图 All Products]` | 控制下方所有“产品空间”模块的默认 `product_id` 过滤条件与新建表单预设值 | 位于顶部 AppBar 品牌名右侧，以高辨识度产品胶囊选择器呈现（显示产品名称、`product_key` 与当前 `active/draft/suspended` 状态徽章） |
| **第一层：当前产品运营空间（Product Workspace）** | **单产品作用域（Product-Scoped）**：所有列表自动注入 `filter: { product_id: currentProductId }`；新建发码/套餐/直授自动锁定当前产品（并提供显式提示“当前操作目标产品：Aisenlens”） | 1. **产品概览与快捷操作台**<br>2. **套餐与 Free 基线管理**<br>3. **兑换码与核销中心**<br>4. **产品权益授权（Grants）**<br>5. **产品成员管理（Memberships）** | 主色调采用标准品牌蓝（`#2563EB`）；成员暂停等限制动作使用**琥珀色警告框（Amber Warning）**，明确标注“影响范围：仅限当前产品 [Aisenlens]” |
| **第二层：全平台全局底座（Platform Global Control）** | **跨产品全局作用域（Global Scope）**：不受顶部单产品过滤器限制（或点击时自动展示全平台视角），管理跨产品共享的身份、产品目录与安全底座 | 1. **全平台用户 360° 与全局封禁**<br>2. **SaaS 产品目录注册与启停**<br>3. **平台管理员与 MFA 安全**<br>4. **全局安全审计中心** | 侧边栏独立分组并配以全局盾牌图标；全局封禁账号、暂停整个产品、撤销管理员均使用**高危红色确认框（Crimson Danger）**，强制带 `[全局影响 · 跨所有产品]` 警示标签 |

通过这一设计：
1. 当唯一运营者在日常运营 `Aisenlens` 时，顶部上下文默认锁定为 `Aisenlens`，在“套餐 → 发码 → 授权 → 成员”之间任意切换均**无需重复筛选产品**，所有新建表单天然绑定 `Aisenlens`，操作效率提升一倍以上且彻底杜绝跨产品选错套餐。
2. 当未来接入第二个、第三个 SaaS 产品时，只需在顶部切换器一键切换至新产品，整套运营工作台立即切换为新产品的独立视图；切至 `[全平台汇总视图]` 时则可跨产品全局检索。
3. “单产品成员 `suspended`”与“全平台账号 `blocked`”在导航位置、文案标签与弹窗配色上形成鲜明的爆炸半径对比，从根本上消除了误操作风险。

## 6. Admin 前端架构深度审查：模块收敛、用户 360° 管理与核心交互设计

### 6.1 从“12 张数据库表 1:1 映射”收敛为 6 大任务导向模块（PREDEV-A02）

在 `docs/Plans/aisencore-mvp/aisencore-mvp-d3-admin-infrastructure-design.md` 第 2 节与 `D3-UI` 第 2.2 节中，Admin 前端几乎把后端的 12 张物理表 1:1 映射成了 11 个平级的路由与菜单项（`/products`、`/users`、`/memberships`、`/membership_events`、`/plans`、`/grants`、`/code-batches`、`/codes`、`/redemptions`、`/restrictions`、`/admins`、`/audit`）。

这是典型的**“数据库表驱动 UI（Database-Table-Driven UI）”反模式**，在实际运营中会造成严重的体验割裂：
- 例如 `platform_account_restrictions` 表只有 `user_id`、`kind='blocked'`、`reason_code`、`created_at` 四个字段。如果把 `/restrictions` 做成一个独立的顶层菜单页，管理员点进去只看到一排被封禁的记录，而想要封禁一个新用户时，却要先去 `/users` 搜邮箱复制 UUID，再切到 `/restrictions` 粘贴 UUID！
- 同样，`redemption_code_batches`（批次）、`redemption_codes`（单码）和 `redemptions`（兑换记录）本是“发码—查码—核销”同一业务链条的父子层级，拆成三个独立侧栏菜单会让导航栏显得臃肿不堪。

**模块收敛整改建议（将 11 个碎片页面整合为 6 大高内聚核心模块）**：

| 收敛后的一级/二级核心模块 | 推荐路由结构 | 聚合收纳的后端表 / 视图 / RPC | 核心功能与收纳理由 |
| :--- | :--- | :--- | :--- |
| **1. 产品运营工作台（Workspace）** | `/` | 只读复用 `products`、`admin_audit_log`（最近 10 条）、`membership_events`（最近 10 条） | 提供“一键发行兑换码”、“快速人工直授 Pro”、“按邮箱定位用户”三大高频快捷入口，外加最近管理动作与成员变动时间线，零新增统计接口 |
| **2. 套餐与 Free 基线（Plans）** | `/plans`<br>`/plans/:id`<br>`/plans/create` | `public.plans`、`public.products(current_free_plan_id)`、`admin_upsert_plan`、`admin_set_default_free_plan` | 顶部展示当前产品的默认 Free 版本指针卡（支持受控切换）；下方列表管理各 Pro 套餐版本，内聚展示 `[已冻结]` / `[可编辑]` 状态与一键克隆新版本入口 |
| **3. 兑换码运营中心（Codes Hub）** | `/codes`（含 3 个内置 Tab：`批次管理` / `单码检索` / `核销记录`）<br>`/codes/batches/:id` | `redemption_code_batches`、`admin_redemption_codes_view`（无哈希安全视图）、`redemptions`、`admin_create_codes`、`admin_revoke_code(_batch)` | 将批次、单码、核销记录收敛于同一模块的不同 Tab；点击某个批次详情 `/codes/batches/:id` 时，同屏直接内嵌展示该批次下的所有单码状态与已核销用户列表，并提供批次一键撤销 |
| **4. 权益授权管理（Grants）** | `/grants`<br>`/grants/create` | `public.entitlement_grants`（含新增 `grant_mode`、`requested_duration_days` 列）、`admin_grant_entitlement`、`admin_revoke_grant` | 集中查看与筛选所有来源（`redeem_code` / `admin`）的授权记录；通过彩色状态标签区分 `生效中 Active`、`待生效 Scheduled`、`永久 Lifetime`、`已到期 Expired`、`已撤销 Revoked` |
| **5. 用户 360° 与成员中心（Users & Members）** | `/users`（全平台用户与封禁筛选）<br>`/users/:id`（**360° 聚合详情页**）<br>`/memberships`（当前产品成员列表） | `admin_lookup_users` RPC、`platform_account_restrictions`、`product_memberships`、`membership_events`、`entitlement_grants`、`redemptions` | **彻底取消独立的 `/restrictions` 与 `/membership_events` 顶层菜单**！全局封禁直接内聚于 `/users` 列表筛选与 `/users/:id` 详情页顶栏；成员变更事件直接作为抽屉（Drawer）内嵌于成员详情中 |
| **6. 平台底座与安全审计（Platform & Audit）** | `/platform/products`<br>`/platform/admins`<br>`/platform/audit` | `products`、`platform_admins`、Supabase Auth MFA API、`admin_audit_log` | 集中收纳低频但高危的全平台配置：注册/发布/暂停 SaaS 产品、管理平台管理员名册与当前登录者的备用 TOTP 因子绑定、查阅全平台脱敏管理审计日志 |

### 6.2 如何高效管理用户：构建“用户 360° 诊断工作台”与批量邮箱映射（PREDEV-A03 & PREDEV-A04）

用户特别询问**“如何管理用户”**。在多 SaaS 公共底座中，管理员管理用户的核心诉求绝不是“增删改查一张用户表”，而是解决三大高频运营场景：**① 客户支持诊断（用户反馈“我买了码/充了会员为什么用不了 Pro？”）；② 人工客诉补偿与直授（为用户手动开通/顺延 30 天或永久 Pro，或补查兑换记录）；③ 违规风控处置（对单产品违规者执行 `Suspend Membership`，对全平台恶意刷码/攻击者执行全局 `Block Account`）**。

在现行设计中，这三大场景所需的数据分散在 5 张表里。为此，必须在 `/users/:id` 构建一屏式的**「用户 360° 运营诊断视图（User 360° Operational Inspector）」**，并在 DataProvider 层打通 `<ReferenceField>` 批量邮箱解析：

#### 1. 用户 360° 详情页（`/users/:id`）的四区一屏式架构

当管理员在 `/users` 通过精确邮箱或 UUID 搜到目标用户，或在任何成员/授权/核销列表中点击用户邮箱进入 `/users/:id` 时，页面使用 `Promise.all` 并行拉取该用户的 Auth 基本信息（经 `admin_lookup_users`）、`platform_account_restrictions`、`product_memberships`、`entitlement_grants` 及 `redemptions`（全部复用现有 RLS 表与只读 RPC，**无需后端新增任何表**），并在一屏内按以下四个功能区呈现：

- **顶部通栏：全局身份与平台风控卡（Identity & Global Restriction Header）**
  - 展示：用户邮箱（带一键复制）、完整 `user_id` UUID（等宽字体带一键复制）、邮箱验证状态（`已验证 Confirmed` vs `未验证 Unconfirmed`）、注册时间与最近登录时间。
  - 全局状态与动作：右侧显著展示平台级状态。若正常，显示绿色 `[平台状态：正常]` 及次级危险按钮 `[全局封禁账号]`；若存在于 `platform_account_restrictions`，显示醒目红色横幅 `[已全局封禁 Blocked · 原因码：xxx · 封禁时间：xxx]` 及 `[解除全局封禁]` 按钮。
- **第一区：实时准入与有效权益诊断仪（Live Access & Entitlement Diagnostic Card）**
  - 这是提升单人运营效率的核心利器：页面顶部提供一个切换或并列卡片（按已注册产品如 `Aisenlens`），直接调用或模拟后端的 `check_access` 判定逻辑，直观给出**“该用户此刻在 Aisenlens 能否使用 Pro 及其原因”**：
    - 若不可用，用高亮故障诊断链直接指出卡在哪一步：`[✓ 账号正常] → [✓ 产品 Active] → [✗ 成员状态：Left（已主动退出，需用户在客户端点击重新加入）]` 或 `[✗ 无有效 Pro 授权（上次授权已于 2026-09-15 到期）]`。管理员只需看一眼即可在 3 秒内准确回复用户客诉！
    - 若可用，清晰并列展示：`当前生效套餐：Pro 365天`、`本期截止（current_period_ends_at）`、`连续续期总截止（effective_ends_at）`、`是否永久（is_lifetime）`、当前合并生效的 `features` 标签组与 `limits` 数值表。
- **第二区：各产品成员状态与事件抽屉（Product Memberships & Event Timeline）**
  - 表格列出该用户已加入的所有产品（`product_key`、`status: active/left/suspended`、`pre_suspend_status`、`joined_at`）。
  - 行尾操作：提供 `[暂停该产品成员]` / `[恢复成员（将恢复至 pre_suspend_status: left/active）]` 按钮，以及 `[查看变更事件]` 按钮（点击在右侧滑出 `Drawer` 展示该 `membership_id` 的 `membership_events` 时间线，无需跳转新页面）。
- **第三区：用户权益授权时间轴与快捷直授（Entitlement Grants & Inline Grant CTA）**
  - 卡片右上角直接放置主操作按钮 `[+ 为该用户授予权益]`（点击打开弹窗，自动锁定 `target_user_id` 为当前用户，管理员只需选套餐和时长即可完成直授！）。
  - 列表展示该用户的所有 `entitlement_grants`（含当前生效、未来排期、历史过期与已撤销记录），对未撤销记录提供行内 `[撤销此授权]` 按钮。
- **第四区：兑换码核销记录与相关管理审计（Redemptions & Audit Trail）**
  - 底部双栏或折叠面板展示该用户的 `redemptions` 历史（何时使用了哪个批次的哪张兑换码、生成了哪条 `grant_id`）以及 `admin_audit_log` 中 `target_id = user_id` 的管理操作记录。

#### 2. 打通 `DEC-06` SQL RPC 与 React-admin `<ReferenceField>` 的批量邮箱映射（PREDEV-A04）

在成员列表（`/memberships`）、授权列表（`/grants`）、兑换记录（`/redemptions`）和审计日志（`/audit`）中，底层表只存有 `user_id uuid`。为了让管理员在这些列表中直接看到可读的用户邮箱而非一串冰冷的 UUID，同时避免 N+1 次远程请求，必须在 `dataProvider` 中将虚拟资源 `users` 与 `DEC-06 A` 批准的 `public.admin_lookup_users` 只读 SQL RPC 精确对接：

```typescript
// apps/admin/src/providers/usersDataProvider.ts
export const usersResourceHandlers = {
  // React-admin <ReferenceField source="user_id" reference="users"> 自动聚合整页 UUID 调用 getMany
  getMany: async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids)).slice(0, 50);
    const { data, error } = await supabase.rpc('admin_lookup_users', {
      p_user_ids: uniqueIds,
      p_email: null,
      p_limit: uniqueIds.length,
      p_offset: 0,
    });
    if (error || !Array.isArray(data)) {
      // 优雅降级：即使邮箱查询异常，也返回带 UUID 缩略值的记录，绝不阻塞成员/授权主列表渲染
      return {
        data: uniqueIds.map((id) => ({
          id,
          email: `${id.slice(0, 8)}…`,
          degraded: true,
        })),
      };
    }
    return { data };
  },
};
```

这一设计 100% 复用 [React-admin Data Provider](https://marmelab.com/react-admin/DataProviders.html) 原生的外键聚合与 TanStack Query 缓存机制：当管理员在成员列表和授权列表之间切换时，已经查询过的 `user_id → email` 映射直接命中内存缓存，连 1 次 SQL RPC 都无需重发！

### 6.3 关键高危业务交互设计：发码、套餐克隆与直授防错（PREDEV-A05, A06, A07）

针对 MVP 阶段管理员最核心的三项写操作，现行 `D3-UI` 线框在异常处理与防错人体工学上存在明显短板，需按以下交互状态机补齐：

#### 1. 兑换码发行（M3）的 `sessionStorage` 意图保护与超时一键恢复（PREDEV-A05）

- **缺陷现状**：`D3-UI` 第 4.2 节规定，首次点击“确认发行”时在组件内存生成 `request_id`；若网络超时返回 `UNKNOWN`，提示用户先按原 `request_id` 查询批次状态，若发现数据库其实已经落账（重放返回 `created=false`，明文已永久不可恢复），再让用户手动去批次详情页撤销旧批次，然后再回新建页用新 `request_id` 重新发码。不仅步骤繁琐，而且如果用户在请求超时卡顿期间不小心按了浏览器刷新（`F5`），内存中的 `request_id` 瞬间丢失，用户连刚才超时的是哪一个批次都无法获知！
- **交互优化方案**：
  - **提交前写入非秘密 Pending Intent**：当管理员点击 `[确认发行]` 发起 `admin_create_codes` 时，立即将非秘密请求摘要 `{ request_id, product_id, plan_id, quantity, config, submitted_at }` 写入浏览器 `sessionStorage`（绝不存任何明文码！）。一旦收到首次成功响应且管理员点击 `[我已安全保存明文，关闭窗口]`，立即清除该 `sessionStorage` 条目。
  - **刷新/断线自动检测与一键复合恢复**：若请求发生网络超时，或管理员刷新页面后重新进入 `/codes`，UI 自动检测到 `sessionStorage` 中存在未结清的 `request_id`，立即弹出恢复面板并自动调用一次幂等重放查询：
    - 若数据库尚未创建该批次，本次重放直接完成创建并展示首次明文（`created=true`）；
    - 若数据库已在刚才超时期间创建了该批次（返回 `created=false, batch_id=...`），面板直接提供醒目的单按钮 **`[一键作废该无明文批次并重新生成新码]`**——点击后前端自动串联调用 `admin_revoke_code_batch(batch_id, 'timeout_plaintext_lost')` 与带全新 `request_id` 的 `admin_create_codes(...)`，直接弹出新一批可用明文码，将 4 步排障压缩为 1 次点击！
  - **导出文件防混淆自描述头部**：当管理员在首次成功视图点击 `[下载 .TXT]` 或 `[下载 .CSV]` 时，生成的文件顶部自动写入注释元数据头（包括产品名、套餐键、批次 ID、单码授权天数、过期时间与生成时间戳），文件名自动按 `aisencore-codes-<product_key>-<plan_key>-<YYYYMMDD-HHmm>-<qty>pcs.txt` 命名，防止运营者本地电脑保存多个文本文件后混淆批次。

#### 2. 套餐冻结（M2）下的“一键克隆新版本”与结构化键值编辑器（PREDEV-A06）

- **缺陷现状**：根据 M2 与 `DEC-04 A`，任何 Free 套餐自创建起、任何非 Free 套餐自被首张兑换码或首条授权引用起，其 `product_id, plan_key, features, limits` 永久冻结，修改能力必须新建套餐版本（如 `pro_30d_v2`）。但现行设计要求管理员新建版本时手填全部字段，且 `features`（JSON 数组）与 `limits`（JSON 对象）若直接用文本框输入 JSON，极易发生引号漏写、键名拼写错误（如把 `ai.analysis` 写成 `ai_analysis`）或把数字写成字符串。
- **交互优化方案**：
  - **冻结态智能引导与一键派生（Clone as New Version）**：在 `/plans/:id` 页面，当检测到该套餐处于冻结状态时，将 `plan_key`、`features`、`limits` 渲染为带锁形图标的只读视图，仅开放 `name`（展示名称）与 `is_active`（是否允许新发码/新直授）的保存按钮；同时在页头提供醒目的主操作 **`[基于此套餐克隆新版本]`**。点击后跳转到创建页，自动预填原套餐的全部 `features` 与 `limits`，并将 `plan_key` 自动建议递增为 `<原key>_v2`（同时提供一个复选框：`[✓] 创建新版本成功后，同时停用旧版本（不影响已发行有效旧码兑现）`）。
  - **结构化能力开关与配额编辑器**：在创建套餐表单中，废除裸写 JSON 文本框，改用双栏结构化表单控件：
    - `功能开关（Features）`：采用可勾选预设常用能力标签（如 `ai.analysis`、`video.export.no_watermark`、`backup.config`）+ 自定义新键名标签输入器（`<Autocomplete freeSolo multiple>`），前端自动校验键名符合小写字母/数字/点号规范且无重复。
    - `数值配额（Limits）`：采用动态键值行列表（`<ArrayInput>`：键名下拉/输入 + 非负数值输入框 + 单位辅助显示如 MB/次/个），前端实时校验 `limits` 中的键名与同产品 `features` 键名不冲突，并在表单底部提供只读的格式化 JSON 预览块。

#### 3. 人工直授（DEC-05）三态互斥选择器与顺延到期日实时预览（PREDEV-A07）

- **缺陷现状**：`DEC-05 A` 支持 `duration`（按天数顺延）和 `explicit_window`（显式起止时间，`ends_at = null` 为永久）两种模式。若在 UI 表单上简单放置模式下拉框与可空的 `ends_at` 日期框，管理员在 `explicit_window` 模式下漏填 `ends_at` 就会把短期补偿误发成“永久 Pro”。
- **交互优化方案**：
  - 将人工直授表单的授权期限区域设计为**三个互斥的分段卡片单选框（Segmented Cards）**：
    1. **`[按天数顺延（推荐）]`**：内部提供快捷胶囊按钮（`30 天`、`90 天`、`365 天` 及自定义正整数输入框），底层映射为 `mode = 'duration', duration_days = N`。当选中目标用户与套餐后，表单自动查询该用户当前同套餐的 `effective_ends_at`，并在下方实时渲染绿色预览条：*“该用户当前有效截止至 2026-11-15，本次授予后预计连续顺延至 **2026-12-15**（最终以服务端事务锁内计算为准）”*。
    2. **`[指定固定起止时间窗]`**：底层映射为 `mode = 'explicit_window'`，同时显示 `开始时间（默认当前时间）` 与 `结束时间` 两个日期时间选择器，且在 UI 表单校验中将**结束时间设为必填（Required，绝不允许为空）**。
    3. **`[授予永久权益（Lifetime Pro）]`**：底层映射为 `mode = 'explicit_window', starts_at = now, ends_at = null`。选中此卡片时，隐藏结束时间输入框，但强制显示一个黄色高危确认复选框：`[✓] 我确认授予该用户无自然到期日的永久 Pro 权益`。

## 7. Admin 前端架构深度审查：如何设计出高质量 UI 并破除 `UI-G0A` 死锁

### 7.1 破除 `UI-G0A` 流程死锁：以静态高保真 HTML 基准画板快速完成视觉签收（PREDEV-A08）

在 `docs/architecture/applications/admin-ui-design-system.md` 第 7 节与 `DEC-03 A` 决议中，明确规定了三阶段视觉治理门禁：
- **UI-G0A**：冻结全局 Token，并产出**四类代表性高保真页面（登录/TOTP、兑换码列表与一次性明文结果、套餐列表与编辑冻结、用户/成员列表与详情）**在桌面端（1440px）与窄屏（375px）下的可见参考画面，经项目所有者真实审阅并签收后，才可将 `UI-G0A` 标为 `APPROVED`。
- **UI-G0B**：在 `UI-G0A` 获批且取得编码授权后，编写最小 React-admin + MUI 代码原型。
- **UI-G3**：全部业务页面开发完成后的真实浏览器 E2E 与视觉验收。

**当前工程卡点**：由于规范严禁在 `UI-G0A` 获批前启动 `apps/admin` 的正式 React-admin 编码，而项目又是单人开发、没有专职 UI 设计师使用 Figma 绘制 8 张高保真画板，这就形成了一个典型的工程卡点——**不画图就不能写代码，不用代码渲染又很难凭空画出符合 MUI 真实排版的视觉稿**。

**破局落地建议**：
- **采用“单文件零依赖静态 HTML/CSS 视觉基准画板（Static HTML Design Spec Board）”一步打通 `UI-G0A`**：在启动 `apps/admin` 工程初始化之前，先生成一份独立的静态视觉基准文件（例如 `docs/design-preview/ui-g0a-benchmark.html`），完全不创建 React/Vite 工程、不安装 npm 依赖，仅用纯 HTML + 内联 CSS 精确按照下方第 7.2 节的 MUI Token 规范，在同一画布中直观渲染出 **4 类核心代表页 × 桌面 1440px / 窄屏 375px 对照视图 + 全套语义状态徽章与危险弹窗**。
- 项目所有者直接在浏览器中打开该静态画板即可在 5 分钟内完成视觉审阅与签收，并顺势填写 `admin-ui-design-system.md` 第 7.2 节的审批记录模板，将 `UI-G0A` 正式解锁为 `APPROVED`，合法、合规、零返工地进入 `UI-G0B` 与正式前端开发！

### 7.2 面向 MUI `createTheme` 的工业级 Design Token 精确规范与高密度排版准则

为了设计出媲美 Linear、Stripe Dashboard 与 Supabase Studio 质感的现代高信噪比管理后台，同时严格贯彻仓库根目录 `AGENTS.md` 第二条铁律（**“UIUX: Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining”**），建议将 `admin-ui-design-system.md` 中尚未写死的候选 Token 正式锁定为以下工业级精确参数：

| Token 分类与 MUI 映射路径 | 语义 Token 名称 | 精确锁定值（HEX / CSS） | 适用组件与视觉设计准则 |
| :--- | :--- | :--- | :--- |
| **背景与表面层级**<br>（`palette.background`） | `color.surface.page`<br>`color.surface.panel`<br>`color.surface.subtle`<br>`color.border.default` | `#F8FAFC`（Slate 50）<br>`#FFFFFF`（Pure White）<br>`#F1F5F9`（Slate 100）<br>`#E2E8F0`（Slate 200，1px 实线） | 摒弃传统 Material Design 的厚重投影（全局卡片与表格设置 `elevation: 0`），完全依靠 `#F8FAFC` 浅灰底色、`#FFFFFF` 纯白面板与 `1px solid #E2E8F0` 锐利边框建立清爽的现代 B 端层级 |
| **文字与对比度层级**<br>（`palette.text`） | `color.text.primary`<br>`color.text.secondary`<br>`color.text.muted` | `#0F172A`（Slate 900，对比度 15.8:1）<br>`#475569`（Slate 600，对比度 7.5:1）<br>`#94A3B8`（Slate 400，占位/禁用） | 表头采用 `#475569`、`12px`、`font-weight: 600`；正文与数据主列采用 `#0F172A`、`14px`，确保长时间审阅兑换码与审计日志眼部零疲劳 |
| **主品牌与交互焦点**<br>（`palette.primary`） | `color.primary.main`<br>`color.primary.hover`<br>`color.border.focus` | `#2563EB`（Blue 600）<br>`#1D4ED8`（Blue 700）<br>`2px solid #2563EB`（`offset: 2px`） | 全页仅右上角 `PageHeader` 的唯一主 CTA 按钮使用实心 `#2563EB`；表格行内操作一律使用低噪中性幽灵按钮或次级线框按钮，避免满屏蓝色按钮抢夺视线 |
| **语义状态徽章（Status Badges）**<br>（强制：图标 + 文本 + 浅底 + 1px 描边） | `status.active`（正常/生效）<br>`status.warning`（已退出/即将到期）<br>`status.danger`（封禁/撤销/暂停）<br>`status.info`（永久/已冻结/待生效） | 绿：字 `#15803D` / 底 `#F0FDF4` / 边 `#BBF7D0`<br>橙：字 `#B45309` / 底 `#FFFBEB` / 边 `#FDE68A`<br>红：字 `#B91C1C` / 底 `#FEF2F2` / 边 `#FECACA`<br>蓝：字 `#1D4ED8` / 底 `#EFF6FF` / 边 `#BFDBFE` | 严禁仅靠红绿圆点表达状态；所有状态胶囊统一 `height: 24px`、`padding: 0 8px`、`border-radius: 6px`、`font-size: 12px`、`font-weight: 500`，内置 `14px` 语义图标 |
| **字体栈与等宽数字对齐**<br>（`typography`） | `fontFamily.sans`<br>`fontFamily.mono`<br>`fontVariantNumeric` | 系统无衬线中英文字体栈<br>`"JetBrains Mono", "Consolas", monospace`<br>`tabular-nums`（全局表格/数字强制开启） | 所有 UUID（缩略显示为 `7bd4…9a12` 胶囊并带悬停复制图标）、`product_key`、`plan_key`、兑换码明文、SHA-256 摘要统一使用等宽字体 `fontFamily.mono`；所有时间、数量、配额列强制 `tabular-nums` 垂直对齐 |
| **控件尺寸与紧凑密度**<br>（`components` Overrides） | `control.height.md`<br>`table.rowHeight`<br>`shape.borderRadius` | 输入框/主按钮统一高 `36px`（小按钮 `30px`）<br>表格标准行高 `44px`（表头高 `40px`）<br>控件圆角 `6px`、卡片/弹窗圆角 `10px` | 覆盖 MUI 默认偏肥大的 `56px` 输入框（全局默认设为 `size: "small"` 并定制高度为 `36px`），禁用按钮英文自动大写（`textTransform: "none"`），使一屏 1080p 显示器可舒适呈现 15～20 行管理数据 |

**贯彻落实 `AGENTS.md`“让布局自解释，剔除冗余次要标签与说明”的四条 UI 减噪规范**：
1. **砍掉页头下方的解释性副标题段落**：现行 `D3-UI` 第 4.1 节线框在“兑换码批次”标题下方还写了一行“仅本人的平台发码批次；一次发行明文后不会再次出现”。这类解释性长句在日常重复使用中纯属视觉噪音——应直接移除，将“明文仅显示一次”的强警示收敛到**新建发码弹窗的底部确认条**和**首次明文结果框**中。
2. **用内联格式占位与紧凑后缀替代长篇 `helperText`**：表单字段除非校验报错，否则默认不展示灰字说明。例如“授权天数”输入框直接使用后缀内联单位 `天（Days）`，无需在下方再写一行“请输入大于 0 的整数天数”。
3. **表格列头极简化与内联组合列**：在成员、授权、兑换列表中，不要把 `user_id` 和 `email` 拆成两列宽大冗余的文字列，而是合并为单列 **`用户（User）`**：主行显示 `user@example.com`，右侧紧跟一个极简的等宽胶囊 `7bd4…9a12 [复制]`；同理将 `product_id` 与 `plan_id` 合并为 **`产品 / 套餐`** 组合列（如 `Aisenlens · Pro 365天`），大幅减少表格横向滚动概率。
4. **一次性发码明文安全展示盒（One-Time Plaintext Vault Box）**：当 `admin_create_codes` 返回 `created=true` 时，弹出锁定背景的模态框（禁止点击背景遮罩误关闭，必须点击底部显式确认按钮并二次确认“我已复制或下载保存”才能关闭），内部使用深色高对比度等宽代码框（`#0F172A` 底色配 `#F8FAFC` 等宽亮字）展示明文码列表，右上角固定 `[一键复制全部]` 与 `[下载 .TXT 文件]` 两个主操作按钮。

## 8. 正式启动开发前的分级整改与执行路线图

为了让开发工作稳健、高效且零返工地推进，建议在正式编写业务代码前，按照以下 **4 个紧密衔接的准备与开发批次** 推进：

| 执行阶段 | 核心动作与解决的审核问题 | 退出判据（Gate Criteria） |
| :--- | :--- | :--- |
| **第一阶段：D1/D2 契约微调与 SQL 迁移底座（Day 1）** | 1. 修正 `M01/M02` 中 `products.current_free_plan_id` ↔ `plans` 的双向外键顺序（改用 `ALTER TABLE ... DEFERRABLE INITIALLY DEFERRED`）（**PREDEV-B07**）；<br>2. 在 `entitlement_grants` 表补齐非敏感列 `grant_mode` 与 `requested_duration_days`，移除隐藏指纹列，恢复干净的表级 `GRANT SELECT`（**PREDEV-B06**）；<br>3. 固化 `private` schema 下 `L0` 读写锁分离与 `L0/L1/L7` 双 `int4` 咨询锁哈希函数（**PREDEV-B07**）；<br>4. 修正 `redeem_code` 中 `left/suspended` 不计入限流的规则，并在 `check_access / ensure_membership / redeem_code` 中统一返回全量有效权益快照（**PREDEV-B04, B05**）；<br>5. 在 `platform_admins` 增加 `min_valid_iat` 毫秒级撤权字段，并配置 `pg_cron` 限流表自清理（**PREDEV-B02, B08**）。 | 本地 Supabase CLI 空库成功执行 `M00～M04` SQL 迁移且 0 编译错误；pgTAP 跑通 RLS 列权限、双连接锁序 `LCK-01～07` 及 `DEC-01/04/05/06` 正反向断言。 |
| **第二阶段：`UI-G0A` 静态高保真画板签收与解锁（Day 2）** | 1. 采用第 7.2 节锁定的精确 Design Token（色板、字号、等宽数字、紧凑行高）与第 5、6 节的“顶部产品上下文切换器 + 6 大模块 + 用户 360° 视图”架构；<br>2. 生成单文件静态高保真视觉基准页（覆盖登录/MFA、发码与一次性明文、套餐冻结与克隆、用户 360° 与成员四类页面在 1440px 与 375px 下的完整状态）（**PREDEV-A01～A08**）；<br>3. 项目所有者审阅签收并归档 `UI-G0A APPROVED` 记录。 | `UI-G0A` 状态正式更新为 `APPROVED`，解除 `apps/admin` 前端正式编码门禁。 |
| **第三阶段：Admin 前端工程与认证中转页实现（Day 3～5）** | 1. 初始化 `apps/admin`（Vite + React-admin + MUI），注入唯一全局 `theme.ts` 与带顶部产品切换器的 `AdminLayout`；<br>2. 实现 `/auth/confirm` 与 `/auth/reset-password` 静态认证落地页，打通桌面端跨设备邮件激活闭环（**PREDEV-B01, B03**）；<br>3. 实现自定义 `dataProvider`（标准 `create/update` 映射受保护 RPC，`getMany('users')` 映射 `admin_lookup_users` 批量 SQL RPC，特殊危险动作映射自定义 Mutation）（**PREDEV-A04**）；<br>4. 交付 6 大核心模块与用户 360° 诊断页，落实发码 `sessionStorage` 意图恢复、套餐克隆与直授三态防错表单（**PREDEV-A02～A07**）。 | 通过 `D3-UI-X01～X18` 与 `UI-G3` 浏览器实测；翻页 50 条成员仅触发 1 次 `admin_lookup_users` SQL RPC；发码明文零持久化残留。 |
| **第四阶段：Aisenlens 客户端接入与 R2 备份闭环（Day 6～7）** | 1. 实现 `aisenlens-backup` 受保护 Edge Function（含 `content_sha256` 短路去重、白名单 Schema 校验、Gzip 压缩直写 R2 final 及 DB `ready + unexpired pending` 配额核算）（**PREDEV-B08**）；<br>2. Aisenlens 客户端对接原生密码登录、启动/关键操作 `single-flight` 权益快照复核，以及配置备份手动版本差异预览与恢复；<br>3. 完成主备双设备 TOTP 绑定与 `A-04` 紧急恢复 SQL 实操演练，配置 72 小时防休眠探针。 | 通过 `REV-DEC01～06`、`AUTH-P01～12` 及 `R2` 故障补偿全量端到端验收，达到公开生产发布就绪（PRODUCTION READY）。 |

## 9. 参考资料与规范依据

- [Supabase Pricing & Free Tier Quotas](https://supabase.com/pricing)：Supabase 免费计划的数据库容量（500 MB）、出站流量（5 GB Egress）、Edge Functions 调用次数及 7 天不活跃自动暂停规则。
- [Supabase Auth Multi-Factor Authentication (TOTP)](https://supabase.com/docs/guides/auth/auth-mfa/totp)：TOTP 因子注册、挑战验证、`aal1/aal2` 会话升级与 RLS 策略集成规范。
- [Supabase JavaScript SDK — signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) 与 [getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims)：客户端原生密码登录与非对称 JWT JWKS 本地验签机制。
- [Supabase Database Functions & Security Definer](https://supabase.com/docs/guides/database/functions) 与 [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)：`SECURITY INVOKER/DEFINER` 最小权限隔离、固定 `search_path` 与 `(select auth.uid())` 执行计划优化。
- [Supabase Changelog: Explicit GRANT for New Public Tables (2026-10-30)](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)：新建 `public` 表必须显式配置角色 `GRANT` 方可通过 Data API 访问的平台变更。
- [PostgreSQL Explicit Locking \& Advisory Locks](https://www.google.com/search?q=https://www.postgresql.org/docs/current/explicit-locking.html%23ADVISORY-LOCKS)：PostgreSQL 事务级咨询锁 `pg_advisory_xact_lock` 与共享咨询锁 `pg_advisory_xact_lock_shared` 的双 `int4` 命名空间机制。
- [PostgREST Functions as RPC](https://docs.postgrest.org/en/stable/references/api/functions.html) 与 [Error Handling](https://docs.postgrest.org/en/v16/references/errors.html)：RPC JSON 参数映射、Schema Cache 刷新与自定义 `SQLSTATE` 状态码映射。
- [Cloudflare R2 S3 API Compatibility](https://developers.cloudflare.com/r2/api/s3/api/) 与 [Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)：R2 条件写入、预签名 URL 生命周期与对象存储安全边界。
- [React-admin Data Providers](https://marmelab.com/react-admin/DataProviders.html)、[Authentication](https://marmelab.com/react-admin/Authentication.html) 与 [Theming](https://marmelab.com/react-admin/Theming.html)：React-admin 标准 `getList/getMany/create/update` 契约、`<ReferenceField>` 批量聚合机制及 MUI 单一主题注入规范。
- [Material UI Theming & Customization](https://mui.com/material-ui/customization/theming/)：Material UI 调色板、排版层级、8px 间距系统与全局组件默认属性覆盖规范。
