# 套餐、产品授权与兑换码数据约束

> 状态：**MVP 逻辑数据模型与事务不变量**。字段名为建议，不是已执行的 DDL、迁移或 RLS 策略；未经另行授权不建库、不执行 SQL。业务规则以[统一计费与产品权益](../domains/billing-and-entitlements.md)为准，本文只定义存储、约束与一致性边界。

## 1. 逻辑表与最小字段

### 1.0 `products` 当前 Free 家族指针（DEC-04）

逻辑字段 `products.current_free_plan_id` 可空，通过 `(current_free_plan_id,product_id)` 复合外键引用同产品的 `plans(id,product_id)`；候选 `plans.plan_family='free'` 或等价可信约束，防止该指针指向 Pro。首次 `plan_key='free'` 不改 key，后续 `free_v2` 等各有独立 id；迁移保留旧 code/grant FK 和版本不变量。NULL 意味着未配置公共 Free 附加能力。管理员只有通过 L0/L3/L4 一致锁序的受保护 RPC 才能切换指针与写审计；匿名本地 Free 仍由 Aisenlens 本地能力承载。

### 1.1 `plans`（产品套餐）

| 建议字段 | 逻辑约束 |
| --- | --- |
| `id` | PRIMARY KEY |
| `product_id` | NOT NULL，引用 `products.id` |
| `plan_key` | NOT NULL；`UNIQUE(product_id, plan_key)` |
| `name` | NOT NULL |
| `features` | 功能开关键集合（如 JSON 数组）；默认空；成员权益求并集 |
| `limits` | 非负数值上限键值（如 JSON 对象）；默认空；同名额度求最大值，不相加 |
| `default_duration_days` | 可空；空表示由授权来源决定 |
| `is_active` | 停用后不可创建该套餐的新兑换码或管理员新授权；已发行且仍有效的兑换码可继续兑换，已存在授权不受影响 |
| `created_at`, `updated_at` | 可信端维护 |

每产品允许多个不可变 Free 家族版本，仅 `current_free_plan_id` 指向一个当前版本；默认 Free 不需 grant，无 Free 指针时无附加能力。**Free 家族权益字段自首次创建成功起即永久冻结**（即使没有任何 grant/code 引用，也不能原位改 features/limits，必须新建版本切指针）。**非 Free 套餐一旦被任意 `entitlement_grants` 或 `redemption_codes` 引用（包括已撤销码）**，其 `product_id`、`plan_key`、`features`、`limits` **冻结不可变**；修改功能与额度应创建新套餐版本，旧码和旧授权继续引用原版本。可信 `admin_upsert_plan` 与发码/授予函数须使用兼容的套餐行锁序，在同一事务内检查引用，避免“检查时无引用、随后并发发码”的竞态。停用旧套餐只阻止**新发行/新直接授予**，已发行有效码仍可兑换；停止旧码兑现须显式撤销码/批次。套餐不保存价格与支付渠道配置；价格随渠道接入再建模。

### 1.2 `entitlement_grants`（产品授权，当前权益的唯一事实来源）

| 建议字段 | 逻辑约束 |
| --- | --- |
| `id` | PRIMARY KEY |
| `user_id` | NOT NULL，引用 `auth.users.id` |
| `product_id` | NOT NULL，引用 `products.id` |
| `plan_id` | NOT NULL，引用 `plans.id`；须与 `product_id` 属于同一产品（在 `plans` 增加 `UNIQUE(id, product_id)`，以 `(plan_id, product_id)` 复合外键引用它） |
| `source_type` | NOT NULL；MVP 仅 `redeem_code`、`admin`，以后按渠道增加 |
| `source_ref` | NOT NULL；兑换为确定性 `code_id:user_id`，**人工授予为可信端构造的 `admin:<actor_uuid>:<request_uuid>`**（用户原始 request_id 仍由调用者提供；必须按 actor 分域），未来外部渠道为带商户/渠道命名空间的权威订单 ID |
| `admin_request_metadata`（受控技术列/私有幂等行） | DEC-05 已批准：首次记录 actor/request_id、mode、规范输入与可信时间结果；只有被安全强类型列完整覆盖的信息才可去掉冗余 SHA-256 指纹；元数据不向普通 Data API 暴露 |
| `starts_at` | NOT NULL |
| `ends_at` | 可空；**NULL = 永久非周期授权**；非空时须大于 `starts_at` |
| `revoked_at`, `revoked_by`, `revoke_reason` | 撤销信息；撤销不删除记录 |
| `created_at` | 可信端生成 |

**核心不变量**：`UNIQUE(source_type, source_ref)` 保证同一来源只授权一次；兑换的确定性来源引用在创建 redemptions 前即可计算，**先创建 grant，再以 grant_id 创建 redemption**，避免循环非空外键。人工授予使用 actor-scoped `request_id` 的稳定来源键，并保留**首次请求规范语义及计算结果的受保护幂等证据**：同 actor/UUID 同有效参数重试只读原 grant，目标/时间/reason/套餐参数不同返回 `STATE_CONFLICT`，不生成重复授权/审计。现有授权事实表仍唯一，未新增业务表；未来订单引用包含商户作用域。授权记录只新增与撤销，不物理删除、不回写历史时间。请求签名、首笔语义比较与 NULL 契约见本文 §2.1；F05 中的迁移与测试排程不作为长期安全规则的唯一来源。

建议索引：`(user_id, product_id)`，满足“当前有效权益”查询。

### 1.3 `redemption_codes`（自有兑换码）

| 建议字段 | 逻辑约束 |
| --- | --- |
| `id` | PRIMARY KEY |
| `code_hash` | NOT NULL，UNIQUE；仅存对规范化、高熵兑换码计算的 SHA-256，不存明文、不在日志或审计保存明文 |
| `product_id`, `plan_id` | NOT NULL；以 `(plan_id, product_id)` 复合外键指向同产品的套餐，拒绝跨产品发码 |
| `grant_duration_days` | 可空；NULL = 永久授权 |
| `max_redemptions` | NOT NULL，≥ 1，默认 1 |
| `redeemed_count` | NOT NULL，默认 0；CHECK `0 ≤ redeemed_count ≤ max_redemptions` |
| `expires_at` | 可空；码本身的兑换截止时间 |
| `batch_id`, `batch_ordinal` | 由一次发码 `request_id` 唯一确定的批次与批次内序号；`UNIQUE(created_by, batch_id, batch_ordinal)`，同一管理员的同一批次不可重复创建；重复 `request_id` 但配置不同应拒绝为请求冲突 |
| `revoked_at`, `revoked_by` | 撤销信息 |
| `created_by`, `created_at` | 可信端生成 |

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

1. **`redeem_code(product_key, code)`（用户本人，DEC-01）**：以 `auth.uid()` 验证身份，在统一 [F02 L0～L8 长期事务锁合同](./rpc-security-and-locking-contract.md) 中先取目标本人 L1 并排除 blocked、L2 失败限流锁；按不可信声明 `product_key` 先取得 L3 产品锁并验证产品，再取 L5 **已有**成员锁（没有成员不得提前创建）；left/suspended 不接触码表即一致拒绝并计入本人失败窗口 → 对 none/active 才规范化哈希、非锁定定位码 ID（未知/跨产品同一错误），然后取得 L6 码 `FOR UPDATE`，**优先查该本人已有兑换**：若已有返回 `REDEEM_ALREADY_USED`，哪怕码后来用尽、过期或撤销，也不新增授权/失败计数（前提是身份/blocked/限流检查通过）→ 对尚未兑过的人检查最新码状态、真实码产品 ID 与声明产品一致并复核产品/成员合法性；`plans.is_active` **不阻止旧已发行有效码兑现** → 按 L7 用户+计划事务锁计算续期 → 最终 L8 **仅在成功分支**创建缺失的 active 成员+join event → **先 INSERT grant** → 再 INSERT redemption → 更新 `redeemed_count+1`。预期业务拒绝结构化正常返回以保留限流计数，不能提交任何新增成员/授权/码次数；技术异常整体回滚。无成员时的唯一键/隐含锁仍需真实双事务验证。
2. **`admin_create_codes(product, plan, config, quantity, request_id)`**：管理员/`aal2`、产品/计划资格通过后**以持久化强类型首次配置进行 NULL-safe 语义比较，不能从字段完整还原时才保留受限 canonical 指纹**：缺省 `max_redemptions=1`、显式 JSON null 对该字段无效，`grant_duration_days/expires_at` 缺省/NULL 等价、时间规范为 UTC 微秒；`UNIQUE(created_by,request_id)` 保护同 actor 幂等且配置不同返回冲突；只存密码学码 hash、审计同事务；**首次成功响应才返回明文**，所有重放均不回显。实际业务单批上限 U08 未确认。
3. **`admin_revoke_code(code_id, reason)`**：只设置 `revoked_at`，不影响已有授权；写审计。
4. **`admin_grant_entitlement(user, product, plan, mode, duration_days?, starts_at?, ends_at?, reason, request_id)`（DEC-05）**：管理员与 MFA 验证 → 由可信 actor 构造 `admin:<actor_uuid>:<request_uuid>` 来源键并比较首次持久化的完整输入语义（`duration` 正天数且不允许时间字段；`explicit_window` 必须同时提交 starts_at 与 ends_at，明确 null 才永久），在 L7 中仅首次可信计算顺延时间 → 相同请求返回原 grant，无新增审计；异参 `STATE_CONFLICT` → 原子 INSERT 授权+审计；不改变成员状态。
5. **`admin_revoke_grant(grant_id, reason)`**：设置撤销字段并写审计；重复撤销不重复写入。
6. **`admin_upsert_plan(...)` / `admin_set_default_free_plan(product, free_plan_id)`**：创建套餐或修改**非 Free、且尚无 grant/已发行 code 引用**的套餐能力；**Free 家族无论是否已引用均不得修改权益字段，只能新建版本后原子切换当前 Free 指针**。非 Free 存在任一引用时只能修改非权益展示字段（如名称）、停用，权益变化须创建新套餐版本（如 `pro_v2`）。与发码/授权函数共用套餐行锁序，防止并发破坏冻结条件；写审计。

**并发要点**：多人同码依靠行锁 + CHECK 防超量；同一人同码依靠 `UNIQUE(code_id,user_id)` 与来源幂等键；所有影响同一用户+套餐续期的可信操作先采用一致的事务级锁顺序（如以用户/套餐派生的 advisory transaction lock），再检查未来未撤销的最长到期时间，避免并发读旧值造成重叠。尽量把授权时段计算与写入放在同一 RPC 中。

**消费型额度不是当前 MVP 已批准的实体**：`plans.limits` 表示产品权益的上限，不能被客户端直接当成可扣余额修改。Aisenlens 备份的真实 `ready+reserved` 使用量由产品可信元数据事务预留、核验后结算，跨 R2 与 PostgreSQL 的补偿按 F03；**用户自带 AI API Key 的模型调用不由 AisenCore 通用 RPC 扣费**。若将来确需按次消费，必须先完成服务端可信计算消费额、正数/溢出边界、actor/资源属主、原子幂等与限额的安全验证（测试反例可见开发计划），**不新建公共余额表作为当前 D1 交付**。

### 2.1 管理写入幂等与可读取字段（DEC-05 已批准）

**发行批次**逻辑键至少为 `(created_by, request_id)`，唯一竞争后必须**重新读取首次请求的持久化参数**再判断同键同参数；等价输入须定义强类型规范化，包括 `max_redemptions` 缺省与显式 null 的不同、`grant_duration_days` / `expires_at` 的缺省和显式 null 等价规则、UTC 时间戳微秒精度、数量与套餐产品组合。DEC-05 已批准优先**保存强类型首次配置列并按 NULL-safe 值比较**；旧 SHA-256 `config_fingerprint` 仅在必要且语义不能重建时保留，删前必须通过并发、异参冲突与旧数据回归；绝不能仅因 request_id 相同就返回成功。

**人工直授**使用稳定、actor-scoped `admin:<actor_id>:<request_id>` 的 `source_ref`，对有效的 user/product/plan、授权时段与可信归一化 reason 作首次请求语义校验；同参数重试只返回**原 grant 的非秘密摘要**，绝不重新授予或重复审计；同键不同参数返回 `STATE_CONFLICT`。直授已批准两条互斥 `mode=duration` 顺延与 `mode=explicit_window` 显式时段的规范；旧显式签名通过可审计迁移保持含义，不能默认为永久。`ends_at=NULL` 是永久授权，不能与字段遗漏混淆；重试不能按新的当前时间重新计算 fingerprint。

**暴露面**：`code_hash`、管理请求指纹、幂等元数据、JWT、密钥、码明文都不是普通 Data API 可读列。列级 GRANT 和客户端 `select=*` 不是天然兼容；普通用户的合法查询应走经真实 `GRANT/RLS/security_invoker` 验证的**安全投影**或明确允许列，不为了修 42501 授予隐藏列 SELECT。码 hash 只在 private 受保护函数访问；管理员查询码列表也必须是无 hash/无明文安全视图。安全投影与指纹精简物理版本在实现时定稿，必须以 F05-C01～12 验证真实 HTTP/SQL、列 GRANT、空值和重放。

## 3. 访问控制（RLS / GRANT）

| 对象 | 普通 authenticated 用户 | 平台管理员（RLS 读取） | 写入 |
| --- | --- | --- | --- |
| `plans` | 可 SELECT `active` 产品的启用套餐（供客户端展示功能差异） | 全部 SELECT | 仅管理函数 |
| `entitlement_grants` | 仅本人行 SELECT | 全部 SELECT | 仅可信函数 |
| `redemptions` | 仅本人行 SELECT | 全部 SELECT | 仅 `redeem_code` |
| `redemption_codes` | **禁止**（哈希也不暴露） | 仅允许**非哈希元数据列** SELECT（列级 GRANT/安全投影视图 + 管理员 RLS），如批次、状态、使用次数；`code_hash` 对所有 Data API 客户端不授 SELECT | 仅管理函数 |
| `redemption_rate_limits` | 禁止 | 默认禁止（运维按需在安全入口查看聚合状态） | 仅 `redeem_code` 更新 |

匿名用户对上述表无任何访问权限。普通用户/管理员共用数据库角色 `authenticated`，不能仅凭管理员 RLS 隐藏 `code_hash` 列；必须**不授予该列的 Data API SELECT**，使用列级 GRANT 或经验证安全的只读投影，写函数所有者在内部访问哈希。管理员读取策略复用 `private.is_platform_admin()`，见[数据库访问与可信事务](./database-access-and-transactions.md)。

## 4. 生命周期与删除

- 退出、封禁、产品暂停均不修改授权、兑换码或兑换记录。
- 授权与兑换记录属于必要的计费事实，账号注销时的保留/去标识化随注销政策确定，不使用 `ON DELETE CASCADE` 自动清除。
- 套餐停用不删除；产品永久下线时的权益处理留待专门策略。

## 5. 待实施前确定

最终字段类型与 JSON 结构约束、兑换码字符集（不低于 128 bit 已确定）与具体格式、批量上限、限流行清理执行方式、试用来源表达、外部渠道订单表是否同库、实际 RLS SQL 与 pgTAP 测试。

## 相关架构

- [统一计费与产品权益](../domains/billing-and-entitlements.md)
- [数据库逻辑约束与最小审计](./database-constraints-and-audit.md)
- [数据库访问与可信事务](./database-access-and-transactions.md)
- [API 契约与 MVP 验收](../backend/api-contract-and-mvp-acceptance.md)
