# Pro 授权与兑换码数据约束

> 状态：现行 Pro 授权/兑换码的逻辑约束与事务不变量。基础六表、Pro/兑换码/核销/限流五表与受保护 SQL RPC 已在隔离库由四份迁移从零重建；**239/239 pgTAP（SQL 模拟 JWT/MFA）** 和真实双连接 `LCK-01`～`07` **7/7 PASS**，真实 JWT/HTTP/TOTP 尚未验收。永久兑换码发行因权限未确认而拒绝，SQL 中 `1000/批` 仅是资源保险阈值，并非已批准运营数量上限。长期业务语义以[计费与权益](../domains/billing-and-entitlements.md)为准。

**待实现差距**：所有者已确认同产品当前有效永久 Pro 拒绝继续兑换周期/其他永久码且不耗码；现有 SQL 尚无此保护。业务权威见[计费规则](../domains/billing-and-entitlements.md)，验收 R-16 尚未执行。后续在现有用户/产品授权锁内检查并更新全部调用者/测试，不新增兼容入口；本文同步不改变数据库。

## 1. 逻辑表与最小字段

### 1.0 `products` 与 `product_memberships`

`products` 保存产品 key、名称、状态；`product_memberships` 独立保存当前成员状态与受控转换。**不新增 `products.free_features/free_limits`、公共业务额度或功能表**。匿名 AisenLens 本地 Free 由自身提供。

### 1.1 `entitlement_grants`：唯一的产品 Pro 授权事实

| 字段 | 最小约束 |
| --- | --- |
| `id` | PRIMARY KEY |
| `user_id` | FK 到 Auth 用户，NOT NULL |
| `product_id` | FK 到 products，NOT NULL；授权不可越产品生效 |
| `tier` | 首期固定 CHECK (= 'pro')；Free 不创建 Grant |
| `source_type/source_ref` | 来源类型、强唯一源引用；首期 `redeem_code/admin`，以后才增加已验证渠道 |
| `starts_at` / `ends_at` | start NOT NULL，end 可显式 NULL 表示永久；非空时严格 > start |
| `revoked_at/revoked_by/revoke_reason` | 可信撤销记录，不删除原授权 |
| 受控幂等元数据 | 同 actor、同 request_id 首次规范字段与可信算出的时段须可回读比较 |

`UNIQUE(source_type,source_ref)` 与受保护来源域构造保证重试不重复发放。`tier=pro` 不是用户表里的 `is_pro`；没有历史功能版本或 `plans.features/limits`，未来的产品功能发布不改历史 Grant。当前有效 Pro 仅按 `user_id,product_id,tier`、`starts_at<=trusted_now`、未撤销且 `ends_at IS NULL OR ends_at>trusted_now` 聚合；有任意有效 Pro 才显示 Pro。最后一个失效自然显示 Free（表示无 Pro），**不删除历史、不生成 Free Grant/降级行**。账号 blocked、产品暂停和成员 left/suspended 仍独立拒绝受保护在线操作。

**Pro 时间预设**：30/365 天或永久只作为发行/直授请求参数，**不新建三份 Pro 功能套餐、`plan_id` 或 `pro_v2` 功能版本**。按同用户同产品 Pro 为周期授权计算最长未撤销未来结束日，保持原 L7 锁及首次规范时段存证；永久身份不自然到期、仍可撤销。

### 1.2 `redemption_codes`：自有码发放 Pro 资格

| 字段 | 最小约束 |
| --- | --- |
| `id`、`code_hash` | PRIMARY KEY；哈希唯一，SHA-256 规范化高熵码，明文不落库/日志 |
| `product_id`、`tier` | 产品非空；MVP tier 固定 'pro'；不指向业务 `plan_id` |
| `grant_duration_days` | 正整数天数；首发运营默认 30/365 天。永久发行必须另行明确授权和显式语义，绝不把省略天数误判为永久 |
| `max_redemptions` / `redeemed_count` | 正整数与 `0 <= redeemed_count <= max_redemptions` |
| `expires_at` | 兑换码本身到期时间，与 Pro 授权结束时间分开 |
| `batch_id/batch_ordinal` | 可信批次和顺序、actor scoped request_id、唯一约束 |
| `revoked_at/revoked_by`、`created_by/created_at` | 可信发行和撤销事实 |

同批次发行只返回首响明文；重试同 actor/request_id 不再返回明文。旧有效码仍按照**首次记录的产品、Pro、授予天数**兑换，即便管理端后来删除了某个“期限快捷选项”；只有码自己过期/用尽/撤销、产品/成员资格不满足才拒绝。业务码优先级和 UNKNOWN/失明文后先撤销再新建保留。

### 1.3 无功能版本套餐表（变更前提）

原 `plans` 仅因公共功能/额度配置与冻结/克隆而存在，首期**从目标逻辑 schema 移除**。Admin 可保留 `30天`、`365天`、`永久（直授）` 操作预设，但它们不是数据库套餐实体。未来涉及支付定价/Team/Enterprise 时单独设计价格/发行模板实体，不提前混入功能策略。

### 1.4 `redemptions`（兑换记录）

| 建议字段 | 逻辑约束 |
| --- | --- |
| `id` | PRIMARY KEY |
| `code_id` | NOT NULL，引用 `redemption_codes.id` |
| `user_id` | NOT NULL |
| `grant_id` | NOT NULL，引用 `entitlement_grants.id` |
| `created_at` | 可信端生成 |

**核心不变量**：`UNIQUE(code_id, user_id)` 与 `UNIQUE(grant_id)`；`redemptions.user_id` 需引用 Auth，且兑换记录的码、用户、grant 三者归属必须在可信事务里一致。数据库以 `UNIQUE(source_type,source_ref)` 再次防重复。

### 1.5 `redemption_rate_limits`（MVP 最小抗枚举状态）

| 字段 | 约束及作用 |
| --- | --- |
| `user_id` | PRIMARY KEY，引用 Auth 用户 ID；普通用户不可读写 |
| `failed_at` | 受保护 RPC 独占更新的短数组或等价受控结构；保留最近 **15 分钟**失败时间戳（最多保留限流判定需要的 10 项） |
| `updated_at` | 可信时间；过期桶可安全清理 |

**限流行为**：每次请求先锁定/原子建立当前用户的限制行并修剪 15 分钟外的失败时间戳，达到 **10 次失败**时返回 `RATE_LIMITED` 和剩余重试秒数；对未兑换过该码的用户，未知/过期/撤销/用尽的码统一视为失败；本人已成功兑换的重复请求返回 `REDEEM_ALREADY_USED`，不记为新的一次失败尝试。失败计数更新后**正常返回带业务码的拒绝结果**，不能 `RAISE` 使整个事务回滚。与码/授权/成员写入的顺序必须保证拒绝时不消费码、不改成员/授权。数据库技术异常仍回滚事务；上线可另加请求源 IP 层的 WAF 限制，但不能用容易绕过的客户端本地限流代替数据库侧控制。此表只保存账号和最短必要安全信息，按 15 分钟窗口清理；不得在表中存放输入码/码哈希。

## 2. 事务不变量

所有状态变更通过[数据库访问与可信事务](./database-access-and-transactions.md)中约定的**单次受保护 PostgreSQL RPC** 完成（一个数据库函数调用处于一次数据库事务内）。普通用户无直接表写权限。

1. **`redeem_code(product_key, code)`**：按现行 L0～L8 安全锁序、声明产品 + left/suspended 先拒绝、本人限流、查码/核销/Grant 原子事务；校验 `redemption_codes.product_id` 同产品且 `tier=pro`，Grant 源为 redeem_code，授予期限读取首次码发行的可信时长。不可再以旧 `plan_id` 判权；重复兑换、撤销、未知及失败计数语义维持原有约束。
2. **`admin_create_codes(product, tier, duration_days, config, quantity, request_id)`**：只允许 `tier=pro` 且启用产品；明确正天数/合法时段，不接受 Free 或业务功能列表。与原 M3 相同的 actor-scoped request_id、强类型配置规范、NULL 安全比较、旧请求 UNKNOWN 查询、哈希保存与首响明文独占规则继续适用；同产品码不得跨平台兑现。
3. **`admin_revoke_code(code_id, reason)`**：只设置 `revoked_at`，不影响已有授权；写审计。
4. **`admin_grant_entitlement(user, product, tier, mode, duration_days?, starts_at?, ends_at?, reason, request_id)`（DEC-05）**：只允许指定产品 `tier=pro`，原 `duration` 正天数可信顺延或 `explicit_window` 完整起止（显式 NULL 才永久）、同 actor request_id 幂等语义和 L7 并发锁保持；不写会员布尔字段，Grant 与审计原子写入。
5. **`admin_revoke_grant(grant_id, reason)`**：设置撤销字段并写审计；重复撤销不重复写入。
6. **仅会员资格管理命令**：不实现 `admin_upsert_plan`、`admin_update_product_free_capabilities`、功能版本克隆/指针切换；Pro 发行时长经发码/直授参数指定。管理员只能在受控写接口中修改码或 Grant 的明确生命周期事实，不能编辑 SaaS 功能策略。

**续期时间事实**：正天数新 Grant 的 `starts_at` 应从 `max(trusted_now, 当前同用户同产品未撤销周期 Grant 最远 ends_at)` 确定，`ends_at = starts_at + duration`；不得以 `starts_at=now` 同时使用远期锚点扩展 `ends_at` 制造重叠区间。首次计算的真实时段须被幂等重试复用；永久有效期另行处理，不当作无穷数值相加。撤销 CHECK 中要求撤销时间、操作者、非空理由同时具备，`CHECK` 必须显式拒绝 NULL/UNKNOWN 绕过。

**并发要点**：多人同码依靠行锁 + CHECK 防超量；同一人同码依靠 `UNIQUE(code_id,user_id)` 与来源幂等键；所有影响同一用户+产品的 Pro 周期续期的可信操作先采用一致的事务级锁顺序（如以用户/套餐派生的 advisory transaction lock），再检查未来未撤销的最长到期时间，避免并发读旧值造成重叠。尽量把授权时段计算与写入放在同一 RPC 中。

**产品配额与计量不是 Core 实体**：AisenLens 备份 `ready+reserved` 容量仍由其专用可信元数据/R2 事务预留和核验；AI 自带 API Key、导出次数和存储额度都不进入公共会员数据库。本轮不设计跨 SaaS 扣减/余额表。

### 2.1 管理写入幂等与可读取字段（DEC-05 已批准）

**发行批次**逻辑键至少为 `(created_by, request_id)`，唯一竞争后必须**重新读取首次请求的持久化参数**再判断同键同参数；等价输入须定义强类型规范化，包括 `max_redemptions` 缺省与显式 null 的不同、`grant_duration_days` / `expires_at` 的缺省和显式 null 等价规则、UTC 时间戳微秒精度、数量与 Pro 产品及授予时长组合。DEC-05 已批准优先**保存强类型首次配置列并按 NULL-safe 值比较**；旧 SHA-256 `config_fingerprint` 仅在必要且语义不能重建时保留，删前必须通过并发、异参冲突与旧数据回归；绝不能仅因 request_id 相同就返回成功。

**人工直授**用 actor-scoped `admin:<actor_id>:<request_id>` 作为可信源键，对目标 user/product、`tier=pro`、授予模式、首次规范化时段与 reason 做完整幂等语义比较；相同参数重试只返回原授权非秘密摘要，同键异参 `STATE_CONFLICT`。`duration` 与 `explicit_window` 必须互斥且可信计算首次持久化；`ends_at=NULL` 只有明确永久才合法，不得用字段缺失默认永续。

**暴露面**：`code_hash`、管理请求指纹、幂等元数据、JWT、密钥、码明文都不是普通 Data API 可读列。列级 GRANT 和客户端 `select=*` 不是天然兼容；普通用户的合法查询应走经真实 `GRANT/RLS/security_invoker` 验证的**安全投影**或明确允许列，不为了修 42501 授予隐藏列 SELECT。码 hash 只在 private 受保护函数访问；管理员查询码列表也必须是无 hash/无明文安全视图。安全投影与指纹精简物理版本在实现时定稿，必须以 F05-C01～12 验证真实 HTTP/SQL、列 GRANT、空值和重放。

## 3. 访问控制（RLS / GRANT）

| 对象 | 普通 authenticated 用户 | 平台管理员（RLS 读取） | 写入 |
| --- | --- | --- | --- |
| 产品与授权资格（无 plans） | 根据本人已关联的产品身份和安全状态查询；普通用户只能读获准的公共元数据 | 管理员可查必要状态/Pro Grant，不可读取产品业务功能/额度 | 新产品及运行状态仅经受保护函数 |
| `entitlement_grants` | 仅本人行 SELECT | 全部 SELECT | 仅可信函数 |
| `redemptions` | 仅本人行 SELECT | 全部 SELECT | 仅 `redeem_code` |
| `redemption_codes` | **禁止**（哈希也不暴露） | 仅允许**非哈希元数据列** SELECT（列级 GRANT/安全投影视图 + 管理员 RLS），如批次、状态、使用次数；`code_hash` 对所有 Data API 客户端不授 SELECT | 仅管理函数 |
| `redemption_rate_limits` | 禁止 | 默认禁止（运维按需在安全入口查看聚合状态） | 仅 `redeem_code` 更新 |

匿名用户对上述表无任何访问权限。普通用户/管理员共用数据库角色 `authenticated`，不能仅凭管理员 RLS 隐藏 `code_hash` 列；必须**不授予该列的 Data API SELECT**，使用列级 GRANT 或经验证安全的只读投影，写函数所有者在内部访问哈希。管理员读取策略复用 `private.is_platform_admin()`，见[数据库访问与可信事务](./database-access-and-transactions.md)。

## 4. 生命周期与删除

- 退出、封禁、产品暂停均不修改授权、兑换码或兑换记录。
- 授权与兑换记录属于必要的计费事实，账号注销时的保留/去标识化随注销政策确定，不使用 `ON DELETE CASCADE` 自动清除。
- 期限快捷预设变化不修改历史 Pro 码或 Grant；产品暂停不自动删除已有授权。

## 5. 待实施前确定

可信 RPC 的强类型幂等回读与跨表归属校验、可信时间计算、兑换码生成字符集（熵不低于 128 bit）、发行数量上限、限流清理、未来渠道订单是否同库、真实 RLS/GRANT 和 pgTAP/并发测试。**产品功能/额度 JSON 规则及 plans 表不再是 Core DDL 工作项**。

## 相关架构

- [统一计费与产品权益](../domains/billing-and-entitlements.md)
- [数据库逻辑约束与最小审计](./database-constraints-and-audit.md)
- [数据库访问与可信事务](./database-access-and-transactions.md)
- [API 契约与 MVP 验收](../backend/api-contract-and-mvp-acceptance.md)
