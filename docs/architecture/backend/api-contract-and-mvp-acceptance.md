# 公共 API 契约与 MVP 验收清单

> 状态：MVP **逻辑接口清单、最小数据契约、错误语义和验收标准的唯一权威**。D1 SQL RPC 已通过 239 项本地 pgTAP 与 7 项双连接锁测试。D2 的受限 `admin_lookup_users` SQL 已实现（47 项 pgTAP，累计 286），本地 GoTrue/Kong/PostgREST/Mailpit 真实签名 JWT、TOTP `aal2`、部分 HTTP 401/403/409/422/业务 200 场景实测通过。完整 AUTH-P01～P12、密码恢复、性能、OpenAPI/生产服务仍未验收。客户端文案与限流/超时数值按实际产品调整。接入时序与信任边界见[公共 API 与 SaaS 接入](./public-api-and-saas-integration.md)。

## 1. 复用优先和接口集合

身份注册/登录/会话刷新/确认邮件/密码重置直接复用 **Supabase Auth**；不额外定义 `/login`、`/refresh` 或第二套产品 JWT。

| 分组 | 逻辑方法（候选函数名） | 调用者 | 承载方式 | 是否写入 |
| --- | --- | --- | --- | --- |
| 产品目录 | `ListAvailableProducts` | 匿名/已登录 | Data API 读取 `active` 产品公开字段 | 否 |
| 本人概览 | `GetMyProducts`（`get_my_products`） | 已登录用户 | RPC | 否 |
| 会员/准入认证 | `CheckAccess(product_key)`（`check_access`，无 capability 参数） | 本人 JWT / 转发本人 JWT 的 SaaS 可信后端 | RPC | 否 |
| 本人成员 | `EnsureMembership(product_key)` | 首次合法业务接入 | RPC | 仅无记录时创建 |
| 本人成员 | `LeaveProduct` / `RejoinProduct` | 本人明确操作 | RPC | 是 |
| 兑换 | `RedeemCode(product_key, code)` | 已登录用户 | RPC | 是 |
| 本人权益查询 | 本人授权/兑换记录 | 已登录用户 | Data API + RLS | 否 |
| 管理：产品与套餐 | `SetProductStatus`、产品资料维护、`UpsertPlan` | 平台管理员 | RPC（写）/ Data API（读） | 是 |
| 管理：成员 | `SuspendMembership`、`RestoreMembership` | 平台管理员 | RPC | 是 |
| 管理：权益与兑换码 | `CreateCodes`、`RevokeCode`、`GrantEntitlement`、`RevokeGrant` | 平台管理员 | RPC | 是 |
| 管理：Pro UNKNOWN 只读核查 | `admin_find_grant_request(p_request_id)` | 原提交 AAL2 管理员 | INVOKER 公共薄代理 + 可信私有核查 | 否 |
| 管理：账号与管理员 | `BlockAccount` / `UnblockAccount`、`GrantAdmin` / `RevokeAdmin` | 平台管理员 | RPC | 是 |
| 管理：用户查询 | `AdminFindUser(user_id)` 精确查；`AdminSearchUsers(email?)` 分页列出/限量搜索 | 平台管理员 | 优先受限 PostgreSQL 只读 RPC；安全/性能不成立时单次受保护 Edge 聚合 | 否 |
| 管理：列表与审计 | 成员、授权、兑换码、事件、审计列表 | 平台管理员 | Data API + 管理员 RLS | 否 |

承载方式的依据见[数据库访问与可信事务](../database/database-access-and-transactions.md#2-执行机制决定)。账号注销首版为人工流程，**不提供**自助注销接口（见[平台管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)）。不同 SaaS 只需对接公共身份/成员/权益契约，各自业务 API 保持独立。

**原授权结果核查合同**：请求丢失成功响应后，原提交管理员使用原 `request_id` 先调用 `admin_find_grant_request`，后端从实时 JWT/AAL2/管理员资格确定 actor，只检索此 actor 的管理授权，不接受客户端指定 actor。`found=false` 不泄露其他管理员记录；`found=true` 仅提供原 Grant ID、目标、产品、模式、期限、理由与撤销事实供核对，不返回内部 `source_ref`，也不给客户端该列的直接 SELECT 权限。已提交且参数匹配则结束 UNKNOWN、不再写入；不存在才能用相同参数及 ID 重试。刷新/异常/失联会撤销此前的“查无”许可，唯一来源键继续阻止查询与重试之间的并发重复写入。

## 2. 输入身份与检查顺序

- 所有调用携带 `Authorization: Bearer <user JWT>`（经 Data API 时另附项目可公开的 publishable/anon key）；用户身份只取自经验证的令牌，请求体不得指定另一个操作者。
- 目标产品以 `product_key` 传入，产品不能自行宣称管理权限；SaaS 可信后端代用户转发 JWT 不代表获得管理员或机器身份。
- 管理员请求另经 `private.is_platform_admin()`（含 `aal2` 要求）检查。

**统一检查顺序（公共 Core）**：JWT 身份 → 平台账号 blocked → 产品存在且 active → 本产品成员 active（不符合时返回对应稳定理由）→ 同产品 Pro Grant 的可信时间/撤销查询 → 返回当前会员资格。**至此公共 Core 结束**；SaaS 自己再校验对应功能规则、目标资源/文件属主、业务额度及执行。不能向 Core 传 `capability` 或请求它计算 Features/Limits。成员历史查询与本人兑换/首次 EnsureMembership 按既定特殊顺序，不机械要求 active。

### 2.1 错误优先级和拒绝时允许的副作用（X-01）

下表纳入**已批准的 DEC-01 新兑换签名**；设计决定已生效不等于 SQL、负向测试或旧公开入口下线已完成。任何分支不泄露兑换码哈希/明文、其他用户邮箱、管理员名单与内部封禁理由。

| 操作 | 检查顺序与传输结果 | 被拒绝时可保留的副作用 |
| --- | --- | --- |
| `CheckAccess` | JWT 无效→401；可信业务判断 blocked→产品不可用→none/left/suspended；业务拒绝 HTTP 200 + `allowed=false/reason`；成功附 Pro/Free **资格而非业务功能权限**；可信计算故障→503/5xx，不得伪装 Free | **无**，资格查询不得有副作用 |
| `EnsureMembership` | 认证→blocked→产品 active→成员；none 首次合法创建，active 幂等；left/suspended 拒绝 | **无**；只有成功才创建成员和 join 事件 |
| `LeaveProduct / RejoinProduct` | 认证→blocked→当前成员状态及合法转换；竞争/不合法状态返回冲突 | **无**；成功状态和事件同事务 |
| `RedeemCode(product_key, code)`（批准合同） | 认证→blocked→本人限流→声明产品 active→**声明产品成员 left/suspended 先于查码一致拒绝**→none/active 才查询码及核对归属；跨产品/未知/撤销/过期/用尽统一失败；声明成员合法后本人已兑优先于随后码失效；技术故障 503/5xx | **仅约定的失败尝试/限流记录**；不写成员、grant、redemption、码次数或成功审计。**不应存在旧单参入口泄露真实码归属的旁路** |
| 管理 Data API / RPC | JWT→aal2→实时管理员 active + 非 blocked→目标参数和状态；M1 保底冲突为 409 `STATE_CONFLICT` | **无**；不写成功审计 |
| Admin 身份只读查询 | JWT 真实性→aal2→实时管理员资格→受限 UUID[]/精确邮箱、字段白名单/分页；SQL 不可安全读取时 Edge 聚合，未完整搜索必须标记 `search_incomplete` | **无**，不暴露是否存在未覆盖的用户 |

传输例外固定：`CheckAccess` 业务拒绝为 HTTP 200 + `allowed=false`；`RedeemCode` **可预期**业务拒绝为 HTTP 200 + `ok=false,code`（含限流），不得把未知技术异常吞为业务失败；其他受控写入按 401/403/409/429/503 等稳定业务码映射。数据库写入遵循[受保护 RPC/锁合同](../database/rpc-security-and-locking-contract.md)。DEC-01 已批准，必须同步更新领域/DB/调用方，并真实运行 REV-B01；正式迁移前不可声称风险已在服务端修复。

## 3. 候选请求与响应语义

- **`EnsureMembership(product_key)`**：返回 `membership_status=active` 与布尔 `created`；已 `left/suspended` 禁止隐式恢复。只在首次真正需登录的合法产品业务中调用，而非注册、登录、支付回调、产品展示或只读查询。
- **`GetMyProducts()`**：返回本人可见产品的 `product_key/product_status/membership_status`、`tier=free|pro`、`pro_active`、`current_period_ends_at`、`effective_ends_at`、`is_lifetime` 等可信资格摘要；无 Pro Grant 派生 Free，不创建 Free Plan/Grant，不泄露其他产品数据。
- **`CheckAccess(product_key)`**（唯一目标签名，**无 capability 参数**）：
  - 返回公共准入 `allowed`、稳定 `reason`、`product_status`、`membership_status`、`tier=free|pro`、`pro_active`、可信 `evaluated_at` 和可用 Pro 期限摘要（`current_period_ends_at`、`effective_ends_at`、`is_lifetime`）。Free 只代表没有当前有效 Pro，并不代表 blocked/left/suspended 可以访问。
  - 当前 Pro 的判断由同用户/同产品 `starts_at <= trusted_now`、未撤销、`ends_at IS NULL OR ends_at > trusted_now` 的 Grant 动态聚合；其他有效 Pro 存在时不因一条撤销误降级；未来授权不得提前生效。无任何授权不要求创建 Free Grant。
  - **不再返回** Features/Limits、capability 权限、额度上限或业务消耗；业务功能和资源属主由 SaaS 的可信执行端决定。即使 `allowed=true` 也不代表可以导出 4K 或读取任何资源。纯本地匿名 Free 不调用此在线查询。
  - 已认证且可以可信判定的允许/拒绝均 HTTP 200 + allowed/reason；无效令牌用 401，身份/授权查询故障用 5xx/503，**不可错误地把故障变成 `tier=free` 或业务拒绝**；本 RPC 无写入副作用。
- **`RedeemCode(product_key, code)`**：仅兑现当前产品 `tier=pro` 与码发行时已经固定的授权期限；成功写 Grant 来源/可信区间，不能改用户等级或产品功能表。跨产品码、撤销/失效码、left/suspended、重复兑换与防枚举限流沿用原规则。
- **上线前唯一新合同（项目根 `AGENTS.md` 强制规则）**：公开兑换只实现 `redeem_code(product_key,code)`；更新当前全部调用方及测试，**不实现/不保留旧 `redeem_code(code)` 的兼容入口、别名或灰度分支**。若本地草案已有旧签名，直接替换并确保其不可执行，不需要旧客户端版本发布序列；只针对当前接口执行错误侧信道与 RPC 权限负向验证。
- **`GrantEntitlement`（DEC-05）**：以当前产品 `tier=pro` + `mode=duration` 正天数（同用户同产品 Pro 周期可信续期）或 `mode=explicit_window` 完整起止/显式永久 + actor-scoped request_id 受控发放；不通过 plan_id/Features/Limits 执行发放，不默认把缺失结束时间设为永久。
- **成员变更**：成功返回新状态；不向客户端透露 `pre_suspend_status` 或内部管理原因；重复无状态变化请求不重复写事件。
- **`CreateCodes(request_id)`**：首次创建成功返回本次明文码列表，**仅此一次（可在该响应内复制/下载）**；重试同一 `request_id` 不重复发码且不返回明文，后续不存在明文导出接口。**`GrantEntitlement(request_id)`** 同样以独立幂等键防管理重试重复授权。
- **`BlockAccount` / `RevokeAdmin`**：对目标操作使用共同的“至少保留一名 `active` 且未全局 `blocked` 的管理员”事务保护；违反或并发冲突返回 `STATE_CONFLICT`，不写变更。该约束仅用于防止管理入口被规则性锁死，不替代 MFA 设备丢失时的受控运维恢复。
- **`AdminFindUser / AdminSearchUsers / AdminBatchUserEmails`（DEC-06）**：优先使用受保护 PostgreSQL 只读 RPC 查询有限 UUID[] / 精确邮箱及有界分页；仅能由当前 JWT+`aal2`+active 管理员+非 blocked 调用，private definer 最小只读授权、强制字段白名单且不得开放 `auth.users` Data API 或对匿名/普通用户授予 SELECT。**须先在真实 Supabase Auth/RLS/owner 环境证明 SQL 可安全访问**；无法证明或负向测试失败时，不再要求用户二次选择，直接回退单次受保护 Edge 批量聚合、内部有并发与扫描上限的 Auth Admin SDK 查询。**SDK 没有可假定的原生 UUID[] 批量接口**；有限搜索未覆盖需 `search_incomplete`，本页邮箱失败仅降级 UUID，不伪称不存在。返回字段限 id/管理必需邮箱等。

## 4. 错误模型

两种承载方式共享**同一套稳定业务码**：

- **无副作用的 `CheckAccess`**：对已认证且**完成可信计算**的授权结论固定使用 **HTTP 200 + `allowed` / `reason`**；业务层的 `ACCOUNT_RESTRICTED`、`PRODUCT_UNAVAILABLE`、`MEMBERSHIP_REQUIRED/LEFT/SUSPENDED`、`ENTITLEMENT_REQUIRED` 在这里是响应 `reason`，**不是 HTTP 403**。未认证用 401，无法可信判定用 503/5xx；不返回“伪造的 deny”掩盖故障。
- **有副作用的普通 RPC（经 PostgREST）**：通过经过版本核验的 PostgreSQL/PostgREST 异常映射返回 HTTP 状态及稳定业务 `code`；**特殊情况是 `RedeemCode` 的预期失败与限流**，必须正常提交数据库失败尝试计数，因而返回 HTTP 200 + `ok=false, code, retry_after_seconds?`，不得在此路径抛出事务回滚的业务异常。技术错误仍回滚并按 5xx 处理；
- **Edge Functions**：参考 RFC 9457 Problem Details（`type/title/status/detail`）并扩展同一 `code`。

客户端根据具体接口的 HTTP 状态、`CheckAccess.allowed/reason` 或稳定业务 `code`（包括兑换 RPC 的 `ok=false`）做分支，不依赖文案。除查询准入结论和兑换业务拒绝这两项明确例外外，表中 HTTP 是**写入/拒绝性操作或 SaaS 业务 API** 的默认映射；成功响应用正常 HTTP 状态 + 简洁 JSON，不强制 `success/data` 包装。

| 稳定业务码 | HTTP | 语义 | 客户端建议 |
| --- | --- | --- | --- |
| `AUTH_REQUIRED` | 401 | 身份/令牌不合格 | 使用 Auth 现有登录或刷新流程 |
| `ADMIN_REQUIRED` | 403 | 非管理员或未完成 MFA | 阻断管理界面 |
| `ACCOUNT_RESTRICTED` | 403（`CheckAccess` 为 200 + reason） | 平台账号被限制 | 不尝试加入或兑换 |
| `PRODUCT_UNAVAILABLE` | 403/404（`CheckAccess` 为 200 + reason） | 产品不存在、未开放或暂停 | 不尝试隐式加入 |
| `MEMBERSHIP_REQUIRED` | 403（`CheckAccess` 为 200 + reason） | 尚未加入 | 由合法首次业务触发 ensure |
| `MEMBERSHIP_LEFT` | 403（`CheckAccess` 为 200 + reason） | 已主动退出 | 提示用户明确 rejoin |
| `MEMBERSHIP_SUSPENDED` | 403（`CheckAccess` 为 200 + reason） | 产品成员被限制 | 禁止客户端解封 |
| `ENTITLEMENT_REQUIRED` | 403（`CheckAccess` 为 200 + reason） | 缺少所需权益 | 保留正常 Free 能力 |
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
- `RedeemCode`：先锁声明产品/成员后查码、无需回补低序计划行锁，码行锁 + 同用户/套餐续期事务锁 + `UNIQUE(code_id,user_id)` + `UNIQUE(source_type,source_ref)`；锁定已存在的码后先检测**本人重复兑换**，再校验未兑换用户的码是否用尽/撤销/过期；预期业务拒绝不改变码/授权/成员（仅保留限流失败尝试计数），真正的 SQL 异常整体回滚。
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
| I-18 | 平台级封禁后 | 所有产品的 `CheckAccess` 返回 HTTP 200 + `allowed=false,reason=ACCOUNT_RESTRICTED`；加入等写入 RPC 按错误契约拒绝、兑换为 HTTP 200 + `ok=false,code=ACCOUNT_RESTRICTED`；成员原状态保留，解除后按原状态恢复 |
| I-19 | 缓存显示旧 Pro、真实授权已失效 | 云端新 Pro 操作拒绝 |
| I-20 | SaaS 无目标资源权限但有 Pro | 业务服务拒绝访问他人资源 |
| I-21 | 公共授权超时或 503 | 新云端受保护操作不放行，展示“不可验证”而非封禁 |
| I-22 | 成员加入成功但 SaaS 业务库失败 | 公共成员保持，业务初始化可重试 |
| I-23 | 密码找回/未验证邮箱/错误回调 | 未确认邮箱无法获得会话；无隐式加入 |
| I-24 | 在产品 A 本地登出，产品 B 会话 | B 不受影响 |
| I-25 | 用户经人工渠道申请注销 | 管理员可先施加平台限制；对外不提前声称全系统已删除 |
| I-26 | 管理员被撤销资格或未完成 MFA | 管理读取与管理函数均被拒绝 |
| I-27 | 仅剩一名合格管理员被自封禁/撤权，或两名管理员并发相互封禁/撤权 | 不得导致合格管理员变为零；冲突返回 `STATE_CONFLICT`，原状态/管理读写入口仍可用，拒绝操作无变更审计 |
| I-28 | `CheckAccess` 对未加入、已退出/封禁、产品暂停、缺少权益、全局 block 及验证故障 | 可可信计算的拒绝为 HTTP 200 + `allowed=false/reason`；无效 JWT 为 401，公共服务故障为 503 且 SaaS 不放行 |

**权益与兑换码**

| 序号 | 用例 | 必须满足的结果 |
| --- | --- | --- |
| R-01 | 管理员批量创建兑换码 | 数据库只有哈希；明文仅在创建响应中出现一次；写审计 |
| R-02 | 未加入用户兑换有效码 | 同一事务内创建 `active` 成员、兑换记录与授权 |
| R-03 | `left` 或 `suspended` 用户兑换 | 拒绝，码的已用次数不变 |
| R-04 | 两个用户并发兑换只剩 1 次的码 | 仅一人成功，`redeemed_count` 不超过上限 |
| R-05 | 同一用户重复提交已成功兑换的单次码，后续该码已用尽/过期/撤销 | 只产生一条授权；**声明产品/成员 none 或 active 且身份、全局限制、限流通过之后**，已兑本人返回 `REDEEM_ALREADY_USED`；若已经 left/suspended 必须先拒绝且不查码，不能再次消费码次数 |
| R-06 | 尚未兑换过该码的用户输入不存在/撤销/过期/用尽码 | 统一返回 `REDEEM_CODE_INVALID`，不泄露具体原因，失败计数保留 |
| R-07 | 已有同产品 Pro 周期 Grant 再兑换正天数 Pro 码 | 新的 Pro Grant 从该用户同产品最远未撤销未来周期截止日可信顺延；不能错误重叠或更改已兑现的授权 |
| R-08 | 管理员明确授予永久 Pro | `ends_at` 必须显式 NULL 且 Grant 当前有效；直到撤销或被产品/账号/成员限制，不能把永久当成免验证凭证 |
| R-09 | 撤销兑换码 | 只阻止未来兑换，已产生 Pro Grant 仍有效；若要撤销既有 Pro 需明确撤 Grant，随后重新派生资格 |
| R-10 | 产品 A 的码 | 不产生产品 B 的任何权益 |
| R-11 | 同一用户连续提交无效随机码 | 每用户滚动 15 分钟失败次数达到 10 后返回 `RATE_LIMITED`；计数不因预期业务拒绝被回滚 |
| R-12 | 明文丢失的 `CreateCodes(request_id)` 重试 | 不重复创建新码、不回显明文；可撤销原批次再以新 request_id 发码 |
| R-13 | 两设备同时给同一用户同产品续 Pro 周期 | 经同产品 Pro 可信锁计算最远未来有效时段，两个周期授权的开始/截止不会错误覆盖或重复顺延 |
| R-14 | 修改具体 SaaS 的 Pro 功能配置 | 不涉及 AisenCore schema/Admin/RPC；测试各 SaaS 自己执行权限/配额，Core 历史 Grant 和码不变 |
| R-15 | 管理端移除/隐藏 30 天期限预设后，已发行同产品 Pro 码仍有效 | 按码首次保存的正授权天数兑现；新发行按当前有效预设，撤码才阻止旧码 |

验收还应覆盖 401/403/404/409/429/503 区别、超时后的状态确认、资源不可枚举检查以及 RLS 正反向测试（推荐 pgTAP）；以上为**测试场景规格**，当前累计 286 项本地 PostgreSQL/模拟角色 pgTAP、LCK-01～07 双连接 PASS；核心 GoTrue/HTTP/TOTP 签名 JWT 的已实现场景部分通过真实 API 测试，**全部业务矩阵、客户端、性能与生产端到端仍未验收**。

### 6.1 补充业务场景（本组端到端用例尚未运行）

| 新场景 | 正向/负向边界与可复核证据 |
| --- | --- |
| REV-DEC01-01～08 | `redeem_code(product_key, code)` 对 left/suspended 输入随机码、真实码及跨产品码在码定位前相同拒绝；none/active 的未知/跨产品/撤销/过期/用尽码统一失败；本人历史已兑仅在成员准入通过后优先；失败计数可保存而不修改成员/grant/码次数，旧单参不可作为探针，双连接无死锁 |
| REV-DEC02-01～08 | Edge 仅接收限定白名单小型 JSON，拒绝超体积、异常 schema、视频/API Key/Token；JWT/成员/Pro/属主无旁路；R2 final 唯一条件写，客户端不能写 final；DB pending 过期预留逻辑释放与 R2 物理清理分离，R2/DB 单侧成功、断线、同键并发、删除失败的对账与恢复可证实 |
| REV-DEC03-G0/G3 | 当前 V6 离线 Demo 只验证模拟交互；React-admin 的 Theme/视觉仍待所有者审阅，UI-G3 真实页面截图、键盘、响应式、MFA、秘密和错误码 E2E 尚未运行 |
| REV-FREEPRO-01～08（2026-10-23 最终修订） | 任何 Admin/公开写入不得生成 Free Code/Grant 或业务 Features/Limits；**Core 不创建 plans 表**，同产品 Pro 的每次成功兑换/直授才新增来源明确的 Grant，不修改用户永久等级；未来 Grant 不提前使 Pro 生效；最后一份 Pro 到期/撤销后只派生 Free 并保留历史，多份仍有效 Pro 不误降级；跨产品不串权，blocked/left/suspended 和 401/503 仍独立，匿名 AisenLens 本地 Free 不联网 |
| REV-DEC04-01～05（2026-10-23 再修订） | AisenCore 无 `free_features/free_limits` 或公共功能版本；CheckAccess 只认证同产品 Pro 资格和可信有效期；免费/专业功能策略属于 SaaS；首发只有 Pro 码/Grant；产品功能更新不变更 Core 表/API/旧 Grant；本地匿名 Free 仍离线 |
| REV-DEC05-01～07 | `duration` 与 `explicit_window` 完全互斥，永久必须显式 ends_at=null；首次可信时段保存，重试不按新时钟重复顺延；同 actor/request_id 相同输入幂等、异参冲突；空值/时区/未来生效与安全投影/RLS/GRANT 负向 |
| REV-DEC06-01～06 | 仅当前真实 `aal2` 且 active Admin/非 blocked 可批量读必要邮箱，UUID[]/精确邮箱/分页/字段有界；anon/普通用户/撤权/过期拒绝；实际 auth.users SQL 权限、查询计划及 P50/P95 验证；SQL 不安全则一次受保护 Edge 聚合，本页失败只降级 UUID 并返回不完整标记 |

**验证口径**：上述是 I-01～I-28、R-01～R-15 的补充业务验收，不是已执行或已通过数量；实施须留存真实 SQL/HTTP/R2/浏览器日志、环境版本、失败注入与回退证据。
## 7. 交付边界与尚待实施决定

进入开发前需最终确认：函数签名与返回 JSON 字段、PostgREST 自定义错误的版本兼容、Supabase CLI 与 Edge Runtime 版本、RLS 逐表 SQL、管理员种子与密钥保管、邮件服务与回调域名、限流参数、长任务/R2 撤权时效。

不建独立 OAuth/SSO 服务器、通用策略引擎、二次 JWT、跨库事务服务、复杂审计平台、Redis/事件总线，除非新需求和性能证据明确支持。

相关：[数据库访问与事务](../database/database-access-and-transactions.md)、[权益与兑换码数据约束](../database/entitlements-and-redemption-constraints.md)、[管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)、[统一登录与会话](../applications/auth-and-multi-saas-sessions.md)、[公共 API 接入](./public-api-and-saas-integration.md)。
