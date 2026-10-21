# 数据库访问隔离、可信写入与事务边界

> 状态：MVP 架构设计结论。采用 Supabase Auth + PostgreSQL Grants/RLS + **受保护 PostgreSQL 函数承载全部状态变更** + 少量 Edge Functions 处理需要密钥的场景；不是已部署的表结构、SQL、迁移或安全策略。实现前需按当时官方文档核验具体 API 与版本。

## 1. 唯一权限判定边界

- **Supabase Auth** 验证“用户是谁”；`user_id` 来自经校验的用户凭据（数据库内为 `auth.uid()`），不能来自客户端任意填写的操作者字段。
- **AisenCore 公共可信逻辑**（受保护 PostgreSQL 函数，必要时 Edge Functions）负责产品状态、成员状态转换、权益与兑换、平台管理资格。
- **各 SaaS 可信业务后端**负责具体项目/文件/任务的属主及业务权限；公共 `allowed=true` 不替代产品业务授权。
- **PostgreSQL Grants 与 RLS** 是数据库安全边界，不是成员生命周期引擎；不能用 UI 隐藏或 JWT 中的成员状态替代可信执行时的检查。
- 所有产品共用一套逻辑状态含义，**不**要求所有产品采用同一个数据库或 Supabase Project；远程 SaaS 通过公共用户 JWT 调用公共接口接入。

## 2. 执行机制决定

### 2.1 读：Data API（PostgREST）+ RLS

- 普通用户、各 SaaS（携带用户 JWT）与 React-admin **读取**公共数据，统一走 Supabase Data API，由 RLS 限定范围；列表、筛选、排序、分页直接复用 PostgREST 能力，不为每个资源重写读接口。
- **管理员读取**：定义 `private.is_platform_admin()`——位于不经 Data API 暴露的 Schema、`STABLE`、`SECURITY DEFINER`、固定 `search_path=''` 并对表/函数全限定名，读取 `auth.uid()`、当前 `platform_admins.active`、无 `platform_account_restrictions`、当前 JWT `aal='aal2'` 后返回布尔值。函数属受控数据库角色，授予 RLS 所需的最小 `EXECUTE`，不向 Data API 暴露该 Schema 或全表资格信息。禁止可搜索路径上的对象遮蔽。管理读取策略在限定表上以 `(select private.is_platform_admin())` 形式组合，避免逐行重复检查；管理函数进入时再次鉴权。
- **`auth.users` 不经 Data API 暴露**。Admin 的用户查询与邮箱展示，通过一个**只读** Edge Function：先验证用户 JWT 真实性 → 用**该 JWT** 在普通权限上下文调用受保护的管理员资格只读 RPC（含 `aal2` 与当前数据库资格）→ 通过后才创建仅服务端可用的 Auth Admin 客户端。**UUID 精确查询**调用 `auth.admin.getUserById(uid)`；**用户列表**调用 `auth.admin.listUsers({page,perPage})`；**邮箱精确检索**仅在受控小规模范围逐页 `listUsers` 后在服务端匹配标准化邮箱，限制扫描页数/处理时间、返回 `search_incomplete` 以明确告知超出覆盖范围，**不得误报不存在**。Auth Admin SDK 不提供通用批量按 ID/邮箱过滤查询：成员列表先走 RLS 分页，再对**该页有限条 UUID** 使用并发上限的 `getUserById` 补必要邮箱（失败时可延迟加载/提示），不可假设存在单次批量 API 或全表扫描。输出只有经白名单允许的 ID、邮箱及少量必要字段，禁止泄露 Auth 私有元数据/令牌。规模增长后改为受限管理员只读身份投影，不提前复制公共用户主表。

### 2.2 写：每个状态转换 = 一个受保护 PostgreSQL 函数

Edge Function 中的 `supabase-js` 每次调用都是独立请求，**无法跨语句构成事务**。因此所有“状态变更 + 审计”必须在**单个 PostgreSQL 函数**内完成锁定、条件检查、更新与审计插入：

| 函数类别 | 身份获取 | 授权 | 调用方式 |
| --- | --- | --- | --- |
| 用户自助（`ensure_membership`、`leave_product`、`rejoin_product`、`redeem_code`） | 函数内 `auth.uid()`，不接收 `user_id` 参数 | 函数内检查平台限制、产品与成员状态 | 客户端或 SaaS 后端**以用户 JWT 直接调用 RPC**，无需中间 Edge Function |
| 管理操作（产品状态、成员封禁/解封、套餐、发码/撤码、授予/撤销权益、管理员授予/撤销、全局限制） | 函数内 `auth.uid()` | 函数首行要求 `private.is_platform_admin()`，否则拒绝 | React-admin 以管理员 JWT 调用 RPC |
| 只读准入（`get_my_products`、`check_access`） | 函数内 `auth.uid()` | 只返回本人结果，无副作用 | 同上 |

`RevokeAdmin` 与 `BlockAccount` 是同一个**管理入口保底不变量**的两个写入路径：在共同的数据库事务级锁/确定性锁序下检查目标变更后仍有至少一名 `active` 且未被全局 `blocked` 的管理员。条件不满足返回 `STATE_CONFLICT` 并保持原状；不能仅从当前 JWT 的管理员身份推断目标操作安全，也不能把两次独立 SDK 调用当作一个检查事务。

`check_access` 属于**无副作用的准入查询**：认证成功且数据库能够可信判定时，包含全局 `blocked` 在内的业务拒绝均按 API 契约正常返回 `allowed=false/reason`（HTTP 200），而不是在函数内抛出 HTTP 403；无效身份和真正的技术故障分别以 401、503/5xx 表示。其他有副作用的函数仍按各自的拒绝契约执行。

函数实现约束：`SECURITY DEFINER` **只用于上述定点函数**；固定空 `search_path`、完全限定数据库对象名，指定最小权限函数所有者；`EXECUTE` 先从 `PUBLIC`/`anon` 撤销再按需授予 `authenticated`。**可由 PostgREST 调用的 RPC 包装函数位于 Data API 暴露 Schema（如 public）**，私有权限辅助函数/敏感表在非暴露 Schema；不要把所有 RPC 放入 private 后却无法调用。禁止公共业务函数任意执行动态 SQL，所有管理函数进入时逐次鉴权，身份不可由请求参数冒充。业务错误转换见[API 契约](../backend/api-contract-and-mvp-acceptance.md)；`redeem_code` 的限流与预期业务拒绝须正常提交计数，因此按约定返回业务失败结构而不是抛出可回滚的异常。底层表对 `authenticated` 不授予 INSERT / UPDATE / DELETE。

### 2.3 Edge Functions：只承载必须持有密钥的场景

- Supabase Auth Admin API 调用（用户查询、必要的账号封禁/会话管理）；
- 外部支付 Webhook 接收与订单回查（阶段 2）；
- R2 临时访问授权签发（首个需要云文件的产品接入时）。

Edge Function 使用高权限客户端时，**也必须先验证最终用户/管理员资格、目标与参数**，并尽量通过调用上述 PostgreSQL 函数完成数据库写入，保持事务与审计规则只有一处实现。

## 3. 最小数据库访问矩阵

| 对象 | 未登录 anon | 普通 authenticated 用户 | 平台管理员（React-admin） | 写入路径 |
| --- | --- | --- | --- | --- |
| `products` | 仅 `active` 产品的公开字段（通过列级授权或公开视图） | 同左 | 全部 SELECT | 管理函数 |
| `product_memberships` | 禁止 | 仅本人行 SELECT | 全部 SELECT | 用户自助/管理函数 |
| `membership_events` | 禁止 | 不开放 | 全部 SELECT | 仅在状态变更函数内插入 |
| `platform_admins` / `platform_account_restrictions` | 禁止 | 禁止 | SELECT | 管理函数 |
| `admin_audit_log` | 禁止 | 禁止 | SELECT | 仅在管理函数内插入 |
| 套餐、授权、兑换码、兑换记录、失败限流 | 见[权益与兑换码数据约束](./entitlements-and-redemption-constraints.md#3-访问控制rls--grant) | 同左 | 同左 | 同左 |
| `auth.users` | 不经 Data API 暴露 | 不经 Data API 暴露 | 经管理员 Edge Function 调用 Auth Admin API | Supabase Auth |

## 4. PostgreSQL 与 Supabase 安全约束

1. 可通过 Data API 访问的 Schema 中，逐表开启 RLS，配置最低限度的 `GRANT` 和逐操作 Policy；`GRANT` 与 RLS 是两个不同的校验层，缺一不可。
2. `authenticated` 只说明身份类型，不能自动授权读取全部行；本人读取约束为 `auth.uid() = user_id`，必要索引覆盖 `user_id`、`product_id`。
3. 普通用户不能直接改写 `user_id`、`product_id`、`status`、`pre_suspend_status`、管理员状态、授权或审计；避免“改属主”绕过授权。
4. JWT 中用户可修改的 `user_metadata` 不可作为管理权限依据；过期的声明也不能代表当前成员资格。
5. `service_role` / secret key 只用于 Edge Functions，不放入浏览器、桌面端或独立 SaaS 后端。
6. 视图须按实际数据库版本核查 RLS / `security_invoker` 行为；**私有辅助函数放在非暴露 Schema，RPC 包装函数放在明确暴露的 Schema 并显式控制 EXECUTE**；不得对普通客户端暴露任意参数的高权限读/写例程。

## 5. 单事务执行路径

调用方以 JWT 调用一个 RPC → 函数内取得 `auth.uid()` 并检查管理员资格/平台限制/产品状态 → `SELECT … FOR UPDATE` 或条件更新权威行 → 写变更 → 同事务插入 `membership_events` 或 `admin_audit_log` → 一并提交或回滚。

成员合法状态转换的业务真相以[成员生命周期](../domains/membership-lifecycle.md)为准，事务不变量以[数据库逻辑约束与最小审计](./database-constraints-and-audit.md)和[权益与兑换码数据约束](./entitlements-and-redemption-constraints.md)为准。多个独立 HTTP / Data API 请求不是一个事务；独立 SaaS 自身数据库初始化失败不回滚公共成员，由产品业务端幂等重试，不引入跨库分布式事务。

## 6. 故障默认

- 公共授权暂时不能可信确认 → 新的云端受保护操作默认不放行，返回“暂时无法验证”，**不**冒充成员被封禁（错误映射见 API 契约）。
- 单次请求内可复用必要授权判断；不跨请求长期信任客户端或 SaaS 本地缓存。
- 已执行中的业务和预签名 R2 URL 可能存在撤权延迟，按对应业务操作/短期授权约束处理。原本离线免费的本地功能不因公共服务中断而禁用。

## 7. MVP 不做与落地验收

不构建通用多租户 RBAC、Redis 撤权广播、第二套签名令牌、全表审计触发器链或全量事件溯源。

**实施时必须验证**（推荐 Supabase CLI 本地环境 + pgTAP）：anon 看不到成员与授权；普通用户只能看到自己；普通用户不能直接写成员、管理员、授权、兑换码或审计；`left/suspended` 不能通过 RPC 继续使用；管理员身份不能靠用户可编辑字段伪造，且未完成 MFA 的管理员会话无法读取或调用管理函数；状态与审计共同提交/回滚；并发下成员唯一、封禁不被旧请求覆盖、兑换码不超量。

参见：[数据库约束与最小审计](./database-constraints-and-audit.md)、[权益与兑换码数据约束](./entitlements-and-redemption-constraints.md)、[公共 API 接入](../backend/public-api-and-saas-integration.md)、[平台管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)。

官方依据：[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Database Functions](https://supabase.com/docs/guides/database/functions)、[Edge Functions 身份验证](https://supabase.com/docs/guides/functions/auth)、[Auth Admin 分页 listUsers](https://supabase.com/docs/reference/javascript/auth-admin-listusers)、[按 UUID getUserById](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid)。
