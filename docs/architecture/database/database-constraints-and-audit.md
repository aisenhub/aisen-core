# 公共身份、产品成员与管理审计数据库逻辑约束

> 状态：**当前有效架构决定**：采用“当前状态表 + 轻量审计事件表”（方案 A），非成员类管理操作统一写 `admin_audit_log`。本文件给出产品、成员、管理员、平台限制与审计的逻辑模型、数据不变量和一致性边界；套餐/授权/兑换码见[权益与兑换码数据约束](./entitlements-and-redemption-constraints.md)。基础六表、Pro/兑换码五表及受保护成员/管理/Pro/核销 SQL RPC 已在本地 PostgreSQL 17.11 从零重建；**239 项 pgTAP 与 LCK-01～07 双连接测试 PASS**，真实签名 JWT/HTTP/TOTP 仍待验证。迁移真实内容以 `supabase/migrations/` 为准。

## 1. 设计目标与已确认的取舍

- **`product_memberships` 是当前成员状态的唯一权威**：直接读取当前 `status`，不回放事件推导状态。
- **`membership_events` 只保存必要状态变化的审计事实**：不承载实时授权、不用作事件溯源或异步事件总线。
- **`products` 存储当前产品目录与运行状态**；认证用户由现有 Supabase Auth `auth.users` 承担。
- MVP 优先复用 PostgreSQL 主键、UNIQUE、外键、CHECK、事务、原子条件更新、受保护函数及 Supabase 的 RLS。**不引入**独立审计服务、Redis、通用工作流引擎、复杂触发器链或分布式事务框架。
- 平台成员状态与**会员权益、支付事实、产品级业务数据、账号禁用状态**分开存储及判断。产品暂停不修改所有成员状态，成员退出不自动取消订阅、删除数据或撤销历史权益。

## 2. 核心逻辑实体及最小字段建议

### 2.1 `auth.users`（Supabase Auth 原生）

使用 Supabase Auth `id` 作为公共 `user_id` 权威标识。邮箱是可变登录资料，不用作跨产品业务主键；密码、会话与认证材料不在成员表中重建。涉及注销与保留时，需要分别处理业务表引用和各 SaaS 数据，不能简单假定直接删除 Auth 账号就完成清理。

### 2.2 `products`（公共产品目录）

| 建议字段 | 含义 | 逻辑约束 |
| --- | --- | --- |
| `id` | 内部不可变产品 ID | PRIMARY KEY、非空 |
| `product_key` | 对外稳定产品标识 | UNIQUE、非空，不允许随意复用/修改 |
| `name` | 展示名称 | 非空 |
| `status` | 当前产品运行状态 | 非空；仅 `draft`、`active`、`suspended` |
| `created_at`, `updated_at` | 创建及变更时间 | 非空，由可信端维护 |
| `description` | 简要描述 | 可选 |

注册、发布、暂停、恢复由可信管理员操作。暂停产品不直接改变其成员、订单或授权记录；永久删除、标识是否能复用、删除有关系产品的顺序留待独立策略。套餐、价格、R2 Bucket 和业务库链接不混入该核心表。

### 2.3 `product_memberships`（当前状态权威）

| 建议字段 | 含义 | 逻辑约束 |
| --- | --- | --- |
| `id` | 成员记录 ID | PRIMARY KEY、不可变 |
| `user_id` | Supabase Auth 用户 | NOT NULL；引用 `auth.users.id` |
| `product_id` | 公共产品 | NOT NULL；引用 `products.id` |
| `status` | 当前成员状态 | NOT NULL；仅 `active`、`left`、`suspended` |
| `pre_suspend_status` | 本轮封禁之前的状态 | 当前为 `suspended` 时必须为 `active` 或 `left`；其他状态必须为 NULL |
| `joined_at` | 首次加入时间 | NOT NULL，退出再加入不重置 |
| `updated_at` | 当前记录变更时间 | NOT NULL，可信端维护 |

**核心不变量**：`UNIQUE(user_id, product_id)`，同一用户在同一产品只有一条当前成员记录。未加入表示“无记录”，不是数据库第四个 `status` 值。成员退出或恢复应更新原记录，而不是删除后重新插入；封禁、解除封禁不改变会员有效期或权益数据。

仅靠 CHECK 可以保证枚举和 `pre_suspend_status` 与当前状态搭配合法，**不能**替代对过去状态、操作者权限和产品当前状态的业务检查。

### 2.4 `membership_events`（轻量审计）

| 建议字段 | 含义 | 逻辑约束 |
| --- | --- | --- |
| `id` | 事件 ID | PRIMARY KEY |
| `membership_id` | 对应当前成员记录 | NOT NULL，引用成员表；避免随意级联删事件 |
| `action` | 发生的成员操作 | `join` / `leave` / `rejoin` / `suspend` / `restore` |
| `from_status` | 变更前状态 | 首次 `join` 可为 NULL，其余事件有原状态 |
| `to_status` | 变更后状态 | 三种成员状态之一 |
| `actor_type` | 主体类型 | 建议 `user` / `admin` / `system` |
| `actor_user_id` | 实际发起用户 ID | 用户和管理员事件要求可信记录；真正系统任务可为空 |
| `reason_code` | 必要原因/操作依据 | 对需要说明的管理操作要求，其他按需 |
| `created_at` | 事件发生时间 | 可信端生成，不允许客户端指定 |

审计只记录**成功且实际发生的关键状态变更**；普通登录、准入查询 `CheckAccess`、重复无变化的 `EnsureMembership`、普通 Pro 查询不写入成员事件。访问拒绝和失败请求如有安全记录需要，应归入适当的运维/安全日志，而不是伪造状态变更事件。

事件数据应限制读取和修改，正常成员操作只新增事件、不由普通用户任意改写或删除历史。保留时长、必要的个人资料最小化以及删除请求下的去标识化/法定保留原则仍需按法规和具体业务确定。

### 2.5 `platform_admins`（平台管理员资格）

| 建议字段 | 逻辑约束 |
| --- | --- |
| `user_id` | PRIMARY KEY，引用 `auth.users.id` |
| `active` | NOT NULL |
| `granted_by`, `created_at`, `updated_at` | 可信端维护 |

初始所有者通过受控且不携带固定真实用户 ID 的迁移/运维 SQL 将**已存在且确认拥有者身份的** Auth 用户加入名单；后续增减只经管理函数，并写 `admin_audit_log`。`RevokeAdmin` 与 `BlockAccount` 共用事务级串行化保护，变更后必须剩余至少一名 `active=true` 且**未被全局 blocked** 的管理员；不得仅数 `active` 行，防止并发分别撤销/封禁导致无人可管。管理人自身也不能绕过鉴权。业务规则见[平台管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)。

### 2.6 `platform_account_restrictions`（平台级账号限制）

| 建议字段 | 逻辑约束 |
| --- | --- |
| `user_id` | PRIMARY KEY，引用 `auth.users.id`；正常账号无记录 |
| `kind` | NOT NULL；MVP 仅 `blocked`；管理鉴权与业务准入读取此表的当前状态 |
| `reason_code`, `created_by`, `created_at` | 可信端维护 |

解除限制即删除该行（同事务写审计）。受保护业务的加入、重新加入、兑换和准入查询先检查此表，**平台管理员资格判定也排除当前被限制用户**。对合格管理员施加 `blocked` 之前，管理函数必须与管理员撤销函数使用相同的事务级互斥/锁序，原子复核剩余合格管理员数；不能封禁最后一名合格管理员，拒绝时不改变限制或审计事实。

### 2.7 `admin_audit_log`（非成员类管理审计）

| 建议字段 | 逻辑约束 |
| --- | --- |
| `id` | PRIMARY KEY |
| `actor_user_id` | NOT NULL |
| `action` | NOT NULL；如 `product.status`、`plan.upsert`、`code.create`、`code.revoke`、`grant.create`、`grant.revoke`、`admin.grant`、`admin.revoke`、`account.block`、`account.unblock` |
| `target_type`, `target_id` | NOT NULL |
| `before`, `after` | 可空的精简 JSON，只含必要字段；不得包含兑换码明文、令牌、密码 |
| `reason` | 可空；高风险操作要求填写 |
| `created_at` | 可信端生成 |

由各管理函数在同一事务内插入；只新增、不修改。**成员事件仍只写 `membership_events`**，两张表不合并。管理员撤销、产品修改等必须保留可信 actor 和精简前后差异；高风险操作必须填写 reason，审计不记录秘密或不必要的邮箱信息。

## 3. 数据库与可信服务端的职责分工

| 强约束或规则 | 负责层 | 理由 |
| --- | --- | --- |
| 主键、稳定产品标识、唯一成员配对 | PostgreSQL PRIMARY KEY / UNIQUE | 防重复与引用歧义 |
| 合法状态值、封禁前状态搭配、非空字段 | PostgreSQL CHECK / NOT NULL | 禁止非法静态数据 |
| 用户/产品/成员引用存在 | PostgreSQL FOREIGN KEY | 保证关系完整性 |
| 是否有权创建产品、暂停/恢复成员 | 受保护管理函数内的 `private.is_platform_admin()` 检查 | 依赖调用人和操作意图 |
| `left → active` 仅明确重新加入 | 可信成员状态转换 | 不能由 CHECK 判断请求来源 |
| `suspended` 解封恢复原状态 | 可信事务读取当前记录 | `pre_suspend_status` 不能被客户端控制 |
| 产品 active 才允许普通首次加入 | 可信流程中读取产品当前状态 | CHECK 不可用作跨表动态权限判定 |
| 当前成员变更与关键审计同步 | 同一 PostgreSQL 事务 | 一起提交或一起回滚 |
| Pro、额度与业务资源访问 | 各领域可信授权 / 计量 | 不混入成员表 |

已确定：**每个状态转换由一个受保护 PostgreSQL 函数在单事务内完成**（执行机制、`SECURITY DEFINER` 使用边界与调用方式见[数据库访问与可信事务](./database-access-and-transactions.md#2-执行机制决定)）。多个独立的数据库 API 请求不共享事务。

## 4. 事务及状态转换不变量

所有变更应在可信端重新验证当前状态，不信任前端提交的 `from_status` / `pre_suspend_status`。

1. **`EnsureMembership`**：验证用户、产品开放条件；无成员时原子建立 `active`，并同事务写一次 `join` 事件。有 `active` 时直接返回不新增事件；有 `left` / `suspended` 时不得自动恢复。
2. **`LeaveProduct`**：当前 `active` 才转 `left` 并记录 `leave`；重复退出无变化不额外写事件。退出不删成员、授权或产品文件。
3. **`RejoinProduct`**：用户明确操作、产品/账号允许时，`left → active` 并记录 `rejoin`；不通过普通登录触发。
4. **`SuspendMembership`**：管理员有权操作时，`active` / `left → suspended`；原子保存原状态到 `pre_suspend_status`，记录 `suspend`。重复封禁不得覆盖最初的原状态或重复记录状态变化。
5. **`RestoreMembership`**：管理员有权操作时，从可信记录读取 `pre_suspend_status`，恢复为该状态并清空 `pre_suspend_status`，记录 `restore`。原来 `left` 必须回 `left`；用户仍要明确重新加入。恢复不自动重启产品，也不复活过期会员。
6. **产品暂停/恢复**：只变更产品状态并同事务写 `admin_audit_log`，不批量更新成员。新操作要重新校验产品状态。
7. **平台账号限制**：`EnsureMembership`、`RejoinProduct`、兑换及准入查询都先检查 `platform_account_restrictions`；限制存在时拒绝，不改写成员。
8. **管理入口保底**：`BlockAccount` 与 `RevokeAdmin` 必须在同一事务内通过统一的串行化规则检查“变更后至少一名 active 且未 blocked 管理员”，否则返回 `STATE_CONFLICT`；不得用两个互不加锁的 SELECT 计数实现。合法封禁与撤权成功时均写入 `admin_audit_log`。

并发重点：双设备首次加入、封禁与重新加入竞争、产品暂停与新加入竞争、请求超时重试。应使用数据库唯一性、锁或条件更新，以及明确的事务顺序保证旧请求不能覆盖新封禁；禁止靠“先 SELECT 再无条件 UPDATE”或客户端缓存决定转换。产品状态与成员首次加入的竞争需要在同一可信事务边界内定义先后次序，不能宣称普通跨请求查询提供强原子保证。

**一致性规则**：成功改变当前成员状态与对应事件写入必须一起提交；任一失败则本次变更回滚。审计中如涉及敏感管理原因，应避免保存过量个人信息和秘密。事件不是重放生成当前状态的材料。

## 5. RLS 与角色最小访问面

- 当表位于 Supabase Data API 可暴露的 Schema 中，应有明确表级授权与合适的 RLS；仅 `TO authenticated` 不能代替“只能看到自己”这一行级条件。
- 普通用户最多读取自己的必要成员状态和公开的产品资料；**不直接 INSERT/UPDATE/DELETE 成员状态，也不直接编辑审计**。
- 所有状态转换由受保护函数执行用户身份、产品状态、成员状态及管理员身份检查后完成。
- Admin 通过 React-admin 复用现成的列表/表单组件，管理员读取依靠 `private.is_platform_admin()` 策略，写入函数再次校验平台管理权；不要从 `user_metadata` 或仅凭界面隐藏判断管理员。
- 普通客户端和独立 SaaS 后端不能获得整个平台范围的 service_role/secret key；需要真正的服务端机器身份时再限定范围设计。
- 正常使用读取当前成员状态只查询 `product_memberships`，不因审计表复杂化读取路径。

## 6. 外键删除与数据生命周期

- **退出 = 更新成员状态，不是 DELETE**。保留当前关系和必要审计，原会员及订单独立保留。
- 删除用户账号、产品永久下线及合法数据删除是独立流程；不能在未制定政策前让 `ON DELETE CASCADE` 自动清空审计、订单或其他 SaaS 业务数据。
- 使用 Supabase Auth 主键关联时，应明确未来注销协调：先确定各产品数据、权益与必要审计的保留/去标识化策略，再选择删除、限制或迁移引用关系的实现。
- `membership_events` 保留时间、匿名化和查询权限应按管理与法律需要定；禁止把“审计”解释为所有个人数据都必须永久保留。
- 对产品权限的最终判断仍结合产品状态、成员当前状态和具体权益；成员表不承载产品业务资源权限。

关于普通用户与平台管理员的 RLS/GRANT 访问矩阵、受保护函数写入与**单 PostgreSQL 事务**执行边界，见[数据库访问隔离与可信事务](./database-access-and-transactions.md)；管理员与平台限制的业务规则见[管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)。

## 7. MVP 不建设与待确定

**不建设**：事件回放作为成员权威、跨库事件总线、通用审计平台、复杂状态机框架、无限字段的审计大表、跨系统分布式事务、自研 Auth/ORM 基础框架。

**待实施/验证**：真实 GoTrue/JWT/HTTP/TOTP、旧管理员会话/因素撤销差异、审计留存策略、删除协调、跨端性能。可信 SQL RPC、M1 保底和双连接 LCK 已通过本地验证，不能冒充线上安全验收。

## 相关架构

- [身份、产品及成员领域模型](../domains/identity-and-product-model.md)
- [成员生命周期与数据保留](../domains/membership-lifecycle.md)
- [公共 API MVP 与 SaaS 接入](../backend/public-api-and-saas-integration.md)
- [权益与兑换码数据约束](./entitlements-and-redemption-constraints.md)
- [产品数据与文件专项](./product-data-and-files.md)
