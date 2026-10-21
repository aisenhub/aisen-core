# 公共 API 契约与 MVP 验收清单

> 状态：MVP **逻辑接口清单、最小数据契约、错误语义和验收标准的唯一权威**。函数名与字段为实施候选，非已实现的 RPC/路由、OpenAPI 或 SQL；客户端文案与限流/超时数值按实际产品调整。接入时序与信任边界见[公共 API 与 SaaS 接入](./public-api-and-saas-integration.md)。

## 1. 复用优先和接口集合

身份注册/登录/会话刷新/确认邮件/密码重置直接复用 **Supabase Auth**；不额外定义 `/login`、`/refresh` 或第二套产品 JWT。

| 分组 | 逻辑方法（候选函数名） | 调用者 | 承载方式 | 是否写入 |
| --- | --- | --- | --- | --- |
| 产品目录 | `ListAvailableProducts` | 匿名/已登录 | Data API 读取 `active` 产品公开字段 | 否 |
| 本人概览 | `GetMyProducts`（`get_my_products`） | 已登录用户 | RPC | 否 |
| 公共准入 | `CheckAccess(product_key, capability?)`（`check_access`） | 用户本人或携带其 JWT 的 SaaS 后端 | RPC | 否 |
| 本人成员 | `EnsureMembership(product_key)` | 首次合法业务接入 | RPC | 仅无记录时创建 |
| 本人成员 | `LeaveProduct` / `RejoinProduct` | 本人明确操作 | RPC | 是 |
| 兑换 | `RedeemCode(code)` | 已登录用户 | RPC | 是 |
| 本人权益查询 | 本人授权/兑换记录 | 已登录用户 | Data API + RLS | 否 |
| 管理：产品与套餐 | `SetProductStatus`、产品资料维护、`UpsertPlan` | 平台管理员 | RPC（写）/ Data API（读） | 是 |
| 管理：成员 | `SuspendMembership`、`RestoreMembership` | 平台管理员 | RPC | 是 |
| 管理：权益与兑换码 | `CreateCodes`、`RevokeCode`、`GrantEntitlement`、`RevokeGrant` | 平台管理员 | RPC | 是 |
| 管理：账号与管理员 | `BlockAccount` / `UnblockAccount`、`GrantAdmin` / `RevokeAdmin` | 平台管理员 | RPC | 是 |
| 管理：用户查询 | `AdminFindUser(user_id)` 精确查；`AdminSearchUsers(email?)` 分页列出/限量搜索 | 平台管理员 | Edge Function（Auth Admin API） | 否 |
| 管理：列表与审计 | 成员、授权、兑换码、事件、审计列表 | 平台管理员 | Data API + 管理员 RLS | 否 |

承载方式的依据见[数据库访问与可信事务](../database/database-access-and-transactions.md#2-执行机制决定)。账号注销首版为人工流程，**不提供**自助注销接口（见[平台管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)）。不同 SaaS 只需对接公共身份/成员/权益契约，各自业务 API 保持独立。

## 2. 输入身份与检查顺序

- 所有调用携带 `Authorization: Bearer <user JWT>`（经 Data API 时另附项目可公开的 publishable/anon key）；用户身份只取自经验证的令牌，请求体不得指定另一个操作者。
- 目标产品以 `product_key` 传入，产品不能自行宣称管理权限；SaaS 可信后端代用户转发 JWT 不代表获得管理员或机器身份。
- 管理员请求另经 `private.is_platform_admin()`（含 `aal2` 要求）检查。

**统一检查顺序**（唯一权威，针对受保护产品业务）：认证 → 平台账号限制 → 产品存在且 `active` → 当前产品成员 `active` → 所需权益（capability）→ SaaS 自己的具体资源/业务权限 → 产品自身的计量与执行。**不带 capability 的 `CheckAccess` 只判断成员层准入**；带功能键时检查 Free 基础套餐与当前有效授权的布尔并集，带额度键时返回非负上限，`allowed` 表示是否具有正额度，**已用量/是否仍可消耗由 SaaS 自己再判断**。成员/授权历史查询不机械要求 active；用户主动兑换、管理员管理与产品首次 ensure 另按专项规定跳过不适用的检查步骤。前五步由公共函数完成，后两步属于 SaaS。无需为每步单独发请求，同一次可信请求可复用合理的新鲜结果。

## 3. 候选请求与响应语义

- **`EnsureMembership(product_key)`**：返回 `membership_status=active` 与布尔 `created`；已 `left/suspended` 禁止隐式恢复。只在首次真正需登录的合法产品业务中调用，而非注册、登录、支付回调、产品展示或只读查询。
- **`GetMyProducts()`**：返回本人已关联产品的 `product_key`、`product_status`、`membership_status`，以及当前有效权益摘要（套餐键、`ends_at`）。
- **`CheckAccess(product_key, capability?)`**：
  - 不带 `capability`：判断能否使用该产品需成员资格的服务；
  - 带 `capability`：按产品 `free` 基础套餐 + 有效未撤销授权引用的套餐版本，功能取并集、同名额度取最大值；额度键返回 `limit`，`allowed` 只表示上限大于 0，**不替产品判断剩余额度**。无 Free 配置则无额外能力。
  - 返回 `allowed`、稳定 `reason`、`product_status`、`membership_status`（未加入表示为 `none`，不是持久化状态）、可选 `entitlement`（有效套餐键与最晚 `ends_at`）、`evaluated_at`。
  - 无副作用；不返回订单秘密、管理员封禁原因或他人信息；`allowed=true` 不代表对任意项目/文件有权限，也**不**扣减额度。
- **`RedeemCode(code)`**：成功返回产品、套餐、`starts_at`、`ends_at`、是否新建成员；预期业务失败返回 `ok=false` / `code` / 可选 `retry_after_seconds`，不提交成员/码/授权更改（限流尝试计数除外）；成员规则见[计费权益 §5](../domains/billing-and-entitlements.md#5-授权与产品成员状态的关系唯一权威)。
- **成员变更**：成功返回新状态；不向客户端透露 `pre_suspend_status` 或内部管理原因；重复无状态变化请求不重复写事件。
- **`CreateCodes(request_id)`**：首次创建成功返回本次明文码列表，**仅此一次**；重试同一 `request_id` 不重复发码且不返回明文。**`GrantEntitlement(request_id)`** 同样以独立幂等键防管理重试重复授权。
- **`AdminFindUser / AdminSearchUsers`**：只读管理员 Edge Function 在 JWT + `aal2` 与当前管理员资格复核后执行。ID 查用 Auth Admin `getUserById`，列表用分页 `listUsers`；**邮箱不是该 SDK 的原生过滤参数**，MVP 仅对有限分页集合做服务端精确匹配并返回 `search_incomplete` 表示未完整扫描，绝不能将未覆盖部分认定为查无此人。成员页按本页有限 UUID 逐个补邮箱，限制并发。返回字段仅 ID、邮箱等管理必需信息。

## 4. 错误模型

两种承载方式共享**同一套稳定业务码**：

- **一般 RPC（经 PostgREST）**：通过经过版本核验的 PostgreSQL/PostgREST 异常映射返回 HTTP 状态及稳定业务 `code`；**特殊情况是 `RedeemCode` 的预期失败与限流**，必须正常提交数据库失败尝试计数，因而返回 HTTP 200 + `ok=false, code, retry_after_seconds?`，不得在此路径抛出事务回滚的业务异常。技术错误仍回滚并按 5xx 处理；
- **Edge Functions**：参考 RFC 9457 Problem Details（`type/title/status/detail`）并扩展同一 `code`。

客户端根据明确的 HTTP 状态与稳定的业务 `code`（包括兑换 RPC 的 `ok=false`）做分支，不依赖文案。除兑换的业务拒绝特例外，成功响应用正常 HTTP 状态 + 简洁 JSON，不强制 `success/data` 包装。

| 稳定业务码 | HTTP | 语义 | 客户端建议 |
| --- | --- | --- | --- |
| `AUTH_REQUIRED` | 401 | 身份/令牌不合格 | 使用 Auth 现有登录或刷新流程 |
| `ADMIN_REQUIRED` | 403 | 非管理员或未完成 MFA | 阻断管理界面 |
| `ACCOUNT_RESTRICTED` | 403 | 平台账号被限制 | 不尝试加入或兑换 |
| `PRODUCT_UNAVAILABLE` | 403/404 | 产品不存在、未开放或暂停 | 不尝试隐式加入 |
| `MEMBERSHIP_REQUIRED` | 403 | 尚未加入 | 由合法首次业务触发 ensure |
| `MEMBERSHIP_LEFT` | 403 | 已主动退出 | 提示用户明确 rejoin |
| `MEMBERSHIP_SUSPENDED` | 403 | 产品成员被限制 | 禁止客户端解封 |
| `ENTITLEMENT_REQUIRED` | 403 | 缺少所需权益 | 保留正常 Free 能力 |
| `REDEEM_CODE_INVALID` | 400（兑换 RPC 业务拒绝为 HTTP 200） | 码不存在、已撤销、已过期或已用尽（不细分，避免泄露码状态） | 提示核对码 |
| `REDEEM_ALREADY_USED` | 409（兑换 RPC 业务拒绝为 HTTP 200） | 本人已兑换过该码 | 查询本人授权 |
| `RESOURCE_FORBIDDEN` | 403 | SaaS 业务资源权限不足（由 SaaS 返回） | 不泄露他人内容 |
| `STATE_CONFLICT` | 409 | 非法或竞争的状态转换 | 读取当前状态后交互 |
| `INVALID_INPUT` | 400/422 | 参数不合法 | 修正输入 |
| `RATE_LIMITED` | 429（兑换 RPC 业务拒绝为 HTTP 200） | 超过限制 | 有界退避；兑换 RPC 读取 `retry_after_seconds`，HTTP 429 遵循 `Retry-After` |
| `SERVICE_UNAVAILABLE` | 503 | 无法取得可信公共授权 | 云端新受保护操作不放行，不显示为“被封禁” |

## 5. 幂等、并发、撤权与服务故障

- `EnsureMembership`：`UNIQUE(user_id, product_id)` + 原子创建；重复 `active` 无新事件，`left/suspended` 不自动复活。
- `LeaveProduct`、`RejoinProduct`、封禁/解封：在当前状态条件下原子执行；旧并发请求不能覆盖新封禁。
- `RedeemCode`：码行锁 + 同用户/套餐续期事务锁 + `UNIQUE(code_id,user_id)` + `UNIQUE(source_type,source_ref)`；预期业务拒绝不改变码/授权/成员（仅保留限流尝试计数），真正的 SQL 异常整体回滚。
- 请求超时后不得断定失败，先读取本人授权/兑换状态再安全重试；`CreateCodes` 带稳定 `request_id` 重试不得重复生成，若首次明文丢失，只能按批次查询、撤销并以新的请求重新创建，不能从哈希恢复明文。
- 客户端缓存仅用于 UI；新的云端关键操作由可信服务端复核当前状态。不设 Redis 跨请求授权缓存或自签产品 JWT。
- 封禁或产品暂停后的下一次可信检查应拒绝新受保护操作；已开始任务和已签发短期 R2 URL 的撤权边界按产品风险定义。本地 Free 离线继续可用。
- 429/503 采用有限重试，不因鉴权服务故障默认通过。

## 6. MVP 验收用例（实施前标准，不代表已经运行）

**身份与成员**

| 序号 | 用例 | 必须满足的结果 |
| --- | --- | --- |
| I-01 | 普通用户注册/登录后只查看产品 | 无跨产品自动成员创建 |
| I-02 | 云端合法首次业务接入 | 后端以用户 JWT 调用 ensure，原子创建唯一 `active` |
| I-03 | 本地匿名 Free | 无登录、无成员、无公共联网依赖 |
| I-04 | 本地首次 Pro 或私有备份 | 本人 JWT 直调 ensure；后续按在线权益复核 |
| I-05 | 两设备同时首次加入 | 只有一条当前成员和一次 `join` 事件 |
| I-06 | 退出后登录、查询、支付回调或 ensure | 保持 `left`，不隐式 rejoin |
| I-07 | 用户明确 rejoin | 同一成员记录回 `active`；历史试用/Pro 不重置 |
| I-08 | 从 `active` 封禁再解封 | 回 `active`，不自动复活过期 Pro |
| I-09 | 从 `left` 封禁再解封 | 回 `left`，仍需用户重新加入 |
| I-10 | 重复封禁/并发旧请求 | `pre_suspend_status` 不被覆盖，旧请求不能解封 |
| I-11 | 产品暂停 | 不允许新受保护操作，不批量变更成员 |
| I-12 | 产品恢复 | 已退出/被封禁成员和过期权益不自动恢复 |
| I-13 | 普通用户访问他人成员/授权/审计 | RLS 与 RPC 都拒绝 |
| I-14 | 用户尝试直接写成员、管理员、授权、兑换码字段 | GRANT/RLS 拒绝 |
| I-15 | 状态变更成功但审计写入失败 | 整体事务回滚 |
| I-16 | JWT 有效但当前已被产品封禁 | 新关键授权请求拒绝 |
| I-17 | 产品 A 封禁、产品 B 正常 | B 不受影响 |
| I-18 | 平台级封禁后 | 所有产品的准入、加入、兑换均返回 `ACCOUNT_RESTRICTED`；成员原状态保留；解除后按原状态恢复 |
| I-19 | 缓存显示旧 Pro、真实授权已失效 | 云端新 Pro 操作拒绝 |
| I-20 | SaaS 无目标资源权限但有 Pro | 业务服务拒绝访问他人资源 |
| I-21 | 公共授权超时或 503 | 新云端受保护操作不放行，展示“不可验证”而非封禁 |
| I-22 | 成员加入成功但 SaaS 业务库失败 | 公共成员保持，业务初始化可重试 |
| I-23 | 密码找回/未验证邮箱/错误回调 | 未确认邮箱无法获得会话；无隐式加入 |
| I-24 | 在产品 A 本地登出，产品 B 会话 | B 不受影响 |
| I-25 | 用户经人工渠道申请注销 | 管理员可先施加平台限制；对外不提前声称全系统已删除 |
| I-26 | 管理员被撤销资格或未完成 MFA | 管理读取与管理函数均被拒绝 |

**权益与兑换码**

| 序号 | 用例 | 必须满足的结果 |
| --- | --- | --- |
| R-01 | 管理员批量创建兑换码 | 数据库只有哈希；明文仅在创建响应中出现一次；写审计 |
| R-02 | 未加入用户兑换有效码 | 同一事务内创建 `active` 成员、兑换记录与授权 |
| R-03 | `left` 或 `suspended` 用户兑换 | 拒绝，码的已用次数不变 |
| R-04 | 两个用户并发兑换只剩 1 次的码 | 仅一人成功，`redeemed_count` 不超过上限 |
| R-05 | 同一用户重复提交同一码 | 只产生一条授权，第二次返回 `REDEEM_ALREADY_USED` |
| R-06 | 码不存在/撤销/过期/用尽 | 统一返回 `REDEEM_CODE_INVALID`，不泄露具体原因，失败计数保留 |
| R-07 | 已有同套餐有效授权时再兑换周期码 | 新授权从现有最晚到期时间顺延 |
| R-08 | 永久授权码 | `ends_at` 为空，`CheckAccess` 持续允许直至撤销 |
| R-09 | 撤销兑换码 | 已产生的授权仍有效；撤销授权后 `CheckAccess` 立即拒绝对应能力 |
| R-10 | 产品 A 的码 | 不产生产品 B 的任何权益 |
| R-11 | 同一用户连续提交无效随机码 | 每用户滚动 15 分钟失败次数达到 10 后返回 `RATE_LIMITED`；计数不因预期业务拒绝被回滚 |
| R-12 | 明文丢失的 `CreateCodes(request_id)` 重试 | 不重复创建新码、不回显明文；可撤销原批次再以新 request_id 发码 |
| R-13 | 两个设备并发续期同用户同套餐 | 周期授权从串行化后的最新最晚到期时间顺延，不错误重叠 |
| R-14 | 套餐已有授予后尝试修改原 features/limits | 拒绝就地修改；新建套餐版本，已有 grant 对应权益不变 |

验收还应覆盖 401/403/404/409/429/503 区别、超时后的状态确认、资源不可枚举检查以及 RLS 正反向测试（推荐 pgTAP）；以上为**测试场景规格**，尚未创建自动测试或运行数据库。

## 7. 交付边界与尚待实施决定

进入开发前需最终确认：函数签名与返回 JSON 字段、PostgREST 自定义错误的版本兼容、Supabase CLI 与 Edge Runtime 版本、RLS 逐表 SQL、管理员种子与密钥保管、邮件服务与回调域名、限流参数、长任务/R2 撤权时效。

不建独立 OAuth/SSO 服务器、通用策略引擎、二次 JWT、跨库事务服务、复杂审计平台、Redis/事件总线，除非新需求和性能证据明确支持。

相关：[数据库访问与事务](../database/database-access-and-transactions.md)、[权益与兑换码数据约束](../database/entitlements-and-redemption-constraints.md)、[管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)、[统一登录与会话](../applications/auth-and-multi-saas-sessions.md)、[公共 API 接入](./public-api-and-saas-integration.md)。
