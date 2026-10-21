# 套餐、产品授权与兑换码数据约束

> 状态：**MVP 逻辑数据模型与事务不变量**。字段名为建议，不是已执行的 DDL、迁移或 RLS 策略；未经另行授权不建库、不执行 SQL。业务规则以[统一计费与产品权益](../domains/billing-and-entitlements.md)为准，本文只定义存储、约束与一致性边界。

## 1. 逻辑表与最小字段

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

每个产品允许一个保留的 `plan_key='free'` 基础方案（不需要对应 grant）；无 Free 配置时无附加能力。**一旦被任意 `entitlement_grants` 或 `redemption_codes` 引用（包括已撤销码）**，套餐的 `product_id`、`plan_key`、`features`、`limits` **冻结不可变**；修改功能与额度应创建新套餐版本，旧码和旧授权继续引用原版本。可信 `admin_upsert_plan` 与发码/授予函数须使用兼容的套餐行锁序，在同一事务内检查引用，避免“检查时无引用、随后并发发码”的竞态。停用旧套餐只阻止**新发行/新直接授予**，已发行有效码仍可兑换；停止旧码兑现须显式撤销码/批次。套餐不保存价格与支付渠道配置；价格随渠道接入再建模。

### 1.2 `entitlement_grants`（产品授权，当前权益的唯一事实来源）

| 建议字段 | 逻辑约束 |
| --- | --- |
| `id` | PRIMARY KEY |
| `user_id` | NOT NULL，引用 `auth.users.id` |
| `product_id` | NOT NULL，引用 `products.id` |
| `plan_id` | NOT NULL，引用 `plans.id`；须与 `product_id` 属于同一产品（在 `plans` 增加 `UNIQUE(id, product_id)`，以 `(plan_id, product_id)` 复合外键引用它） |
| `source_type` | NOT NULL；MVP 仅 `redeem_code`、`admin`，以后按渠道增加 |
| `source_ref` | NOT NULL；兑换为确定性 `code_id:user_id`，人工授予为调用方 `request_id`，未来外部渠道为带商户/渠道命名空间的权威订单 ID |
| `starts_at` | NOT NULL |
| `ends_at` | 可空；**NULL = 永久非周期授权**；非空时须大于 `starts_at` |
| `revoked_at`, `revoked_by`, `revoke_reason` | 撤销信息；撤销不删除记录 |
| `created_at` | 可信端生成 |

**核心不变量**：`UNIQUE(source_type, source_ref)` 保证同一来源只授权一次；兑换的确定性来源引用在创建 redemptions 前即可计算，**先创建 grant，再以 grant_id 创建 redemption**，避免不可满足的循环非空外键。人工授予用独立幂等 `request_id`（不是临时审计行 ID），与审计一起原子写入；未来订单引用包含商户作用域，避免不同渠道账户订单号碰撞。授权记录只新增与撤销，不物理删除、不回写历史时间。

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

1. **`redeem_code(code)`（用户本人）**：以 `auth.uid()` 验证身份并**先排除全局 blocked**，按 §1.5 锁定/检查失败限流 → 规范化计算哈希 → 通过哈希定位并 `FOR UPDATE` 锁定码行（无匹配则记录失败后拒绝）→ **先查当前 `(code_id, auth.uid())` 是否已有兑换记录；若有，返回 `REDEEM_ALREADY_USED`，即使码后来用尽、过期或撤销，也不新增授权或失败计数** → 对尚未兑换者取得同用户同套餐续期事务锁，**重新校验**码行最新条件 → 核验码未撤销、未过期、未用尽、产品为 active、成员 active 或无记录；`plans.is_active` **不阻止已发行有效码兑现** → 无记录时原子创建 active 和 join 事件 → 确定来源键 `code_id:user_id` → 计算续期并**先 INSERT grant** → 再 INSERT redemption 引用 grant → 更新 `redeemed_count+1`。预期业务拒绝以结构化失败码正常返回以保留限流计数，绝不提交上述业务副作用；任何 SQL 技术异常则整个事务回滚。
2. **`admin_create_codes(product, plan, config, quantity, request_id)`**：校验管理员、MFA、产品/套餐状态与批量上限 → 按安全随机数生成不低于 128 bit 的码并只存哈希 → 创建批次/序号幂等记录 → 写一条 `admin_audit_log` → **首次成功响应**返回明文；同 `request_id` 重复调用仅返回“批次已存在、明文不可恢复”，不再次发码。
3. **`admin_revoke_code(code_id, reason)`**：只设置 `revoked_at`，不影响已有授权；写审计。
4. **`admin_grant_entitlement(user, product, plan, starts_at, ends_at, reason, request_id)`**：校验管理员与 MFA → 以 `request_id` 作为幂等来源键，按需续期串行化 → 插入授权、写 `admin_audit_log`；同事务成功或回滚；不改变成员状态。
5. **`admin_revoke_grant(grant_id, reason)`**：设置撤销字段并写审计；重复撤销不重复写入。
6. **`admin_upsert_plan(...)`**：创建套餐或修改**尚无任何 grant、也无任何已发行 code 引用**的套餐能力；存在上述任一引用时只能修改非权益展示字段（如名称）、停用，权益变化须创建新套餐版本（如 `pro_v2`）。与发码/授权函数共用套餐行锁序，防止并发破坏冻结条件；写审计。

**并发要点**：多人同码依靠行锁 + CHECK 防超量；同一人同码依靠 `UNIQUE(code_id,user_id)` 与来源幂等键；所有影响同一用户+套餐续期的可信操作先采用一致的事务级锁顺序（如以用户/套餐派生的 advisory transaction lock），再检查未来未撤销的最长到期时间，避免并发读旧值造成重叠。尽量把授权时段计算与写入放在同一 RPC 中。

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
