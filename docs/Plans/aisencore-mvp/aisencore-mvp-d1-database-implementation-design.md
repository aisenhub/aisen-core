# D1｜AisenCore MVP PostgreSQL 物理模型、RLS 与事务实施设计

> **D1 数据库实施规格同步（DEC-01/05/06 仍遵循已批准方案；DEC-04 按 2026-10-23 复议简化，已批准但未建库）**：公开用户兑换接口改为 `redeem_code(product_key, code)`，先按用户声明产品/成员检查后按真实码校验，并据已发行码绑定套餐不可变的约束在 L5 后取得 L6，禁止倒序补取 L4；产品直接配置唯一线上免费能力 `free_features/free_limits`（不设 Free 版本和指针）；管理员直授采用 duration/explicit_window 两模式，首次语义与计算结果受保护持久化、同键不同参数拒绝；Admin 邮箱批量查询先验证极限权 SQL RPC（安全不可行则已批准 Edge 批量回退）。下文旧单参、`admin_request_fingerprint` 必选列、原地可改 Free 等物理草图均只是**被后续决议覆盖的历史候选**，实施前依[数据库长期约束](../../architecture/database/entitlements-and-redemption-constraints.md)和[受保护锁方案](../../architecture/database/rpc-security-and-locking-contract.md)重拟迁移，SQL/pgTAP NOT RUN。

> **状态：D1 实施设计候选，待后续迁移代码/真实环境与 pgTAP 验证。本文不是已执行的 SQL、已部署权限或新增业务规则。**
>
> **F01/F02 安全收敛补订（2026-10-22）**：关于公开 RPC 与扩权权限、统一锁序及核销分支，以下候选以 [F01～F04 安全设计收敛 §2～3](./aisencore-f01-f04-security-convergence-design.md) 的明确方案为准：**public 只允许 SECURITY INVOKER 薄外壳，private 最小 SECURITY DEFINER 内核；所有管理写函数先 L0，敏感本人操作使用 L1，产品/计划/成员/码/续期严格按 L0～L8 顺序**。不改变 M1～M5 业务含义，真实 SQL/RLS/pgTAP 未测试。
>
> **DEC-05 已批准物理合同覆盖**：发码批次以 `(created_by,request_id)` 唯一 + 强类型首次有效配置 NULL-safe 比较；直授按 actor-scoped source_ref 保存首次 mode/参数/可信计算时段；指纹只在旧行语义无法从强类型列复原时保留。2026-10-23 DEC-04 已收敛为产品免费能力配置，双参数兑换合同不变；所有以下物理字段/DDL 仍需隔离迁移验证，权威为[DB 长期模型](../../architecture/database/entitlements-and-redemption-constraints.md)。
>
> **BaaS/RPC 安全适用性补订（2026-10-22）**：按 [BAAS-Q01～Q10 安全测试指南](../../development/testing/README.md) 在**未来真的存在消费型产品操作时**检查可信成本正数/上下限、真实 actor/对象归属、F02 锁序、条件写/请求指纹幂等与审计。拒绝将外部 `public SECURITY DEFINER consume_user_quota(cost_amount)` 示例作为迁移；客户端传负数可能**增加**余额、且默认函数 EXECUTE/owner/RLS 会扩大攻击面。**不新增本 D1 表或 RPC**；现有 R2 配额是产品元数据 `ready+reserved` 事务，不是 AisenCore 通用余额。
>
> 设计输入：[现行需求与 MVP 范围](../../spec/requirements.md)；业务真相以 [产品/成员/管理逻辑模型](../../architecture/database/database-constraints-and-audit.md)、[权益/兑换约束](../../architecture/database/entitlements-and-redemption-constraints.md)、[访问与事务边界](../../architecture/database/database-access-and-transactions.md) 和 [业务领域架构](../../architecture/domains/README.md) 为准。
>
> **本轮范围**：公开 PostgreSQL 关系结构、约束、索引、读权限、受保护 RPC 的事务/锁设计，标注 D2 API 和 Aisenlens R2 的接口。**不执行 SQL、不创建 migration、云资源、业务代码或部署。**

## 0. 决策分层与审查约束

- **逻辑不变量（已确定）**：`auth.users.id` 是统一身份；`products`、唯一的当前成员与变更事件；独立管理员、平台限制和管理审计；同库套餐、授权、码及兑换；兑换哈希和限流；当前有效权益由授权+冻结套餐计算；RLS 限读、状态+审计经同一 PostgreSQL RPC 事务写入。
- **本 D1 提出供实现采用的具体化**：列类型、PK/FK、CHECK/索引、`redemption_code_batches` 最小幂等辅助表、私有函数及带实际顺序的锁策略。属于**实施设计候选**；发现其影响已定业务语义或 Supabase 权限约束时先回到对应权威确认，不自行发明产品功能。
- **D2 留待锁定**：可调用 RPC 的确切 SQL 签名、SQLSTATE/HTTP 映射、`CheckAccess` 输出、`CreateCodes` 明文首次响应的网络重试协议、Auth JWT/邮件流程和 R2 凭证签发入口。
- **Aisenlens 已确认**：U01 首发是本地优先 Aisenlens，U02 首批必须有 R2 文件/配置备份；**不等于**允许上传视频、AI 结果、项目数据库、API Key 或任何默认公开分享，亦不等于已选备份字段、容量或文件保留时间。
- **上线前仍须确认具体参数与落实运维**：U03 公开注册目标、U05 单人运营与 Admin TOTP MFA 已确认；U04/U06～U08 的真实套餐额度、管理员恢复、域名/发信、注销政策、发码规模仍有未定细项，见 [U03～U11 当前决议](./aisencore-u03-u11-user-decisions-2026-10-22.md)。D1 不预设具体数值。

## 1. Schema、执行角色及 ID/时间通则

| 对象 | 候选位置 | 授权与理由 |
| --- | --- | --- |
| 11 张既定公共业务表 + `redemption_code_batches` | `public`（显式 Data API 暴露 Schema） | 支持受 RLS 约束的本人/管理员 Data API 读取；敏感列再用列级 GRANT 防泄露 |
| 本人/管理用的 PostgREST RPC 包装函数 | `public` **SECURITY INVOKER** | 对 `authenticated` 按精确签名选择性授予 EXECUTE；只分发请求到 private 内核，不扩权 |
| `is_platform_admin`、业务 RPC 内核/数据验证/事务辅助函数 | `private`（**不可**加到 API exposed schemas） | 需要跨越 DML/RLS 边界时采用最小角色 `SECURITY DEFINER`；固定 `search_path` 和受限执行权限；内核自己校验 JWT/actor/对象权限，不能靠 wrapper 防绕过 |
| Auth 身份与 MFA | Supabase `auth.users` 与已验证 JWT | 不建立第二份用户凭据/邮箱主档，不向 Data API 暴露 `auth.users` |
| 私有文件对象与 Aisenlens 备份元数据 | **R2 + Aisenlens 所有的业务元数据存储**（具体物理位置 D2/D3 定） | 不在公共成员/套餐表加 `r2_object_key` 或建立无产品理由的公共文件中心 |

**数据类型统一**：主键与用户/产品/关联 IDs 用 `uuid`；操作 idempotency `request_id uuid`；可枚举状态以 `text CHECK (...)`（避免部署初期修改数据库 ENUM 类型）；UTC 语义的 `timestamptz`，`created_at DEFAULT transaction_timestamp()`；变更时间由可信 RPC 显式设置，不能让客户端提供。数组 `timestamptz[]`；结构化规则 `jsonb`；码哈希/指纹 `bytea` + 长度检查。行主键建议 `DEFAULT gen_random_uuid()`，但实际 Supabase/PostgreSQL 版本与可用扩展须迁移前核验。外键到 `auth.users(id)` **RESTRICT/NO ACTION**，并不认为简单删除 Auth 用户就完成注销。

**数据可变性**：UUID、归属 `user_id/product_id`、首次加入时间、审计 actor/created_at、grant 来源与时段、码哈希与发码配置不可在普通 RPC 随意修改；套餐被引用后权益关键列永久冻结。敏感字符串（密码、JWT、码明文、R2 访问凭证）不入任何业务/审计表。

**部署角色候选**：迁移拥有者与日常 `SECURITY DEFINER` 执行者应有不同最小权限；优先创建受控 `NOLOGIN` 函数 owner，仅向它授予必要 DML 和读权限、相应只读 RLS policy（或经评审的等效可信访问），而不让浏览器/普通用户成为表 owner。Supabase 托管项目能否创建此角色及其与 Auth/pgcrypto schema 的兼容性必须在隔离环境验证；**不能直接将超级用户或全局 BYPASSRLS 角色用于普通客户端 RPC**。

## 2. 物理表规格（SQL 迁移设计输入）

本文以“列名: 类型（附必要默认值/约束）”表示**可转为 DDL 的规格**；尚未生成/运行真实 `CREATE TABLE`。不在本阶段给出用户未批准的业务配额数值。PK 默认 NOT NULL；`uuid` 非身份主键推荐 UUID 生成默认值。除注明外所有引用 `ON DELETE RESTRICT` 或默认 NO ACTION，禁止自动删除历史事实。

### 2.1 身份、产品、成员与审计

**`public.products`**
- `id uuid PK DEFAULT gen_random_uuid()`；`product_key text NOT NULL UNIQUE`；`name text NOT NULL`；`description text NULL`；`status text NOT NULL DEFAULT 'draft'`；`created_at timestamptz NOT NULL DEFAULT transaction_timestamp()`；`updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()`。
- `CHECK (status IN ('draft','active','suspended'))`；对 `product_key` 可选 ASCII slug 与长度约束（技术候选，例如小写字母/数字/下划线，总长最多 64），真正 Aisenlens 的 `product_key` 值待 D2 注册时确认；`name` trim 非空且有适度长度上限。
- `product_key` 创建后不允许修改/复用；可信管理函数对状态更新写审计。产品暂停不批量更新成员或授权。
- 产品不保存 `free_features/free_limits` 或业务 Features/Limits；只保存 key、运行状态、名称等公共身份/成员准入所需信息。产品功能与额度由 SaaS 自己部署/维护，匿名本地 Free 不由公共数据决定。

**`public.product_memberships`**
- `id uuid PK`；`user_id uuid NOT NULL REFERENCES auth.users(id)`；`product_id uuid NOT NULL REFERENCES public.products(id)`；`status text NOT NULL DEFAULT 'active'`；`pre_suspend_status text NULL`；`joined_at timestamptz NOT NULL DEFAULT transaction_timestamp()`；`updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()`。
- `UNIQUE (user_id, product_id)`；`CHECK (status IN ('active','left','suspended'))`；`CHECK ((status='suspended' AND pre_suspend_status IS NOT NULL AND pre_suspend_status IN ('active','left')) OR (status<>'suspended' AND pre_suspend_status IS NULL))`。**显式要求非空**，否则 PostgreSQL CHECK 的 UNKNOWN 可让 `suspended + NULL` 错误通过。
- 二级索引 `(product_id,status,user_id)` 服务管理员按产品分页；唯一键已服务本人/产品读取，不再为单列重复堆积索引。
- 不存在行就是“未加入”；从 `left` 重加和解封必须 UPDATE 原行，`joined_at` 不刷新。

**`public.membership_events`**
- `id uuid PK`；`membership_id uuid NOT NULL REFERENCES public.product_memberships(id)`；`action text NOT NULL`；`from_status text NULL`；`to_status text NOT NULL`；`actor_type text NOT NULL`；`actor_user_id uuid NULL REFERENCES auth.users(id)`；`reason_code text NULL`；`created_at timestamptz NOT NULL DEFAULT transaction_timestamp()`。
- `CHECK (action IN ('join','leave','rejoin','suspend','restore'))`，`CHECK (actor_type IN ('user','admin','system'))`；用户/管理员 actor 必须非空，`system` 的缺省理由另由调用路径审查。事件方向约束为：`join NULL→active`、`leave active→left`、`rejoin left→active`、`suspend active/left→suspended`、`restore suspended→active/left`；按明确 IS NULL 与状态枚举组合写 CHECK，避免 SQL 三值逻辑让 UNKNOWN 通过。
- 索引 `(membership_id,created_at DESC)`。事件只增，跨用户不可读，审计插入失败则状态回滚。恢复事件记录真实变更与 actor，不储存敏感原因全文。

**`public.platform_admins`**
- `user_id uuid PK REFERENCES auth.users(id)`；`active boolean NOT NULL DEFAULT true`；`granted_by uuid NULL REFERENCES auth.users(id)`（仅一次安全引导可为空）；`created_at timestamptz NOT NULL`；`updated_at timestamptz NOT NULL`。
- 管理员资格 = `active=true` **且不存在全局 blocked 行**，再加当前请求 `aal2` 才能读取/执行管理；仅 `active` 行数量不代表可用管理员。首位管理员不绑定固定 UUID，必须在受控部署流程中人工确认证明身份。

**`public.platform_account_restrictions`**
- `user_id uuid PK REFERENCES auth.users(id)`；`kind text NOT NULL DEFAULT 'blocked'`；`reason_code text NOT NULL`；`created_by uuid NOT NULL REFERENCES auth.users(id)`；`created_at timestamptz NOT NULL`。
- `CHECK (kind='blocked')`；解除限制执行 DELETE 限制行但**同事务留下 admin_audit_log 解除记录**，用户成员/权益原状不改。单列 PK 足够按用户找限制。

**`public.admin_audit_log`**
- `id uuid PK`；`actor_user_id uuid NOT NULL REFERENCES auth.users(id)`；`action text NOT NULL`；`target_type text NOT NULL`；`target_id uuid NOT NULL`；`before jsonb NULL`；`after jsonb NULL`；`reason text NULL`；`created_at timestamptz NOT NULL DEFAULT transaction_timestamp()`。
- `before/after` 仅允许 JSON object 或 NULL；可信管理函数将字段白名单映射到精简 JSON：不保存 code_hash、码明文、密码、邮件验证码、Token、R2 签名 URL、高权限密钥或冗余个人资料；高风险管理员动作必须有非空 reason（由 RPC 按 action 验证）。
- 索引 `(target_type,target_id,created_at DESC)` 与 `(actor_user_id,created_at DESC)`；无多态 FK：`target_type,target_id` 的正确性由可信写函数保证。只增不改、不自动级联删除。

### 2.2 统一 Pro 授权、发码批次、兑换与限流（不设功能套餐表）

**删除目标表**：MVP 无 `public.plans`、无 `products.free_features/free_limits`、无 `plan_id`、无业务功能/额度 JSON 字段。AisenCore 不管理 SaaS 的导出、AI、备份等功能策略。30/365/永久只是授予时间，不冻结产品功能。需要固定的是码和 Grant 的原始时长/来源/撤销事实。

**`public.entitlement_grants`**
- `id uuid PK`、`user_id uuid FK auth.users`、`product_id uuid FK products`、`tier text NOT NULL CHECK(tier='pro')`、`source_type/source_ref NOT NULL`、`starts_at timestamptz NOT NULL`、`ends_at timestamptz NULL`、撤销字段与可信时间；非空 end 严格大于 start。
- `UNIQUE(source_type,source_ref)`；管理端必须持久保留首次同 actor/request_id、mode、参数与可信计算结果，NULL 安全重试，异参冲突不写。没有 `users.is_pro`；当前 Pro 必须按可信当前时间与未撤销 Grant 动态求存在，最后一条失效时仅展示 Free，不插入/删除降级记录。
- 索引 `(user_id,product_id,starts_at DESC)` 和 `(user_id,product_id,ends_at DESC) WHERE revoked_at IS NULL`。L7 并发续期锁使用用户+产品的 Pro 范围；已到期/撤销不参与延长，未来孤立窗口不自动给当前 Pro。

**`public.redemption_code_batches`**
- `id uuid PK`、`created_by`、`request_id`、`product_id FK products`、`tier='pro'`、`quantity`、`grant_duration_days`（首发发行正天数）、`max_redemptions`、`expires_at`、`created_at`，保存完整首次规范强类型配置。`UNIQUE(created_by,request_id)` 和 `UNIQUE(id,created_by)`，无 plan FK。
- 缺省/NULL 规范化、UTC 精度、actor-scoped 幂等及不同参数冲突沿用 F05；一次性明文从来不持久化。无需为“Pro 30天/365天”建数据库功能版本。

**`public.redemption_codes`**
- `id uuid PK`、仅可信的 `code_hash bytea`、`product_id FK products`、`tier='pro'`、`grant_duration_days`、`max_redemptions/redeemed_count`、`expires_at`、`batch_id/batch_ordinal`、撤销和创建字段。正时长与多次使用 CHECK、批次与 actor 外键、码哈希不公开等不变量完全保留。
- 发码时的产品/tier/授予期限固定在码及批次，后来移除一个 UI 时长预设不得使旧有效码无法兑；显式撤销才可停止其后续兑换。跨产品一致错误、防枚举、本人已兑优先和原码 UNKNOWN 安全核查不变。

**`public.redemptions`**
- `id uuid PK`；`code_id uuid NOT NULL REFERENCES redemption_codes(id)`；`user_id uuid NOT NULL REFERENCES auth.users(id)`；`grant_id uuid NOT NULL REFERENCES entitlement_grants(id)`；`created_at timestamptz NOT NULL`。
- `UNIQUE(code_id,user_id)`、`UNIQUE(grant_id)`；索引 `(user_id,created_at DESC)`；同一次兑换使用同一事务**先 INSERT entitlement_grants，再 INSERT redemptions**，避免非空 FK 循环；真实用户/产品/授权一致性由可信 RPC 在锁内复核，不能只靠 redemptions 的单列 FK。
- 同码同用户最多一次，码耗尽、过期或撤销**后**本人仍得 `REDEEM_ALREADY_USED`（在身份、全局限制和限流检查通过后）。

**`public.redemption_rate_limits`**
- `user_id uuid PK REFERENCES auth.users(id)`；`failed_at timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[]`；`updated_at timestamptz NOT NULL`。
- 可信 RPC 按用户原子插入/锁行，移除滚动 **15 分钟**外时间戳；`CHECK(cardinality(failed_at)<=10)`，每个元素须为有效时间（由 RPC 维护，必要时 CHECK 辅助函数）。最多 10 次失败，超过返回 `RATE_LIMITED` 和重试秒数，未达到限额的无效码失败记录计数并**正常返回业务拒绝**，不抛出会回滚计数的异常。
- 不存提交过的码或码哈希，不对 Data API 任何终端读取，定期修剪过期时间戳；清理可延后但下一次判定必须正确修剪。

### 2.3 约束覆盖边界与 DDL 实现注意事项

| 约束 | DB 原生能保证 | 仍必须由可信 RPC/事务保证 |
| --- | --- | --- |
| 成员唯一、状态组合、事件方向 | PK/UNIQUE/CHECK/FK | 谁能改变状态、封禁前身份来源、加入允许的产品状态、同事务审计 |
| 管理员资格、阻断保底 | 列存在与类型、限制 kind | **M1** 跨表有效管理员数量、统一互斥与当前 MFA |
| Pro 资格/授权时间一致性 | Grant/Code 的 product+tier=pro、时间 CHECK、幂等 UNIQUE | **M2 保护真实事实**：发行时固定授予天数，历史码/Grant 不因时长预设或 SaaS 功能迭代改变；多授权当前/未来/永久及并发按产品续期 |
| 授权来源唯一、归属、期限 | `UNIQUE(source_type,source_ref)`、复合 FK、时间 CHECK | 同用户同套餐续期顺序、真正同源幂等、审批鉴权 |
| 码唯一、次数不超上限 | `UNIQUE(code_hash)`、次数 CHECK | **M3** 首次明文丢失处理、发码 RNG/规范化、批次冲突、**M4** 本人已兑换优先级与事务级锁 |
| 兑换唯一、授权 FK | 两个 UNIQUE / FK | 当前产品/成员状态、码过期/撤销、授权与码计数同事务 |
| 滚动限流 | 每用户主键、数组容量 | 15 分钟窗口、锁与业务拒绝正常提交；技术异常全事务回滚 |
| 权益查询 | 时间与套餐 FK | 当前平台/产品/成员检查、Free 基础规则、未撤销授权求并/最大值、可信故障错误 |

**不可变字段的强制级别**：运行权限必须只授可信函数写入；在这些函数内根据引用查询与锁实现逻辑不变量。若需防迁移或运维脚本误用，实施期可对不可变权益列增加单一、可审计的窄作用域 `BEFORE UPDATE` 防线（不得形成复杂触发器链），但**不能**用触发器代替有完整业务校验的受保护函数。DDL 中 CHECK 对 `NULL` 的处理必须用明确 `IS NULL` 分支，避免 UNKNOWN 当成通过。

## 3. Data API / RLS / GRANT / EXECUTE 具体矩阵

**底线**：客户端与普通 SaaS 不得取得服务端 `service_role` 或直接写表权限；平台管理员是 `authenticated` 的**实时业务资格判断**，不是另一 PostgreSQL 登录角色。RLS 管“哪些行”、列级 GRANT 管“哪些列”、受保护 RPC 管“能做何种状态变更”；三层缺一不可。

| `public` 表 | anon SELECT | authenticated 普通本人 SELECT | 当前合格管理员 + `aal2` SELECT | 终端 INSERT/UPDATE/DELETE |
| --- | --- | --- | --- | --- |
| `products` | `active` 行的公开列 | 同 anon | 所有产品行及必要管理列 | 全部拒绝 |
| `product_memberships` | 无 | `user_id=auth.uid()` | 全部必要列 | 全部拒绝 |
| `membership_events` | 无 | 无 | 必要审计列 | 全部拒绝 |
| `platform_admins` | 无 | 无 | 管理资格必要列 | 全部拒绝 |
| `platform_account_restrictions` | 无 | 无 | 限制必要列 | 全部拒绝 |
| `admin_audit_log` | 无 | 无 | 脱敏精简审计列 | 全部拒绝 |
| 会员资格查询（无 plans 表） | 无 | 按产品可见状态与本人/管理员权限读取必要资格 | 管理员可读取 Pro Grant 的必要安全列，不得对业务套餐功能/额度做通用授权查询 | 全部拒绝直接写入 |
| `entitlement_grants` | 无 | 仅本人（包括历史已撤销，供查询） | 必要授权列 | 全部拒绝 |
| `redemption_code_batches` | 无 | 无 | **只读非秘密批次元数据**，不可恢复明文 | 全部拒绝 |
| `redemption_codes` | 无 | 无 | **只读非哈希列**（批次/状态/次数/日期），不得查 `code_hash` | 全部拒绝 |
| `redemptions` | 无 | 仅本人兑换历史 | 必要兑换列 | 全部拒绝 |
| `redemption_rate_limits` | 无 | 无 | 默认无；仅安全运维入口必要时查聚合 | 全部拒绝 |
| `auth.users`（Supabase 原生） | 不经 Data API | 不经 Data API | 仅安全 Edge Function 通过受限 Auth Admin 接口只读检索 | 由 Supabase Auth/受控运维维护 |

**策略定义口径**（待真正写 migration 时变成完整 SQL）：
- 每一张可直接读取的表 `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY`，不要使用“只给 authenticated GRANT 就足够”的错觉。每张表显式 `REVOKE ALL ... FROM PUBLIC,anon,authenticated` 后按白名单授予 `SELECT`；普通客户端一律不授 `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER`。表若出现 Supabase 默认宽授权，迁移中必须先撤销，再打开必要权限。
- `products`：anon/authenticated 公开行 predicate `status='active'`；authenticated 管理分支 `(select private.is_platform_admin())`。Anon 可见字段仅 `id,product_key,name,description,status`；authenticated 为管理员所需查询可选更多安全列，RLS 保证普通用户只见 active 产品。
- `product_memberships`：authenticated `auth.uid()=user_id OR (select private.is_platform_admin())`；`membership_events`、限制、管理员资格与管理审计只对 `(select private.is_platform_admin())` 为 true 的 JWT 有读 policy。平台限制 `blocked` 不代表本人可读取任何其他人数据。
- **不再创建 plans RLS 策略**：项目没有公共功能套餐表。用户本人只查询必要的产品、成员和 Pro Grant，受控管理员查询按真实 JWT+aal2 和活跃资格/RLS 校验；产品本身的状态查询沿用 products 的最小授权规则。
- `entitlement_grants/redemptions`：本人 `auth.uid()=user_id` OR 合格管理员；不要把 RLS 强行要求 active 成员，否则用户退出后无法查询合法历史。**DEC-05 的私有首次请求语义证据（可为强类型列/private 幂等行，旧指纹并非强制）**仅供 private 内核幂等检查，不进入普通/管理员 Data API SELECT 字段白名单，必须核查是否存在能绕过列授权的基表级 GRANT**；敏感字段不得被其他用户筛选枚举。
- `redemption_code_batches/redemption_codes`：RLS 仅合格管理员；对 authenticated **只授非秘密列的列级 SELECT**，**绝不** `GRANT SELECT ON TABLE redemption_codes`，否则会覆盖列级拒绝；对 code_hash、config_fingerprint 不授 Data API SELECT。客户端即便猜出 UUID 也不能用 SELECT/filter/order/returning 读取这些列。
- `redemption_rate_limits`：不授 anon/authenticated SELECT；仅可信受保护 `redeem_code` 函数 owner 可读写。平台管理员也不直接读取各用户原始失败时间戳。
- `private.is_platform_admin()`：`STABLE SECURITY DEFINER SET search_path=''`；全限定 `auth.uid()`、`auth.jwt()`、`public.platform_admins`、`public.platform_account_restrictions`；身份有效且 JWT `aal='aal2'`、当前资格 active、没有 `blocked` 才返回 true。其 owner 不能被端用户冒用；private schema `USAGE` 与这个定点函数 `EXECUTE` 可按 RLS 所需授予 authenticated，但 private **不在 Data API exposed schemas**、无 CREATE 权限；不开放任意用户 ID 参数的管理权限探针。
- **F01 最终设计**：`public` 可暴露 RPC 仅使用 `SECURITY INVOKER` 并从 PUBLIC/anon 撤权，按精确签名授 authenticated；状态+审计逻辑落在不暴露的 `private SECURITY DEFINER`，空 search_path、全限定名、受控最小 `NOLOGIN` owner。**PostgreSQL INVOKER 外壳没有额外调用权限**：要执行 private 内核，需要对 authenticated 授 private Schema USAGE 与**严格限定的内核 EXECUTE**；private 未在 API exposed schemas，但具备直接 SQL 凭据的调用角色理论上仍能调用内核，所以内核本身必须从经验证的 JWT 获得 actor、重新校验角色及对象，不接受冒充身份的参数。迁移需核查 PUBLIC 默认 EXECUTE、ALTER DEFAULT PRIVILEGES 的真正函数创建者、owner/RLS、public/protected 内核执行矩阵。参见 [F01 收敛](./aisencore-f01-f04-security-convergence-design.md#2-f01公开普通权限包装层--非暴露的定点扩权内核)。
- **重要 Supabase 验证项**：函数属主的 RLS 是否确实使用允许的可信 owner policy、被调用 PostgREST 的 Schema/函数暴露、列级 GRANT 与 MUI DataProvider 的列选择，以及 auth.jwt()/auth.uid() 在真实 JWT 会话中的可用性，均需在 D4 前用真实隔离数据库确认；只读 RLS predicate 本身不能替代 JWT 验签。

**最小权限 SQL 样例，仅供设计审查，不是完整迁移**：

```sql
-- DESIGN ONLY: 真实部署时先确认受控 owner 与扩展可用性
ALTER TABLE public.product_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_memberships TO authenticated;
CREATE POLICY memberships_read ON public.product_memberships FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()) OR (select private.is_platform_admin()));

-- 避免授权码哈希通过 Data API SELECT/filter 直接泄露。
ALTER TABLE public.redemption_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redemption_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, product_id, tier, grant_duration_days, batch_id, batch_ordinal,
              max_redemptions, redeemed_count, expires_at,
              revoked_at, revoked_by, created_by, created_at)
    ON public.redemption_codes TO authenticated;
CREATE POLICY admin_codes_read ON public.redemption_codes FOR SELECT
  TO authenticated USING ((select private.is_platform_admin()));
-- 禁止 SELECT(code_hash)；任何基表级 SELECT GRANT 都会绕过上述列白名单。
```

> 上述仅展示部分 SELECT 策略：实际迁移必须完成所有表、所有 GRANT、只读/写函数 owner 权限、强制 MFA 测试；D1 不会执行这些 SQL。

## 4. 统一锁序与单事务 RPC 算法

### 4.1 公用锁序（F02 统一后的唯一规范）

**统一采用 [F02 L0～L8 总序及逐操作矩阵](./aisencore-f01-f04-security-convergence-design.md#3-f02唯一事务锁总序与逐操作锁矩阵)**，但2026-10-23最新资格合同已移除套餐行：**L4 不再获取计划锁**；L0 管理写全局锁 → L1 本人/目标用户 → L2 本人失败限流 → L3 产品 → L5 已存在成员 → L6 码 → L7 同用户同产品 Pro 期限顺延 → L8 写入/审计。不得逆序；DB 实施时应先同步改写旧 F02 锁表和实验验证，不能直接照抄旧 plan FK/锁语句。

**M1** 管理操作始终校验 AAL2、实时管理员资格和保底；原 **M2 套餐功能锁取消**，但 L3 产品状态锁、L7 同用户同产品 Pro 续期锁及 M4 码/成员准入/兑换优先的锁序仍要在真实 DB 事务里验证，不能丢失发码、撤销与限流安全。

### 4.2 自助成员 RPC

| 操作 | 单事务中的必须步骤 | 成功/重复/拒绝结果 |
| --- | --- | --- |
| `EnsureMembership` | Auth JWT → 全局限制 → 产品 active（产品行 FOR SHARE）→ 已有成员 FOR UPDATE 或唯一约束安全插入 → 首次 join event | 无记录建 active + 一条 join；已有 active 返回 created=false 无新事件；left/suspended 不恢复 |
| `LeaveProduct` | Auth JWT → 本人现有成员 FOR UPDATE → 仅 active→left → leave event | 已退出不重新生成事件，不撤销 grant、R2 备份或其他产品资料 |
| `RejoinProduct` | Auth JWT → 平台限制 → active 产品 → left 成员 FOR UPDATE → active + rejoin event | 只接受本人明确重加；suspended 不解除 |
| `Suspend/RestoreMembership` | 管理员 JWT+`aal2`、当前资格 → 成员 FOR UPDATE → 保存/恢复 `pre_suspend_status` → 一条 member event | 重复暂停不覆盖原状态；解除暂停恢复原 active/left，不伪造 admin_audit_log 的成员事件 |

若账号全局 blocked、产品暂停或成员被暂停，重试/并发必须按**最终持有权威锁时**的事实判定；单次事务不可通过多次前端请求假装原子。成员 `left` 仍可以读取本人合法的退出状态/授权历史，但无法取得要求 active 的受保护新操作。

### 4.3 M1：最后合格管理员保底

- **资格计数定义**：`platform_admins.active=true` 且该 `user_id` 在 `platform_account_restrictions` 中**不存在** `kind='blocked'`；当前 `aal2` 是请求执行门槛，并**非**可用于数据库长期计数的管理员设备状态。
- `BlockAccount` 与 `RevokeAdmin`（以及 `GrantAdmin/UnblockAccount`）先取得**同一管理资格串行锁**，重新验证 actor 当前资格与 `aal2`，锁住目标行，按照拟定修改后的状态判断是否仍剩至少一名合格管理员；否则正常业务冲突 `STATE_CONFLICT`，不写限制、管理员资格或虚假审计。
- **例**：A/B 两个管理员同时互相封禁或撤权，第一事务提交后第二必须重新计算，不得两次均通过使合格人数变 0；仅剩一人自封禁/撤权也拒绝。
- Auth Admin SDK 的“禁用登录”如为高风险额外动作，不得对合格管理员**单独**直接调用绕过数据库保底；即使数据库 block 成功，跨 Supabase Auth 外部 API 仍非同库原子操作，要在 D3 设计故障补偿/恢复。若真实唯一管理员 MFA 丢失，是另行受控运维恢复情形，不因 DB 行数认为能够登录。
- 不将名册约束写成 `CHECK`（CHECK 无法可靠统计并发跨行计数）；需要统一事务锁协议及安全管理函数。

### 4.4 去除 Pro 业务功能版本与保留发行事实的并发规则

- **不实现 UpsertPlan 或功能/额度版本克隆**；Pro 30/365/永久不映射 `plans` 功能版本。并发保护仅覆盖真实授权、兑换、撤销、会员和码事实，锁顺序按 L0～L8 保留。
- `CreateCodes` 与 `GrantEntitlement` 必须在同一产品状态/套餐锁规则下取得 `plans FOR SHARE`，在事务内检查 `is_active` 再创建码/授权。两个相向并发事务必有先后次序：要么先编辑后发行，新码绑定修改结果；要么先发行后编辑，编辑被拒绝。
- 发行时长选项可由 UI 调整，但已发行未撤销、未过期且仍有次数的 Pro 码必须继续按原授予天数兑现；已经发放的 Grant 不随配置改变。禁止自动从“套餐停用”反推撤销旧码。
- 不存在公共套餐功能/显示名修改命令，也没有 `plan_key` 版本约束；只能通过受控发行参数设置当前 Pro 授予时段。历史码/Grant 不因 UI 时长预设调整被重写。

### 4.5 M3：批次幂等与明文一次性

1. 管理 JWT+`aal2`、当前资格和产品/套餐合法性 → L0/L3/L4 顺序锁 → 持久化发码首次规范化强类型配置，`(created_by,request_id)` 唯一竞争后以 NULL-safe 逐项比较；仅旧字段无法还原时保留私有指纹。原始 JSON/客户端哈希不可成为授权事实。
2. **已存在批次**：比较规范化配置指纹；参数不一致返回 `STATE_CONFLICT/INVALID_INPUT` 的候选稳定业务拒绝，**不重新生成码，也不返回旧明文**；相同则只返回批次 ID/数量等元数据。此分支不能作为“重新导出”。
3. **首次批次**：可信密码学 RNG 生成每码至少 128 bit 熵 → 同事务存码 SHA-256、批次序号及一条精简管理审计；首次成功 RPC 响应可把临时码明文返回给当前有权管理员复制/下载，不能落库、日志、监控或浏览器持久化。
4. 若响应丢失，即使 DB 已提交也无法恢复明文，需安全撤销原批次旧码，再创建**新的** request_id。不得在重复请求时为了“补发”生成其它明文。
5. 批次撤销对对应尚未撤销码加同事务行锁（稳定排序），只阻断后续兑现，不自动撤销之前 grant。必须验证事务过大时的数量限制与锁争用；具体发码上限由 U08 的产品运营规模驱动、D3 决定。

### 4.6 M4：核销、同套餐续期与失败限流

**以 DEC-01 A 与 [F02 L0～L8 全入口总序](./aisencore-f01-f04-security-convergence-design.md#3-f02唯一事务锁总序与逐操作锁矩阵) 为唯一实现合同**；下面只描述业务顺序，不能自行引入“先查码再确定产品/成员”的旧实现：

1. 从本人 JWT 取 `auth.uid()`，锁内检查账号 `blocked`、本人 15 分钟失败窗口/限流，以及**不可信声明的** `product_key` 是否存在且 active；依 F02 顺序取得 L1/L2/L3 与已存在成员的 L5。**`left/suspended` 必须在读取码表之前统一拒绝**，其失败是否计数依现行 X-01/DEC-01 合同，不能因审计建议私改；此时不查询码哈希或真伪。
2. 成员为 `none/active` 后才规范化并哈希码、取 L6 码锁，核对码真实产品归属必须等于声明产品；对未知/跨产品/撤销/过期/耗尽执行非泄露失败语义。本人成员合法且查到码时，先检查本人的 `redemptions(code_id,user_id)`；已经兑过返回 `REDEEM_ALREADY_USED`，不得新增 grant 或重复失败计数。顺序和例外以 D2 X-01 为准。
3. 所有能正常返回 `ok=false` 的预期拒绝分支不得留下成员、事件、grant、redemption、`redeemed_count` 的部分写；唯经批准的失败限流记录可按窗口正常提交。推荐**先完成所有业务校验，末尾集中一次原子写入**，技术异常直接抛出使整个事务回滚，绝不吞成 `ok=false`。
4. 合法兑换在同套餐 L7 锁内读取真实授权区间；周期顺延从 **now 或与当前有效期连续衔接的末端** 开始。**不能简单把孤立远期 `explicit_window` 授权的最大 `ends_at` 当作当前连续权益**，否则会漏掉中间无权限的空档并把新兑换推迟一个月。未来排期如果真实需要保留，必须计算连通区间；不得未经用户确认擅自禁止已经批准的显式未来区间。永久 grant 单独按已批准语义处理。
5. 成功分支依锁序创建必要的 `active` 成员/`join` 事件、确定性来源的唯一 grant、redemption 及码计数，在同一事务提交；旧码可在套餐 `is_active=false` 时兑现但受码自身撤销/到期/计次限制。任何失败必须整笔回滚。
6. 失败窗口/频率数值、`REDEEM_ALREADY_USED` 优先级、错误码及是否计入提前拒绝，都只能按已批准的 DEC-01 / D2 X-01 统一执行；在真实隔离数据库以两设备同码、双码续期、成员 left/suspended、断档未来 grant、超时/故障注入验证，不让静态设计冒充测试通过。

**竞争验证**：两人争最后一码、同人同码重放、同人同套餐两码同时续期、已兑后撤码/过期、新产品声明与码真实归属不一致，以及远期时间窗断档都必须有实际 SQL/HTTP 负向证据。

### 4.7 其他高权限写入与准入读

- `GrantEntitlement`（DEC-05 A）：管理员 `aal2`、当前资格后以互斥 `duration`（正天数可信时钟同套餐顺延）或 `explicit_window`（完整时间，显式 NULL 才永久）授权；actor-scoped request_id 比较首次持久化的规范输入和已算时段，同参返回原 grant，异参 `STATE_CONFLICT`。受保护 RPC 以 L7 锁内算时段并审计同事务，不自动建立成员或解封；旧指纹若可完整还原可删，否则须保留私有受限技术证据。
- `RevokeGrant` / `RevokeCode`：管理员资格与目标行锁 → 只设置撤销信息并同事务审计；重复请求不重复审计，旧码撤销不追溯取消已兑换 grant。
- `SetProductStatus`：管理员资格 → `products FOR UPDATE` → 状态与审计同提交；`active→suspended` 只影响**新的**公共准入/加入/兑换，不重写所有成员或历史授权。
- `UnblockAccount` / `GrantAdmin`：统一管理员互斥锁与当前资格校验，状态变更和审计同一事务；对外登录封禁/恢复在 D3 编排，不声称跨 Auth API 原子。
- `CheckAccess(product_key)`：本人无副作用只读，公共平台只判断账号、产品、成员和同产品 Pro 有效时段；返回 `tier/pro_active/period/allowed/reason`，不读取 Free/Pro 业务 Features/Limits 或 capability。业务拒绝 200，JWT 401，可信失败 503；不替 SaaS 执行项目/备份权限和用量核算。

## 5. Aisenlens R2 备份的数据归属与权限边界

**已确认首发需求与获批例外**：本地 Aisenlens 匿名 Free 可离线使用；用户主动备份**非敏感小型白名单 JSON** 经受保护 Supabase Edge 校验并可信写入 R2 final，恢复经当前鉴权签短期 GET 后客户端直接下载；其它普通私有文件仍遵守客户端直传 R2 边界。公共服务不得接收视频、整个项目/时间轴、AI 结果或用户 API Key，产品元数据与容量由产品侧可信事务维护。详见[本地优先架构](../../architecture/applications/local-first.md)与[产品文件架构](../../architecture/database/product-data-and-files.md)。

| 数据或判断 | 所属组件（D1 结论） | 后续必要实施设计 |
| --- | --- | --- |
| 用户身份与 UUID、Aisenlens `product_id/product_key` | 公共 Auth + products | D2 客户端如何携带真实本人 JWT，D3 产品注册与安全启用 |
| 本人 Aisenlens active/left/suspended、产品和全局限制 | 公共成员/限制 + CheckAccess | 备份签发前再次在线检查，退出/封禁不得获得**新的**签名权限 |
| AisenLens 私有备份业务限制 | AisenLens 产品自己的可信 Edge/备份元数据流程 | U04 未定具体上限；Pro 资格向 Core 验证，容量/对象/文件属主由 AisenLens 自己管理 |
| 单个备份对象 Key、用户与产品属主、大小、版本、上传状态、已用量 | **Aisenlens 持有的产品文件/备份元数据**，位置由其接入详设决定 | D2/D3 明确业务元数据存储（可独立库或合适的受保护 Schema）、锁定计算、数据生命周期与多设备恢复 |
| R2 对象字节与临时受控签名 | Cloudflare R2 + 最小可信签发 Edge Function | 备份读写签名作用域、有效期、上传确认、空间覆盖/垃圾文件、短凭证撤权延迟；**不得**把长期 R2 secret 放桌面客户端 |
| 客户端配置备份包含字段、版本兼容、合并/覆盖、过额、清理 | Aisenlens 产品业务设计 | 真实产品专项进一步确认，U07 数据政策和 U04 容量功能规格均未定；不在此授权云端备份视频/秘密 |

**D1 不新增通用 `public.files` / `public.backups` 表**：首批备份**必须实现**不代表已确认备份元数据必须存在公共核心库。下一阶段需明确是“Aisenlens 专属 Schema（若共用公共 Supabase Project）”还是“Aisenlens 独立业务存储”，两者都要求真实用户+产品+对象归属绑定和可信写权限。若必须为 Aisenlens 编写具体备份元数据 DDL，应先形成该产品范围的子设计；**不得**把公共服务变成所有 SaaS 的文件元数据总账。

**风险控制**：签名 URL 在有效期内可能延续访问、数据库 grant 状态变化不自动撤销已发 URL；上传不能只凭客户端自报对象大小、额度也不能只依靠本地计数；需要实际上传确认、服务端元数据与幂等关联。D2/D3 设计前的用户选择点：备份范围/版本/恢复策略、真实配额与删除政策。上述是实现检查项，不是已经确定的固定数值或协议。

## 6. 迁移顺序、环境和最小验证

### 6.1 未来 Migration 顺序（**设计草案，不创建/执行 SQL**）

| 序列 | 独立 migration 逻辑 | 依赖与验证关口 |
| --- | --- | --- |
| M00 | 确认项目 PostgreSQL/Supabase 版本；创建/检查 private Schema、所需 pgcrypto（若实际码 RNG/摘要采用），函数属主和默认 REVOKE 策略 | 不假设 extension 已可用；分离开发/生产、拒绝默认 PUBLIC EXECUTE |
| M01 | products（仅身份与状态字段）、product_memberships、membership_events、platform_admins、platform_account_restrictions、admin_audit_log | 不创建 `free_features/free_limits`、Free 指针或业务功能 schema |
| M02 | entitlement_grants、redemption_code_batches、redemption_codes、redemptions 与最小安全限流表 | 只记录 product_id+tier=pro+期限和授权来源，不建 plans、plan_id、Free/Pro 功能配置；保留哈希、兑换、强类型幂等与同产品索引 |
| M03 | 私有资格/验证助手、只读管理员策略；各表 RLS/GRANT/列级读取白名单；核心受保护管理/自助 RPC | 函数 owner、search_path、RPC 公开 Schema、业务拒绝事务提交的一致性审查；**全表默认禁止终端写入** |
| M04 | 在本人身份已确认且 U05 决定的情况下，通过受控运维过程引导首个管理员资格；注册真实产品由可信管理接口进行 | 引导不内嵌真实 owner UUID，保底约束不在初始化时把未创建管理员误拒绝；恢复能力明确 |
| M05 | 隔离环境权限/事务/竞争/回滚测试，检查 Admin DataProvider、SaaS 客户端最小查询及“云端服务故障拒绝” | pgTAP、并发工具、JWT/AAL 真实验证；通过前不得部署生产 |

实施时用 Supabase CLI 的**版本化 SQL migrations**纳入 Git，先在独立开发/测试数据库重建验证，再审批生产变更。禁止只有 Dashboard 手工 SQL 没有版本化来源。生产前执行可恢复备份、记录前向修复与回滚边界；删除数据、移除字段、改变不可变套餐/授权模型需单独变更审查。

### 6.2 D1 数据库测试映射（尚未运行）

| 类别 | 对应现行验收 | 迁移后必做的正反向/并发证据 |
| --- | --- | --- |
| 身份、隔离与成员 | I-01～I-11、I-13～I-17 | anon/本人/他人 SELECT/写权限；两设备唯一加入；退出/封禁/恢复状态及事件单一事务；产品暂停竞态 |
| 当前准入、授权不可验证 | I-12、I-18～I-21、I-28 | 当前平台/产品/成员/权益可信计算；受阻 200 allowed=false 与 401/503 的 D2 合约一致；不因异常“允许” |
| Admin + 最后管理员 | I-14～I-15、I-26～I-27 | 无 `aal2` 管理读取/写入均拒绝；自封禁/撤权保底；并发管理员互封禁，失败不产生假审计 |
| SaaS 和本地优先 | I-02～I-04、I-19～I-25 | Aisenlens 匿名 Free/本人在线 Pro/备份；公共校验不代替产品文件授权；退出不删除备份，跨产品不混权 |
| 兑换、安全限流 | R-01～R-06、R-10～R-12 | 码明文只首次；码 hash 不可查询；已用尽/过期/撤销对本人重复与其他用户不同分支；15 分钟限流可提交、拒绝不增 grant |
| Pro 授权期限、发码与真实并发 | R-07～R-09、R-13～R-15（按新资格合同修订） | 双模式直授首次输入重试不重复顺延；未来显式时段不提前给 Pro；周期续期、永久授权及旧有效码不随 UI 期限预设变化而失效 |

测试应包含 `git diff --check`、数据库 pgTAP 断言、双事务并发（非串行假测试）、拒绝读取 `code_hash` 的 SQLSTATE/HTTP、审核日志去敏、回滚故障注入。只有创建实际 SQL 和隔离 DB 后才能填写通过证据。**本次 D1 只交付设计，没有运行任何 pgTAP 或部署**。

## 7. 待决清单与 D2/D3 交接

### 7.1 已知用户决定（不代为填写）

| 来源 | 事项 | D1 状态/影响 |
| --- | --- | --- |
| U01 | Aisenlens 首发，本地优先 | **已确认**；首条对接以本地客户端本人 JWT 和私有备份为准 |
| U02 | R2 文件/配置备份首批必须交付 | **已确认**；D2/D3 必须有可信签发、备份元数据及撤权配额方案 |
| U03 | 对公众开放注册 | **方向已确认**；真实防滥用、邮件与生产准入未验收，不阻塞 D1 |
| U04 | Aisenlens Free/Pro 真实功能键、额度、试用/周期 | **待用户，产品接入/实施前**；公共 schema 不写死套餐值 |
| U05 | 初始管理员人选、MFA 恢复责任 | **待用户，D3 初始化前**；迁移不硬编码账户 |
| U06 | 域名、发件服务与回调 | **待用户，D3/上线前**；不阻塞 D1 |
| U07 | 人工注销与数据/备份保留政策 | **待用户，上线前**；FK 不默认 CASCADE |
| U08 | 发码规模上限与分发责任 | **待用户，D3 Admin 设计前**；批次有结构、无定量上限假设 |

**另需产品专项确认但不阻塞 D1 公共表结构**：Aisenlens 允许备份的配置字段（仍须排除视频/AI/秘密）、备份元数据的物理落点、恢复覆盖/合并、版本与对象路径/配额单位和超额策略；优先在 D2 的 Aisenlens 接入详细计划中显式登记，如涉及真实产品行为由用户确认。

### 7.2 纯技术核验与 D2 交接

1. **D2 公共 API**：把 D1 的自助/管理函数逻辑转化为最终数据库函数签名和 JSON 响应/SQLSTATE HTTP 映射；审查 `RedeemCode` 业务失败正常提交 rate_limits、`CheckAccess` 200 + allowed=false 与 401/503。
2. **D2 Aisenlens 本地接入**：确认客户端 `EnsureMembership/CheckAccess`、JWT 刷新、启动/关键操作在线复核、R2 签发的本人身份与恢复/私有对象权限；若产品文件元数据需独立 DB，设计跨库协调，而不是声称公共数据库可原子提交 R2。
3. **D3 React-admin 与运维**：DataProvider 显式选择列（特别不能用 `SELECT *` 查询 code_hash）、MFA/Edge Auth Admin、单次发码业务上限、安全的首次明文响应/下载、生产发信/部署配置与初始管理员引导。
4. **D4 验收**：本阶段矩阵转 pgTAP、并发与端到端测试；回填真实测试与故障注入，不仅静态审查。
5. **环境兼容性**：需在实际 Supabase PostgreSQL 项目或等价版本的隔离库核验自建 NOLOGIN owner、RLS security_invoker/column grants、`private` 函数权限、pgcrypto、PostgREST 错误码与函数暴露；当前没有任何运行证据。

## 8. D1 设计级评审与实现前阻塞

- **M1**：共同事务锁 + 修改后合格管理员非零；独立 Auth Admin 封禁不能绕过；审计成功原子。
- **M2（修订）**：已提交 Pro 发码的期限、来源和 Grant 时段不可被运营快捷选项改写；同用户同产品 Pro 周期顺延必须在可信锁下串行，历史码仍按原授予期限兑现，明确撤销才阻止后续兑换。
- **M3**：批次 request_id 幂等、只存哈希、明文只首次响应；重试不恢复。
- **M4**：本人重复兑换判定先于码用尽/过期/撤销；失败计数在业务拒绝正常提交；多用户核销不超量。
- **M5**（D2 交接）：数据库业务拒绝表达与对外 HTTP 状态不冲突，错误 503 不得冒充可信 deny。
- **Aisenlens R2**：首批必须支持，但文件元数据归属与客户端签发属于产品专项；不能将产品备份强行塞入公共权益数据库。

**D1 设计退出判断**：本文件给出了能够起草 DDL、RLS、受保护 RPC 事务与测试的具体输入。**但**这不代表迁移、SQL 运行、Supabase/pgTAP 兼容与并发已经验证；这些是真正开始实现与 D4 验收之前必须关闭的技术风险。若实现时发现某项设计改变已定业务语义，应先回到现有权威和用户审批，而非自动默许。
