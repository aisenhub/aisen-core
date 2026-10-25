# 阶段 D1 执行计划：完整关系数据模型、可信 RPC 内核与并发锁验证

- **阶段代号**：`PHASE-D1`
- **当前状态**：`LOCAL_GATE_PASSED`（D1-M1～M4 SQL、四迁移从零重建、239/239 pgTAP 与真实双连接 LCK-01～07 通过；签名 JWT/HTTP/TOTP 待 D2，不能由此推断上线安全）
- **权威依据**：
  - [统一需求 §3, §4, §5](../../spec/requirements.md)
  - [数据库逻辑约束与最小审计](../../architecture/database/database-constraints-and-audit.md)
  - [Pro 授权与兑换码数据约束](../../architecture/database/entitlements-and-redemption-constraints.md)
  - [数据库访问隔离与可信事务](../../architecture/database/database-access-and-transactions.md)
  - [受保护 RPC 与事务锁序合同（F01/F02）](../../architecture/database/rpc-security-and-locking-contract.md)
  - [公共 API 契约与 MVP 验收（DEC-01 / DEC-05）](../../architecture/backend/api-contract-and-mvp-acceptance.md)

---

### 已验证的本地基线（不代表完整系统完成）

- Node 24.19.0、pnpm 12.15.0、Docker Engine 29.7.2、Supabase CLI 2.121.0；独立 PostgreSQL 17.11（`supabase_db_Aisencore`，端口 `55322`）。这些是当次执行记录，不是未来版本锁定。
- 已从零重建 `20261024011528_core_foundation.sql`、`20261024025852_entitlements_and_redemption_schema.sql`、`20261024032247_trusted_rpcs_and_locking.sql`、`20261024033040_redemption_and_grant_rpcs.sql` 四迁移；`001`～`005` 各 25/10/57/70/77 项，共 **239 PASS / 0 FAIL**；独立连接 `LCK-01`～`07` PASS；SQL 合成 JWT/MFA 不当成真实 GoTrue 验证。

## 1. 阶段边界声明（Scope & Hard Boundaries）

### 1.1 准入条件（Entry Gate）
- 本地 Docker Engine 正常运行，项目专属 PostgreSQL 17.11 容器（端口 `55322`）可连接。
- 现有首份迁移 `supabase/migrations/20261024011528_core_foundation.sql` 及 35 项 pgTAP（`001` + `002`）执行为 PASS。

### 1.2 本阶段必须完成的交付范围（In-Scope）
1. **下一批版本化迁移（Schema 补完与安全视图）**：创建 `private` schema、受控函数 owner 角色（或最小权限机制）、`entitlement_grants`、`redemption_code_batches`（或批次幂等结构）、`redemption_codes`、`redemptions`、`redemption_rate_limits`，以及管理员 RLS 读取策略和不含 `code_hash` 的安全只读投影。
2. **随领域依赖顺序新增版本化迁移（F01/F02 可信 RPC 集合）**：实现 `private.is_platform_admin()`、L0~L8 确定性 advisory lock 辅助函数、全部用户自助 RPC、只读准入查询 RPC、管理员受保护写 RPC（`public SECURITY INVOKER` 薄包装 + `private SECURITY DEFINER` 内核）。
3. **完整的数据库测试与双连接并发验证**：新增 pgTAP 测试脚本（覆盖表约束、列级 GRANT、RLS、RPC 正负向用例 I-01~I-28 / R-01~R-15 的数据库层部分）及 Node/SQL 双连接并发锁测试脚本（覆盖 LCK-01~07）。

### 1.3 严禁越界行为（Hard Out-of-Scope）
- **严禁**创建 `public.plans` 表，严禁在 `products` 或任何表中添加 `free_features`、`free_limits`、`features`、`limits` 列。
- **严禁**实现或保留单参数 `redeem_code(code)`，严禁在 `check_access(product_key)` 中增加 `capability` 参数。
- **严禁**在 `users` 或 `product_memberships` 上添加 `is_pro` 布尔列，严禁创建 `tier='free'` 的 Grant 或兑换码。
- **严禁**向 `anon` 或 `authenticated`（含管理员）授予 `redemption_codes.code_hash`、`redemption_rate_limits` 或幂等指纹列的 Data API `SELECT` 权限。
- **严禁**在迁移文件中硬编码任何预设的真实生产管理员 UUID。
- **严禁**在本阶段编写 React-admin 前端代码、Edge Functions 或连接远程云端资源。

---

## 2. 详细技术设计与实施子任务（Milestones & Tasks）

### Milestone D1-M1：补完 Pro 授权、兑换码、核销与限流表结构

**已于 2026-10-24 在本地完成**：新增迁移 `20261024025852_entitlements_and_redemption_schema.sql`；5 张表、`private.is_platform_admin()`、管理员 RLS/列级授权及 `security_invoker` 无哈希安全视图。新增 `003` pgTAP 57 项全部通过，覆盖 SQL 模拟 `aal1/aal2`、blocked、哈希/限流隔离、禁止表写入、期限和撤销约束负例。M2～M4 的业务 RPC、双连接锁和真实签名 JWT/HTTP 尚未实现/验证。

在 `supabase/migrations/` 下新增迁移文件（通过 `pnpm dlx supabase migration new entitlements_and_redemption_schema` 创建；禁止手编时间戳）：

1. **创建非暴露 Schema 与管理鉴权助手**：
   - `CREATE SCHEMA IF NOT EXISTS private;`
   - `REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;`（后续仅按需授予 wrapper 调用内核所需的最小 `USAGE`）。
   - 实现 `private.is_platform_admin() RETURNS boolean`：
     - `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''`
     - 逻辑：检查 `auth.uid() IS NOT NULL`、当前 JWT claim `( coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'aal' ) = 'aal2'`（同时兼容 `request.jwt.claim.aal` 的受控读取，但以 GoTrue 标准 `request.jwt.claims` JSON 内的 `aal = 'aal2'` 为准）、`EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid() AND pa.active = true)`，且 `NOT EXISTS (SELECT 1 FROM public.platform_account_restrictions par WHERE par.user_id = auth.uid() AND par.kind = 'blocked')`。
2. **创建 `public.entitlement_grants`（唯一 Pro 授权事实表）**：
   - 字段：
     - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
     - `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT`
     - `product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT`
     - `tier text NOT NULL DEFAULT 'pro' CONSTRAINT entitlement_grants_tier_pro_only CHECK (tier = 'pro')`
     - `source_type text NOT NULL CONSTRAINT entitlement_grants_source_type_valid CHECK (source_type IN ('redeem_code', 'admin'))`
     - `source_ref text NOT NULL`（例如兑换码为 `code:<code_id>:user:<user_id>`，管理员直授为 `admin:<actor_user_id>:<request_id>`）
     - `grant_mode text NOT NULL CONSTRAINT entitlement_grants_mode_valid CHECK (grant_mode IN ('duration', 'explicit_window'))`
     - `requested_duration_days integer CONSTRAINT entitlement_grants_duration_valid CHECK ((grant_mode = 'duration' AND requested_duration_days IS NOT NULL AND requested_duration_days > 0) OR (grant_mode = 'explicit_window' AND requested_duration_days IS NULL))`
     - `starts_at timestamptz NOT NULL`
     - `ends_at timestamptz`（`NULL` 仅当显式授予永久权益时合法；非空时 `ends_at > starts_at`；且 `grant_mode = 'duration'` 时 `ends_at IS NOT NULL`）
     - `created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT`
     - `grant_reason text`
     - `revoked_at timestamptz`
     - `revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT`
     - `revoke_reason text`
     - `created_at timestamptz NOT NULL DEFAULT transaction_timestamp()`
   - 唯一与检查约束：
     - `UNIQUE (source_type, source_ref)`
     - `CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL AND char_length(btrim(revoke_reason)) BETWEEN 1 AND 200))`
   - 索引：`(user_id, product_id, tier) WHERE revoked_at IS NULL`
3. **创建 `public.redemption_code_batches` 与 `public.redemption_codes`**：
   - `redemption_code_batches`（承载 M3 / DEC-05 强类型批次幂等与 UNKNOWN 查询）：
     - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
     - `product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT`
     - `tier text NOT NULL DEFAULT 'pro' CHECK (tier = 'pro')`
     - `created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT`
     - `request_id text NOT NULL CHECK (char_length(btrim(request_id)) BETWEEN 1 AND 128)`
     - `quantity integer NOT NULL CHECK (quantity > 0)`；真实单批运营上限待所有者确认，由受保护 RPC 校验并另行设置经测量的资源安全阈值；禁止将历史 100/批变成已批准 DDL
     - `grant_duration_days integer CHECK (grant_duration_days IS NULL OR grant_duration_days > 0)`
     - `is_lifetime boolean NOT NULL DEFAULT false CHECK ((is_lifetime = true AND grant_duration_days IS NULL) OR (is_lifetime = false AND grant_duration_days IS NOT NULL AND grant_duration_days > 0))`
     - `max_redemptions_per_code integer NOT NULL DEFAULT 1 CHECK (max_redemptions_per_code > 0)`
     - `code_expires_at timestamptz`
     - `note text`
     - `created_at timestamptz NOT NULL DEFAULT transaction_timestamp()`
     - `UNIQUE (created_by, request_id)`
   - `redemption_codes`：
     - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
     - `batch_id uuid NOT NULL REFERENCES public.redemption_code_batches(id) ON DELETE RESTRICT`
     - `batch_ordinal integer NOT NULL CHECK (batch_ordinal >= 1)`
     - `code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$')`（规范化高熵明文的 SHA-256 hex，绝不存明文）
     - `code_prefix text NOT NULL CHECK (char_length(code_prefix) BETWEEN 4 AND 12)`（仅用于管理员界面识别的非秘密掩码前缀，绝不用于鉴权或恢复明文）
     - `product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT`
     - `tier text NOT NULL DEFAULT 'pro' CHECK (tier = 'pro')`
     - `grant_duration_days integer`
     - `is_lifetime boolean NOT NULL DEFAULT false CHECK ((is_lifetime = true AND grant_duration_days IS NULL) OR (is_lifetime = false AND grant_duration_days IS NOT NULL AND grant_duration_days > 0))`
     - `max_redemptions integer NOT NULL DEFAULT 1 CHECK (max_redemptions > 0)`
     - `redeemed_count integer NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0 AND redeemed_count <= max_redemptions)`
     - `expires_at timestamptz`
     - `created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT`
     - `created_at timestamptz NOT NULL DEFAULT transaction_timestamp()`
     - `revoked_at timestamptz`
     - `revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT`
     - `revoke_reason text`
     - `UNIQUE (batch_id, batch_ordinal)`
4. **创建 `public.redemptions`（核销记录表）**：
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `code_id uuid NOT NULL REFERENCES public.redemption_codes(id) ON DELETE RESTRICT`
   - `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT`
   - `product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT`
   - `grant_id uuid NOT NULL UNIQUE REFERENCES public.entitlement_grants(id) ON DELETE RESTRICT`
   - `created_at timestamptz NOT NULL DEFAULT transaction_timestamp()`
   - `UNIQUE (code_id, user_id)`
5. **创建 `public.redemption_rate_limits`（每用户抗枚举限流表）**：
   - `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT`
   - `failed_at timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[]`
   - `updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()`
   - `CHECK ( coalesce(array_length(failed_at, 1), 0) <= 10 )`
6. **配置严格的 RLS 与列级 GRANT（F05 安全投影）**：
   - 所有新表 `ENABLE ROW LEVEL SECURITY` 并 `REVOKE ALL FROM PUBLIC, anon, authenticated`。
   - `entitlement_grants`：向 `authenticated` 授予安全业务列 `SELECT (id, user_id, product_id, tier, source_type, grant_mode, requested_duration_days, starts_at, ends_at, revoked_at, created_at)`（不暴露内部 `source_ref` 幂等键细节给普通用户，或通过 RLS 区分本人读取与 `(SELECT private.is_platform_admin())` 管理员读取）。
   - `redemptions`：向 `authenticated` 授予 `SELECT (id, code_id, user_id, product_id, grant_id, created_at)`；RLS 允许 `user_id = (SELECT auth.uid()) OR (SELECT private.is_platform_admin())`。
   - `redemption_code_batches`：仅向 `authenticated` 授予非秘密列 `SELECT` 且 RLS 限制 `USING ((SELECT private.is_platform_admin()))`。
   - `redemption_codes`：**严禁授予 `code_hash` 列的 `SELECT` 权限！** 仅向 `authenticated` 授予 `SELECT (id, batch_id, batch_ordinal, code_prefix, product_id, tier, grant_duration_days, is_lifetime, max_redemptions, redeemed_count, expires_at, created_by, created_at, revoked_at, revoked_by, revoke_reason)`，且 RLS 限制 `USING ((SELECT private.is_platform_admin()))`。
   - `redemption_rate_limits`：不向 `anon` / `authenticated` 授予任何 `SELECT/INSERT/UPDATE/DELETE` 权限（完全由 `private` RPC 内部独占访问）。
   - 补齐首份迁移 6 张表的管理员只读 RLS Policy：在 `products`（全部状态与列）、`product_memberships`、`membership_events`、`platform_admins`、`platform_account_restrictions`、`admin_audit_log` 上为 `authenticated` 增加 `USING ((SELECT private.is_platform_admin()))` 的只读策略与必要列级 `SELECT`。

---

### Milestone D1-M2：实现 F02 锁序助手与身份/成员/管理基础 RPC

**2026-10-24 本地 PASS**：`20261024032247_trusted_rpcs_and_locking.sql` 包含 L0/L1/L7 锁、非登录执行 owner、只读准入、成员生命周期与管理员安全 RPC；`004_membership_and_admin_rpcs.test.sql` **70/70 PASS**。

在 `supabase/migrations/` 下新增迁移文件（通过 `pnpm dlx supabase migration new trusted_rpcs_and_locking` 创建；禁止手编时间戳）：

1. **定义确定性 Advisory Lock 键映射函数（F02 §2.1）**：
   - 固定双 `int4` 命名空间：`class_id` 区分锁层级，`obj_id` 采用 `hashtextextended(key_text, FixedSeed)` 转 `int4`：
     - `private.acquire_l0_admin_write_lock()`：`PERFORM pg_advisory_xact_lock(1000, 1);`（全局管理写排他锁）
     - `private.acquire_l1_user_lock(p_user_id uuid)`：`PERFORM pg_advisory_xact_lock(1001, hashtext(p_user_id::text));`
     - `private.acquire_l7_pro_renewal_lock(p_user_id uuid, p_product_id uuid)`：`PERFORM pg_advisory_xact_lock(1007, hashtext(p_user_id::text || ':' || p_product_id::text));`
2. **实现只读准入与概览 RPC（无副作用）**：
   - `public.check_access(p_product_key text) RETURNS jsonb`（无 `capability` 参数）：
     - 检查顺序：`auth.uid()` 为空抛 401 (`AUTH_REQUIRED`) → 查 `platform_account_restrictions` 若 blocked 返回 HTTP 200 JSON `{"allowed": false, "reason": "ACCOUNT_RESTRICTED", ...}` → 查 `products` 若不存在或非 `active` 返回 `{"allowed": false, "reason": "PRODUCT_UNAVAILABLE", ...}` → 查 `product_memberships` 若无记录返回 `MEMBERSHIP_REQUIRED`、若 `left` 返回 `MEMBERSHIP_LEFT`、若 `suspended` 返回 `MEMBERSHIP_SUSPENDED` → 若成员为 `active`，聚合该用户在该产品下 `tier = 'pro' AND revoked_at IS NULL AND starts_at <= transaction_timestamp() AND (ends_at IS NULL OR ends_at > transaction_timestamp())` 的有效 Grant，返回 `allowed: true, reason: "OK", tier: "pro"|"free", pro_active: true|false, is_lifetime: boolean, current_period_ends_at: timestamptz, effective_ends_at: timestamptz, evaluated_at: timestamptz`。
   - `public.get_my_products() RETURNS jsonb`：返回当前登录用户可见的产品与成员/Pro 资格摘要列表。
   - `public.admin_check_access() RETURNS jsonb`：供 React-admin `authProvider` 检查当前会话是否满足 `private.is_platform_admin()`（含 `aal2`）。
3. **实现用户自助成员生命周期 RPC**：
   - `public.ensure_membership(p_product_key text)`：按 `L1 (本人) → L3 (产品 SHARE) → L5 (成员)` 锁序。产品非 `active` 抛 `PRODUCT_UNAVAILABLE`；账号 `blocked` 抛 `ACCOUNT_RESTRICTED`；无成员时插入 `active` 并写 `membership_events (action='join')`，返回 `created=true`；已是 `active` 幂等返回 `created=false`（不重复写事件）；若是 `left` 抛 `MEMBERSHIP_LEFT`；若是 `suspended` 抛 `MEMBERSHIP_SUSPENDED`。
   - `public.leave_product(p_product_key text)`：按 `L1 → L3 → L5` 锁序。`active → left`，写 `leave` 事件；不影响历史 Grant。
   - `public.rejoin_product(p_product_key text)`：按 `L1 → L3 → L5` 锁序。验证非 `blocked` 且产品 `active`；仅允许 `left → active`，写 `rejoin` 事件；若为 `suspended` 拒绝。
4. **实现管理员产品、成员与账号/管理员保底 RPC**：
   - 所有管理写 RPC 首行获取 **L0 全局排他锁**，紧接着复核 `private.is_platform_admin()`（未通过抛 403 `ADMIN_REQUIRED`）。
   - `public.admin_create_product(...)` / `public.admin_set_product_status(p_product_id uuid, p_status text, p_reason text)`：取 `L0 → L3 (产品 UPDATE) → L8`，更新状态并写 `admin_audit_log`；暂停产品不批量修改成员表。
   - `public.admin_suspend_membership(p_membership_id uuid, p_reason text)` / `public.admin_restore_membership(p_membership_id uuid, p_reason text)`：取 `L0 → L1 (目标用户) → L5 (成员 UPDATE) → L8`。封禁时若已是 `suspended` 不覆盖 `pre_suspend_status`；解封时精确恢复到 `pre_suspend_status`（`active` 或 `left`）并清空 `pre_suspend_status`，同事务写 `membership_events`。
   - `public.admin_block_account(p_target_user_id uuid, p_reason text)` / `public.admin_unblock_account(p_target_user_id uuid, p_reason text)` / `public.admin_grant_admin(p_target_user_id uuid, p_reason text)` / `public.admin_revoke_admin(p_target_user_id uuid, p_reason text)`：
     - 取 `L0 → L1 (目标用户) → L8`。
     - **M1 保底强制校验**：在 `admin_block_account` 和 `admin_revoke_admin` 执行变更后，同事务内统计 `SELECT count(*) FROM public.platform_admins pa WHERE pa.active = true AND NOT EXISTS (SELECT 1 FROM public.platform_account_restrictions par WHERE par.user_id = pa.user_id AND par.kind = 'blocked')`。若结果 `< 1`，立即抛出 409 `STATE_CONFLICT` 回滚事务，绝不允许将最后一名合格管理员封禁或撤权！

---

### Milestone D1-M3：实现兑换码核销（DEC-01）、批量发码与管理直授（DEC-05）RPC

**2026-10-24 本地 PASS**：`20261024033040_redemption_and_grant_rpcs.sql` 包含限流、DEC-01 防侧信道、160-bit Base32 码、首响明文/重放无明文、强类型幂等、Pro 顺延及撤销；`005_redemption_and_grant_rpcs.test.sql` **77/77 PASS**（包括技术故障完整事务回滚）。未获批准的永久码发行仍拒绝，SQL 内 `1000/批` 是技术保护阈值，不是批准的运营上限。

1. **`public.redeem_code(p_product_key text, p_code text) RETURNS jsonb`（唯一兑换入口）**：
   - **严格锁序与检查顺序（DEC-01 防侧信道）**：
     1. 校验 `auth.uid()`（未登录抛 401 `AUTH_REQUIRED`）。
     2. 获取 **L1（本人事务锁）**，检查 `platform_account_restrictions`；若 `blocked`，直接返回 HTTP 200 JSON `{"ok": false, "code": "ACCOUNT_RESTRICTED"}`（不抛异常，不查码）。
     3. 获取 **L2（本人 `redemption_rate_limits` 行 `FOR UPDATE`）**：修剪 `failed_at` 中早于 `transaction_timestamp() - interval '15 minutes'` 的记录。若剩余条数 `>= 10`，计算最早一条过期剩余秒数 `retry_after_seconds`，持久化修剪结果并正常返回 `{"ok": false, "code": "RATE_LIMITED", "retry_after_seconds": ...}`。
     4. 获取 **L3（声明产品 `products` 行 `FOR SHARE`）**：按 `p_product_key` 查找产品；若不存在或 `status <> 'active'`，递增 1 次 `failed_at`（或按契约返回 `PRODUCT_UNAVAILABLE`）并正常返回，不查码。
     5. 获取 **L5（本人在声明产品下的 `product_memberships` 行 `FOR UPDATE`）**：
        - 若成员存在且 `status = 'left'` → 记录 1 次失败尝试到 `failed_at`，正常返回 `{"ok": false, "code": "MEMBERSHIP_LEFT"}`（**关键：此时绝不查询 `redemption_codes` 表！对随机码、有效码、跨产品码响应完全一致**）。
        - 若成员存在且 `status = 'suspended'` → 记录 1 次失败尝试到 `failed_at`，正常返回 `{"ok": false, "code": "MEMBERSHIP_SUSPENDED"}`（**同样绝不查码！**）。
     6. 仅当成员为“无记录”或 `active` 时，规范化输入的 `p_code`（去空格、统一大写、去除分隔符连字符），计算 SHA-256 `v_code_hash`，获取 **L6（`redemption_codes` 行 `FOR UPDATE`）**：
        - 若码不存在，或 `code.product_id <> v_declared_product_id`（跨产品码）→ 追加 `transaction_timestamp()` 到 `failed_at`，正常返回 `{"ok": false, "code": "REDEEM_CODE_INVALID"}`。
        - 若该码存在且属于声明产品，**先检查本人是否已兑换过该码**（`EXISTS (SELECT 1 FROM public.redemptions WHERE code_id = v_code.id AND user_id = auth.uid())`）：若本人已兑，**不记为新失败尝试**，直接返回 `{"ok": false, "code": "REDEEM_ALREADY_USED"}`（优先于码随后用尽/过期/撤销）。
        - 若本人未兑换过该码，检查 `v_code.revoked_at IS NOT NULL OR (v_code.expires_at IS NOT NULL AND v_code.expires_at <= transaction_timestamp()) OR v_code.redeemed_count >= v_code.max_redemptions`：任一命中则追加失败尝试到 `failed_at`，正常返回 `{"ok": false, "code": "REDEEM_CODE_INVALID"}`。
     7. 获取 **L7（本人+该产品 Pro 续期锁）**：
        - 计算新 Grant 时段：若 `v_code.is_lifetime = true`，则 `v_starts_at = transaction_timestamp(), v_ends_at = NULL, v_mode = 'explicit_window'`；若为正天数 `grant_duration_days`，查询该用户在该产品下 `tier = 'pro' AND revoked_at IS NULL AND ends_at > transaction_timestamp()` 的最大 `ends_at`（记为 `v_anchor`），令 `v_starts_at = greatest(transaction_timestamp(), coalesce(v_anchor, transaction_timestamp()))`，`v_ends_at = v_starts_at + make_interval(days => v_code.grant_duration_days)`；首次授权的真实起止时间存入 Grant，后续同键重放必须返回第一次计算出的时段；若已存在有效永久 Pro，不能将其当作无穷周期来求锚点，须定义明确业务结果并写用例，`v_mode = 'duration'`。
     8. 执行 **L8（原子写入与审计）**：
        - 若当前无成员记录，插入 `product_memberships (status='active')` 与 `membership_events (action='join', actor_type='user')`。
        - 插入 `entitlement_grants (source_type='redeem_code', source_ref='code:'||v_code.id||':user:'||auth.uid(), ...)`。
        - 插入 `redemptions (code_id, user_id, product_id, grant_id)`。
        - 更新 `redemption_codes SET redeemed_count = redeemed_count + 1`。
        - 返回 `{"ok": true, "grant_id": ..., "product_key": ..., "tier": "pro", "starts_at": ..., "ends_at": ..., "is_lifetime": ...}`。
2. **`public.admin_create_codes(...) RETURNS jsonb`（M3 首响明文与批次幂等）**：
   - 锁序：`L0 (全局管理写排他) → L3 (产品 SHARE) → L8`。
   - 幂等校验：检查 `redemption_code_batches` 中是否存在 `(created_by = auth.uid(), request_id = p_request_id)`：
     - 若已存在：利用 `IS NOT DISTINCT FROM` 严格比较首次持久化的 `(product_id, tier, quantity, grant_duration_days, is_lifetime, max_redemptions_per_code, code_expires_at)`。若参数完全一致，返回 `{"idempotent_replay": true, "batch_id": ..., "plaintext_available": false, "codes": []}`（**严禁在重放时返回明文**）；若任一参数不同，抛 409 `STATE_CONFLICT`。
     - 若不存在：使用 `extensions.gen_random_bytes(20)`（160 bit 熵，高于 128 bit 底线）生成 Base32 规范化明文码，仅将 `sha256` 写入 `redemption_codes.code_hash`，写入 `admin_audit_log`（不含明文与 hash），并在当次函数返回值中一次性返回 `plaintext_codes` 数组。
3. **`public.admin_grant_entitlement(...) RETURNS jsonb`（DEC-05 直授与幂等）**：
   - 锁序：`L0 → L1 (目标用户) → L3 (产品 SHARE) → L7 (用户+产品 Pro 续期锁) → L8`。
   - 强制校验 `p_mode IN ('duration', 'explicit_window')` 互斥：
     - `duration` 模式必须传正整数 `p_duration_days` 且 `p_starts_at / p_ends_at` 为空，在 L7 锁内计算顺延时段；
     - `explicit_window` 模式必须传 `p_starts_at` 且显式指定 `p_is_lifetime = true`（此时 `p_ends_at IS NULL`）或 `p_ends_at > p_starts_at`（严禁因省略结束时间默认给永久）。
   - 以 `source_type = 'admin', source_ref = 'admin:' || auth.uid() || ':' || p_request_id` 做幂等比较：同键同参返回原 Grant 摘要，同键异参抛 409 `STATE_CONFLICT`。直授只写 Grant 与 `admin_audit_log`，不自动创建或修改 `product_memberships`。
4. **`public.admin_revoke_code` / `public.admin_revoke_batch` / `public.admin_revoke_grant`**：
   - 按 `L0 → (适用 L1/L3/L6/L7) → L8` 执行撤销并写 `admin_audit_log`。撤码不影响已生成的 Grant；撤 Grant 立即影响后续 `check_access` 派生结果。

---

### Milestone D1-M4：编写并执行完整 pgTAP 与双连接并发锁测试（LCK-01 ~ LCK-07）

**2026-10-24 本地 PASS**：`pnpm dlx supabase db reset --local --no-seed --yes` 从空隔离数据库 55322 重建四份迁移；五组 pgTAP 239/239 PASS；`python scripts/test-d1-concurrency.py` 真实双连接 `LCK-01`～`07` 全部通过，以 `pg_stat_activity.wait_event_type='Lock'` 确认等待，本次范围无死锁，测试夹具清理后零残留。

1. **新增 pgTAP 数据库测试脚本**：
   - `supabase/tests/database/003_entitlements_and_codes_rls.test.sql`：验证新表结构、CHECK 约束（含 `revoke_reason=NULL` 被拒、三值逻辑负例）、`code_hash` 零列权限暴露、`redemption_rate_limits` 零客户端权限、管理员 `aal1` vs `aal2` RLS 读取隔离。
   - `supabase/tests/database/004_membership_and_admin_rpcs.test.sql`：验证 `ensure_membership`、`leave_product`、`rejoin_product`、`admin_suspend/restore_membership`（含 `left → suspended → left` 精确恢复 I-09/I-10）、M1 最后一名合格管理员防自锁（I-27）、`private` 内核直接调用鉴权拦截。
   - `supabase/tests/database/005_redemption_and_grant_rpcs.test.sql`：验证 `redeem_code(product_key, code)` 的 DEC-01 错误隔离（REV-DEC01-01~08）、限流 10 次失败保留（R-11）、本人重复兑换 `REDEEM_ALREADY_USED`（R-05）、Pro 周期不重叠顺延（`starts_at` 等于未来锚点，`ends_at` 等于锚点加天数）与多 Grant 聚合（R-07/R-08/R-09/REV-FREEPRO-01~08）、DEC-05 直授幂等与异参冲突（REV-DEC05-01~07）、`admin_create_codes` 首响明文与重放不回显（R-01/R-12）。
2. **新增真实双连接并发锁测试脚本（`scripts/test-d1-concurrency.mjs` 或等效脚本）**：
   - 使用两个独立的 PostgreSQL 数据库连接（Connection A & Connection B）配合 `BEGIN` / 锁等待观察，实测验证 **LCK-01 ~ LCK-07**：
     - `LCK-01`：管理员 A 与管理员 B 并发互相 `revoke_admin` 或 `block_account` → 经 L0 串行化后必有一方成功、另一方返回 `STATE_CONFLICT`，绝不出现剩余合格管理员为 0。
     - `LCK-02`：同一用户同一产品并发两笔 `duration` 续期（兑换 + 直授，或双兑换） → 经 L7 串行化后总增加天数严格等于两笔之和，无时段重叠覆盖（R-13）。
     - `LCK-03`：两名用户并发兑换同一张 `max_redemptions = 1` 的兑换码 → 经 L6 行锁串行化后仅 1 人成功、1 人返回 `REDEEM_CODE_INVALID`，`redeemed_count = 1`（R-04）。
     - `LCK-04`：管理员 `suspend_membership` 与用户本人 `rejoin_product` / `redeem_code` 并发 → 经 L1/L5 串行化后封禁生效，旧请求绝不覆盖新封禁（I-10）。
     - `LCK-05`：同一用户并发提交无效码冲击限流 → 经 L2 行锁串行化后 `failed_at` 精确递增不丢失，满 10 次后稳定返回 `RATE_LIMITED`。
     - `LCK-06`：同一管理员并发提交相同 `(request_id)` 的 `admin_create_codes` 或 `admin_grant_entitlement` → 仅生成 1 份批次/Grant，异参返回 `STATE_CONFLICT`。
     - `LCK-07`：交叉并发执行上述全部写操作，验证 `deadlock_timeout` 下 **0 死锁（Zero Deadlocks）**。

---

### D1 实施前必须解决的锁与授权细节（P0）

- **产品状态并发**：原案 `FOR KEY SHARE` 无法阻止只改 `products.status` 的普通 `UPDATE`。采用 `FOR SHARE` 并测试管理员暂停与兑换/加入/授予的两连接竞争、锁等待、锁后复核。
- **private 调用权限**：`public SECURITY INVOKER` 外壳需要最小的 `private` schema `USAGE` 和精确内核签名 `EXECUTE`；`private` 非 exposed 不等于无法直接 SQL 调用。收紧默认 `PUBLIC EXECUTE`、owner 与 `search_path`，内核再次校验当前 JWT 主体、目标以及管理 `aal2` / blocked，测试直接调用的拒绝路径。
- **撤销 CHECK 的 NULL**：SQL `CHECK` 接受 `UNKNOWN`。`revoke_reason IS NOT NULL` 必须显式纳入撤销分支；测试 NULL、空白、部分撤销列和有效撤销组合。
- **周期续期**：新正天数周期从 `max(now, 最远未撤销周期 ends_at)` 开始，到该起点加天数结束；补未来未生效 Grant、并发、永久授权及撤销后的明确用例。
- **锁键与隐含锁**：固定 L0/L1/L7 映射与命名空间；32 位 hash 可能碰撞，需分析额外串行化；双连接测试纳入 FK/UNIQUE 隐含锁。
- **失败限流事务**：预期拒绝正常返回并提交失败计数；真实 SQL/权限/审计故障必须回滚。测试并发和时间窗口。
- **管理员 bootstrap**：迁移中不得包含真实 UUID；本地隔离身份在受控步骤中建立与清理。

## 3. 阶段 D1 退出门禁清单（Exit Gate Checklist）

Agent 只有在以下所有检查项均取得真实本地执行证据（Exit Code 0）后，方可宣告 D1 完成：

- [x] `pnpm dlx supabase db reset --local --no-seed --yes` 仅针对核对无误的本地隔离库重建全部迁移成功；重要警告应分析，不以无任何非致命提示作为通过条件。
- [x] `pnpm dlx supabase test db --local supabase/tests/database` 全部测试文件（`001` ~ `005`）100% PASS。
- [x] 双连接并发锁测试脚本覆盖 `LCK-01` ~ `LCK-07` 全部断言 PASS；记录连接数、隔离级别、锁等待与超时，在规定测试范围内未观察到死锁或竞态覆盖，不宣称理论上永无死锁。
- [x] 核查确认数据库中不存在 `public.plans` 表、不存在单参 `redeem_code(code)`、不存在 `code_hash` 的客户端 `SELECT` 授权。
- [x] 同步更新 `docs/Plans/aisencore-mvp/d1-database-and-trusted-rpc.md` 的验证记录表与 `docs/Plans/TODO.md`。


---

## 4. 已验证与待运行记录（Verification Log）

| 日期 | 命令或场景 | 退出码/结果 | 范围与限制 |
| --- | --- | --- | --- |
| 2026-10-24 | `pnpm dlx supabase migration up --local` (`20261024011528_core_foundation.sql`) | `0` / PASS | 本地 PG 17.11（端口 `55322`）已建立首批 6 张基础表与只读 RLS |
| 2026-10-24 | `pnpm dlx supabase test db --local supabase/tests/database` (`001` + `002`) | `0` / **35 PASS, 0 FAIL** | 验证表结构、显式列级 GRANT 与 SQL 合成身份下的成员本人读取隔离；不含 GoTrue 签名 JWT |
| 2026-10-24 | `pnpm dlx supabase migration up --local`（`20261024025852_entitlements_and_redemption_schema.sql`） | `0` / PASS | 在已运行的隔离 PG 17.11 上增量应用；尚未执行从零 `db reset` |
| 2026-10-24 | `pnpm dlx supabase test db --local supabase/tests/database`（`001`～`003`） | `0` / **92 PASS / 0 FAIL** | 新增 D1-M1 57 项结构、权限与 SQL 模拟 JWT/MFA；非真实签名 Auth / HTTP |
| 2026-10-24 | `pnpm dlx supabase db reset --local --no-seed --yes` | `0` / PASS | 已核对端口 55322 的空数据隔离 PostgreSQL，四迁移重建 |
| 2026-10-24 | `pnpm dlx supabase test db --local supabase/tests/database`（`001`～`005`） | `0` / **239 PASS / 0 FAIL** | SQL 合成 JWT claims、权限、受保护 RPC 与异常回滚，不是签名 JWT/HTTP |
| 2026-10-24 | `python scripts/test-d1-concurrency.py`（`LCK-01`～`07`） | `0` / **7/7 PASS** | 独立 PG 连接真实锁等待、M1 保底、Pro 续期、单次码、限流、幂等与产品状态竞争；合成数据已清理 |
| 待 D2 | 真实 GoTrue/JWT/HTTP/TOTP 及旧管理会话/错误映射 | `NOT RUN` | SQL 模拟不可作为上线权限验收 |
