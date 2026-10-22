# D1｜AisenCore MVP PostgreSQL 物理模型、RLS 与事务实施设计

> **状态：D1 实施设计候选，待后续迁移代码/真实环境与 pgTAP 验证。本文不是已执行的 SQL、已部署权限或新增业务规则。**
>
> **F01/F02 安全收敛补订（2026-10-22）**：关于公开 RPC 与扩权权限、统一锁序及核销分支，以下候选以 [F01～F04 安全设计收敛 §2～3](./aisencore-f01-f04-security-convergence-design.md) 的明确方案为准：**public 只允许 SECURITY INVOKER 薄外壳，private 最小 SECURITY DEFINER 内核；所有管理写函数先 L0，敏感本人操作使用 L1，产品/计划/成员/码/续期严格按 L0～L8 顺序**。不改变 M1～M5 业务含义，真实 SQL/RLS/pgTAP 未测试。
>
> **F05～F08 候选合同补订（2026-10-22）**：管理员发码的有效默认参数/时间戳 canonical v1、`(created_by,request_id)` 原子唯一与仅首次明文、管理员直接授权的 actor-scoped `source_ref` 及参数防变指纹、套餐**全字段提交而非隐式 PATCH**，均以 [F05 契约收敛与 F08 验证准备](./aisencore-f05-f08-contract-compatibility-readiness-design.md) 为准。这里只修改未执行的 DDL 候选；F06/F07 用户政策仍未批准。
>
> **BaaS/RPC 安全适用性补订（2026-10-22）**：按 [原子配额反例与安全检查](./aisencore-mvp-baas-quota-security-lessons.md) 在**未来真的存在消费型产品操作时**检查可信成本正数/上下限、真实 actor/对象归属、F02 锁序、条件写/请求指纹幂等与审计。拒绝将外部 `public SECURITY DEFINER consume_user_quota(cost_amount)` 示例作为迁移；客户端传负数可能**增加**余额、且默认函数 EXECUTE/owner/RLS 会扩大攻击面。**不新增本 D1 表或 RPC**；现有 R2 配额是产品元数据 `ready+reserved` 事务，不是 AisenCore 通用余额。
>
> 设计输入：[D0 基线及 U01/U02](./aisencore-mvp-d0-scope-and-baseline.md)；业务真相以 [产品/成员/管理逻辑模型](../../architecture/database/database-constraints-and-audit.md)、[权益/兑换约束](../../architecture/database/entitlements-and-redemption-constraints.md)、[访问与事务边界](../../architecture/database/database-access-and-transactions.md) 和 [业务领域架构](../../architecture/domains/README.md) 为准。
>
> **本轮范围**：公开 PostgreSQL 关系结构、约束、索引、读权限、受保护 RPC 的事务/锁设计，标注 D2 API 和 Aisenlens R2 的接口。**不执行 SQL、不创建 migration、云资源、业务代码或部署。**

## 0. 决策分层与审查约束

- **逻辑不变量（已确定）**：`auth.users.id` 是统一身份；`products`、唯一的当前成员与变更事件；独立管理员、平台限制和管理审计；同库套餐、授权、码及兑换；兑换哈希和限流；当前有效权益由授权+冻结套餐计算；RLS 限读、状态+审计经同一 PostgreSQL RPC 事务写入。
- **本 D1 提出供实现采用的具体化**：列类型、PK/FK、CHECK/索引、`redemption_code_batches` 最小幂等辅助表、私有函数及带实际顺序的锁策略。属于**实施设计候选**；发现其影响已定业务语义或 Supabase 权限约束时先回到对应权威确认，不自行发明产品功能。
- **D2 留待锁定**：可调用 RPC 的确切 SQL 签名、SQLSTATE/HTTP 映射、`CheckAccess` 输出、`CreateCodes` 明文首次响应的网络重试协议、Auth JWT/邮件流程和 R2 凭证签发入口。
- **Aisenlens 已确认**：U01 首发是本地优先 Aisenlens，U02 首批必须有 R2 文件/配置备份；**不等于**允许上传视频、AI 结果、项目数据库、API Key 或任何默认公开分享，亦不等于已选备份字段、容量或文件保留时间。
- **上线前仍须由用户决定**：U03～U08（发布范围、真实套餐/额度、初始管理员、域名/发信、注销政策、发码规模）。D1 不预设具体实际值。

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

### 2.2 套餐、授权、发码批次、兑换与限流

**`public.plans`**
- `id uuid PK`；`product_id uuid NOT NULL REFERENCES public.products(id)`；`plan_key text NOT NULL`；`name text NOT NULL`；`features jsonb NOT NULL DEFAULT '[]'::jsonb`；`limits jsonb NOT NULL DEFAULT '{}'::jsonb`；`default_duration_days integer NULL`；`is_active boolean NOT NULL DEFAULT true`；`created_at/updated_at timestamptz NOT NULL`。
- `UNIQUE(product_id,plan_key)`，再声明 `UNIQUE(id,product_id)` 供授权和码的复合 FK；`CHECK(default_duration_days IS NULL OR default_duration_days>0)`。
- **features** 是去重、非空字符串键的 JSON array；**limits** 是键到非负且有限的 JSON number 的 object，键不能与同产品 features 冲突。用受控 `private.valid_features/valid_limits` 的 IMMUTABLE 约束辅助（若 DB CHECK 中调用自定义函数，应限制未来函数行为随意变更），写函数检查**同一产品所有版本**的“相同键不能同时是开关又是额度”的业务不变量，并对产品行取得排他锁串行化两个新套餐的插入/变更。
- 一旦被**任何** grant 或**任何已发行/即使已撤销** code 引用，`product_id,plan_key,features,limits` 永久不可改；修改权益创建新 `plan_key` 版本。仅 `name,is_active` 等不影响承诺的展示/运营字段可变。`is_active=false` 仅禁止新码/直接新授权，不阻止旧有效码兑换或既有授权生效。**Free 基础方案停用对无 grant 用户的权益展示语义若需额外决定，交 D2 对照领域权威核验，不在 D1 偷换业务规则。**
- 索引 `(product_id,is_active,plan_key)`（产品套餐列表候选；若小数据量应压缩索引，待 EXPLAIN 核验）。

**`public.entitlement_grants`**
- `id uuid PK`；`user_id uuid NOT NULL REFERENCES auth.users(id)`；`product_id uuid NOT NULL REFERENCES public.products(id)`；`plan_id uuid NOT NULL`；`source_type text NOT NULL`；`source_ref text NOT NULL`；`admin_request_fingerprint bytea NULL`（**F05 最小技术辅助列，非第二份授权事实**）；`starts_at timestamptz NOT NULL`；`ends_at timestamptz NULL`；`revoked_at timestamptz NULL`；`revoked_by uuid NULL REFERENCES auth.users(id)`；`revoke_reason text NULL`；`created_at timestamptz NOT NULL`。
- `FOREIGN KEY(plan_id,product_id) REFERENCES public.plans(id,product_id)`；`UNIQUE(source_type,source_ref)`；`CHECK(source_type IN ('redeem_code','admin'))`（未来支付/试用来源进入相应阶段迁移扩充）；`CHECK((source_type='admin' AND admin_request_fingerprint IS NOT NULL AND octet_length(admin_request_fingerprint)=32) OR (source_type='redeem_code' AND admin_request_fingerprint IS NULL))`；`CHECK(ends_at IS NULL OR ends_at>starts_at)`；`CHECK(revoked_at IS NULL OR (revoked_by IS NOT NULL AND nullif(trim(revoke_reason),'') IS NOT NULL))`。
- 索引 `(user_id,product_id,starts_at DESC)` 与 `(user_id,plan_id,ends_at DESC) WHERE revoked_at IS NULL AND ends_at IS NOT NULL`，分别支持当前权益和同套餐续期。严禁以删除行撤销权益或在成员状态转换时改动它。
- `source_ref` 对兑换仍为确定性的 `code_id:user_id`；管理员直接授予明确使用 **`admin:<actor_user_id>:<request_id>`**（来自可信 JWT 操作者而非客户端自报），避免不同管理员的请求 UUID 偶然碰撞；`admin_request_fingerprint` 对 actor、请求/目标/产品/套餐/规范 UTC 开始结束时间及 trim 后 reason 做 canonical v1 SHA-256，重试参数不同则事务级 `STATE_CONFLICT`，相同则读取原授权而不新授予/新审计。永久 grant 的 `ends_at IS NULL`。详见 [F05 §2.3](./aisencore-f05-f08-contract-compatibility-readiness-design.md#23-管理员直接授权actor-命名空间--可持久校验的请求指纹)，无新增表。

**`public.redemption_code_batches` —— 本 D1 的最小新增实现辅助表**
- 理由：单凭码的 `batch_id` 不能可靠检验**同一管理员同一 request_id 相同配置重复重试**与“参数不同返回冲突”，也不能在明文丢失后安全展示批次概览；辅助表仅维护**幂等配置摘要**，**不增加另一个业务授权事实**。
- `id uuid PK`；`created_by uuid NOT NULL REFERENCES auth.users(id)`；`request_id uuid NOT NULL`；`product_id uuid NOT NULL REFERENCES public.products(id)`；`plan_id uuid NOT NULL`；`config_fingerprint bytea NOT NULL`（**F05 canonical v1 有效配置 32 字节 SHA-256**：actor、产品、套餐、数量、含缺省的真实 grant 时长/每码使用次数/规范 UTC 微秒截止时间；不接受客户端直接提供 digest）；`quantity integer NOT NULL`；`grant_duration_days integer NULL`；`max_redemptions integer NOT NULL`；`expires_at timestamptz NULL`；`created_at timestamptz NOT NULL`。
- `UNIQUE(created_by,request_id)`、`UNIQUE(id,created_by)`，`FOREIGN KEY(plan_id,product_id) REFERENCES plans(id,product_id)`，`CHECK(quantity>0 AND max_redemptions>=1 AND (grant_duration_days IS NULL OR grant_duration_days>0) AND octet_length(config_fingerprint)=32)`。
- 幂等重放读此批次的元数据与摘要：有效配置中 `max_redemptions` 缺省=1，但显式 JSON NULL **无效**；`grant_duration_days/expires_at` 缺省与 NULL 等价；时间戳时区等效输入应形成相同指纹。首次提交之后重试**仅返回已存在且明文不可恢复**，不同配置为 `STATE_CONFLICT`；不得存码明文、导出附件、码清单明文或浏览器持久存储。实际**单次量上限**需受可信 RPC 上限约束；具体运营规模由 U08 确认，未审批不写死生产值。

**`public.redemption_codes`**
- `id uuid PK`；`code_hash bytea NOT NULL`；`product_id uuid NOT NULL REFERENCES public.products(id)`；`plan_id uuid NOT NULL`；`grant_duration_days integer NULL`；`max_redemptions integer NOT NULL DEFAULT 1`；`redeemed_count integer NOT NULL DEFAULT 0`；`expires_at timestamptz NULL`；`batch_id uuid NOT NULL`；`batch_ordinal integer NOT NULL`；`revoked_at timestamptz NULL`；`revoked_by uuid NULL REFERENCES auth.users(id)`；`created_by uuid NOT NULL REFERENCES auth.users(id)`；`created_at timestamptz NOT NULL`。
- `UNIQUE(code_hash)`；`CHECK(octet_length(code_hash)=32)`、`CHECK(max_redemptions>=1 AND redeemed_count>=0 AND redeemed_count<=max_redemptions)`、`CHECK(grant_duration_days IS NULL OR grant_duration_days>0)`、`CHECK(batch_ordinal>=1)`；`FOREIGN KEY(plan_id,product_id) REFERENCES plans(id,product_id)`；`FOREIGN KEY(batch_id,created_by) REFERENCES redemption_code_batches(id,created_by)`；`UNIQUE(created_by,batch_id,batch_ordinal)`。
- 码的规范化与安全随机数候选：在受控 RPC 内使用经验证的密码学随机数产生不少于 128 bit 有效熵，例如 20 个加密安全随机字节编码为 40 个十六进制字符（160 bit）；输入只允许约定分组标点并规范化，再 SHA-256 得到 `bytea(32)`。**只存哈希，不存可还原随机种子或明文**。若采用 pgcrypto，安装位置和 RNG 函数的版本需在隔离环境验证；D2 再固定码格式与网络响应。
- 索引 `(batch_id,batch_ordinal)` 由上述 UNIQUE 的前导列顺序可能并不完全覆盖，分页按批次需显式 `(batch_id,batch_ordinal)` 索引；索引 `(product_id,created_at DESC)` 用于管理员按产品分页。**普通/管理员 Data API 均不得 SELECT `code_hash`**（见 §3）。

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
| 套餐引用、字段冻结、键类型 | FK、UNIQUE、局部 JSON 合法性 | **M2** 任何历史 grant/code 引用、并发发码/授予与字段修改串行化、产品内所有版本能力键类别不冲突 |
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
| `plans` | 无 | 只读启用套餐且产品 `active` | 全部套餐必要列 | 全部拒绝 |
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
- `plans`：普通 authenticated `is_active AND EXISTS (SELECT ... products WHERE status='active')`，加管理员谓词。产品表的 policy 若使用对 admin helper 的递归查询，必须在 pgTAP 中验证不会递归/泄露。管理员列表必须使用 Auth 批准后 RLS。
- `entitlement_grants/redemptions`：本人 `auth.uid()=user_id` OR 合格管理员；不要把 RLS 强行要求 active 成员，否则用户退出后无法查询合法历史。**新增的 `admin_request_fingerprint` 仅供 private 内核幂等检查，不进入普通/管理员 Data API SELECT 字段白名单，必须核查是否存在能绕过列授权的基表级 GRANT**；敏感字段不得被其他用户筛选枚举。
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
GRANT SELECT (id, product_id, plan_id, batch_id, batch_ordinal,
              grant_duration_days, max_redemptions, redeemed_count, expires_at,
              revoked_at, revoked_by, created_by, created_at)
    ON public.redemption_codes TO authenticated;
CREATE POLICY admin_codes_read ON public.redemption_codes FOR SELECT
  TO authenticated USING ((select private.is_platform_admin()));
-- 禁止 SELECT(code_hash)；任何基表级 SELECT GRANT 都会绕过上述列白名单。
```

> 上述仅展示部分 SELECT 策略：实际迁移必须完成所有表、所有 GRANT、只读/写函数 owner 权限、强制 MFA 测试；D1 不会执行这些 SQL。

## 4. 统一锁序与单事务 RPC 算法

### 4.1 公用锁序（F02 统一后的唯一规范）

**统一采用 [F02 L0～L8 总序及逐操作矩阵](./aisencore-f01-f04-security-convergence-design.md#3-f02唯一事务锁总序与逐操作锁矩阵)**，替换此前不完整的“只针对管理员资格写入口互斥、核销先锁码”的建议。摘要：**L0 所有管理写全局互斥 → L1 目标账号事务级锁 → L2 本人核销失败限流 → L3 产品 → L4 套餐 → L5 已存在成员 → L6 码 → L7 同用户套餐授权续期 → L8 最终写入/审计**。按需获取，不得逆序；获取 ID 可先非锁定读取，锁内须再次验证归属与状态。用户成员缺失且核销尚未确定有效时不得提前插入；首次 INSERT + join event 延至 L8。隐式 FK/唯一锁和跨用户竞态仍须实际双事务验证。

**M1** 所有管理写而非仅管理资格变更必须先取 L0 并重验当前 admin/`aal2`；**M2** 修改套餐的 L3 UPDATE/L4 UPDATE 与发行授予的 L3 SHARE/L4 SHARE 互斥；**M4** 核销在 L5 已存在成员锁后取 L6 码锁，再检查本人 redemptions 优先级，在业务成功之后才写入缺失成员、grant/redemption/次数。技术死锁/审计异常须全事务回滚，预期业务拒绝在限流写入后正常提交。

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

### 4.4 M2：套餐冻结与发码/授予竞态

- `UpsertPlan` 更新 `product_id,plan_key,features,limits` 前，统一锁序取得产品更新锁及目标 `plans FOR UPDATE`，核验该计划**不存在任何** `entitlement_grants` 或 `redemption_codes` 引用（不排除已撤销码/历史授权），否则拒绝权益列原地修改；名称/停用允许相应管理操作。
- `CreateCodes` 与 `GrantEntitlement` 必须在同一产品状态/套餐锁规则下取得 `plans FOR SHARE`，在事务内检查 `is_active` 再创建码/授权。两个相向并发事务必有先后次序：要么先编辑后发行，新码绑定修改结果；要么先发行后编辑，编辑被拒绝。
- `is_active=false` 只阻止**新**发码与管理员直接授权；已发行有效码仍能按其已冻结的套餐版本兑换；已授予的权益不因停用消失；若要止旧码必须显式撤销码/批次。修改套餐能力要创建 `pro_v2` 等新版本，旧计划不可删除导致级联损失。
- 若没有权益字段变更，仅修改展示名，不应无故要求复制新的套餐权益版本；`product_id/plan_key` 自有稳定性仍照领域权威检查。

### 4.5 M3：批次幂等与明文一次性

1. 管理 JWT + `aal2` /当前资格/产品与套餐资格 → 产品 `FOR SHARE`、套餐 `FOR SHARE` → 用服务端**有效参数 canonical v1 指纹**及 `(created_by,request_id)` 唯一键取得批次幂等保护；不能对原始 JSON 字节求 hash 或依赖客户端传来的摘要（细则见 [F05](./aisencore-f05-f08-contract-compatibility-readiness-design.md#22-发行批次-v1-规范化有效配置与指纹)）。
2. **已存在批次**：比较规范化配置指纹；参数不一致返回 `STATE_CONFLICT/INVALID_INPUT` 的候选稳定业务拒绝，**不重新生成码，也不返回旧明文**；相同则只返回批次 ID/数量等元数据。此分支不能作为“重新导出”。
3. **首次批次**：可信密码学 RNG 生成每码至少 128 bit 熵 → 同事务存码 SHA-256、批次序号及一条精简管理审计；首次成功 RPC 响应可把临时码明文返回给当前有权管理员复制/下载，不能落库、日志、监控或浏览器持久化。
4. 若响应丢失，即使 DB 已提交也无法恢复明文，需安全撤销原批次旧码，再创建**新的** request_id。不得在重复请求时为了“补发”生成其它明文。
5. 批次撤销对对应尚未撤销码加同事务行锁（稳定排序），只阻断后续兑现，不自动撤销之前 grant。必须验证事务过大时的数量限制与锁争用；具体发码上限由 U08 的产品运营规模驱动、D3 决定。

### 4.6 M4：核销、同套餐续期与失败限流

`RedeemCode(input)` 单事务的顺序必须兼顾“本人重复兑换优先”和“不改动失败业务状态”：

1. 从已验证 JWT 取 `auth.uid()`，先排除平台 blocked；**取得本用户 rate_limits 行锁、修剪 15 分钟窗口**，达到 10 条返回 `RATE_LIMITED`（正常业务结果）。
2. 在受控内存里规范化输入并 SHA-256 查码（未知码不暴露是否存在）；**未知** → 写本次失败时间，正常返回 `REDEEM_CODE_INVALID`，不得创建成员或授权。
3. 对找到的码，根据只读 ID 定位所属产品；**先在 L1/L2 后取得 L3 产品 SHARE、L5 已存在成员 FOR UPDATE（若有），再取 L6 码 FOR UPDATE**；锁内重新校验码/用户/产品绑定。**首先查询 `redemptions(code_id,auth.uid())`**，如已存在返回 `REDEEM_ALREADY_USED`，不新增失败次数或 grant，哪怕码后来用尽/过期/撤销；身份、blocked 与限流仍按已定优先级。
4. 尚未兑过的请求核验码未撤销、未过期、次数未耗尽、产品 active 与成员是否可入会；`plans.is_active` **不影响旧码兑现**。已有 left/suspended 按既定规则拒绝；**缺成员时暂不插入，待 L6/L7 验证成功后在 L8 最终写入阶段原子创建 active + join event**。既有成员与全局限制必须依锁内权威状态判定。
5. 取得同用户/同套餐续期事务锁，重新读取最新有效周期授权的未来最晚到期（忽略撤销和过期）；周期 `starts_at=max(now,latest_unrevoked_ends_at)`，`ends_at=starts_at+grant_duration_days`；NULL 时长生成永久授权。不因已有永久同套餐授权伪造周期叠加。
6. 确定来源 `source_type='redeem_code', source_ref=code_id:user_id`；**先 INSERT grant → 后 INSERT redemption → 码 redeemed_count+1**，必要新成员与事件同事务；UNIQUE 和 CHECK 在意外竞态时仍为底线。
7. 可预期无效/left/suspended/用尽等业务拒绝时，**只允许记录最新一次失败限流信息（符合已定规则），不得留下任何新成员、事件、grant、兑换或码次数变化**；例如将成员创建推迟到所有业务检查完成后，或在有明确锁保护时保证后续拒绝路径不产生部分写。技术异常则必须让事务整体回滚（包括此次失败统计），交 D2 对应 HTTP 5xx 映射。
8. 代码/明文/错误信息绝不在错误响应区分未知/撤销/用尽/过期；客户端超时先查本人授权与兑换历史，不能推断未提交。

**竞争检验**：两名用户兑同一张剩一次码 → 只有一笔提交；同用户同一码两设备重试 → 仅一 grant；同用户两张不同码同套餐同时续期 → 依 L1/L7 事务锁连接，不重叠；码在首次成功后被撤销/到期/用尽，老用户 `REDEEM_ALREADY_USED`、其他用户 `REDEEM_CODE_INVALID`。特别用 [LCK-01～07](./aisencore-f01-f04-security-convergence-design.md#34-必须真实执行的并发及故障用例) 验证隐含锁不会制造死锁，不能因设计完成宣称已运行通过。

### 4.7 其他高权限写入与准入读

- `GrantEntitlement`：管理员`aal2` → 产品/套餐锁 → 对受控目标用户按 **`source_ref='admin:<actor_uuid>:<request_uuid>'`** 与 `admin_request_fingerprint` 检查参数完全一致的重放/参数不同的冲突 → 同套餐续期串行锁 → INSERT grant + 管理审计同事务；**不**自动创建成员或解除账号/产品限制。显式 starts_at/ends_at 的有效值被纳入指纹，不据此发明试用/自动续期规则。SQL 编译、时段互斥与真实 PostgREST 签名仍待隔离验证。
- `RevokeGrant` / `RevokeCode`：管理员资格与目标行锁 → 只设置撤销信息并同事务审计；重复请求不重复审计，旧码撤销不追溯取消已兑换 grant。
- `SetProductStatus`：管理员资格 → `products FOR UPDATE` → 状态与审计同提交；`active→suspended` 只影响**新的**公共准入/加入/兑换，不重写所有成员或历史授权。
- `UnblockAccount` / `GrantAdmin`：统一管理员互斥锁与当前资格校验，状态变更和审计同一事务；对外登录封禁/恢复在 D3 编排，不声称跨 Auth API 原子。
- `CheckAccess`：**无副作用**读取当前平台限制、产品、成员、`free` 基础和有效 grant + 冻结 plan；可信拒绝正常返回 `allowed=false/reason`。不在此 RPC 创建成员、写审计、记录次数，也不以本地客户端缓存代替新授权判断；认证失败 401 与服务故障 503/5xx 的 PostgREST 映射由 D2 校验。单次 SQL 语句的一致性快照不会对异步签发的 R2 临时 URL 实施实时撤回。

## 5. Aisenlens R2 备份的数据归属与权限边界

**已确认的首发需求**：本地 Aisenlens 首批支持用户主动触发的 R2 **私有配置/文件备份**；首条真实链路是本地匿名 Free 继续离线运行，需登录 Pro/私有备份时本人登录公共 Auth、合法按需加入并获取公共准入，签发经授权的短期文件访问凭证后客户端直传/直读 R2。公共 Supabase/PostgreSQL 不收发文件字节，也不接收原始视频、拉片项目数据、AI 结果或 AI Key。参考[本地优先架构](../../architecture/applications/local-first.md)与[数据/文件归属](../../architecture/database/product-data-and-files.md)。

| 数据或判断 | 所属组件（D1 结论） | 后续必要实施设计 |
| --- | --- | --- |
| 用户身份与 UUID、Aisenlens `product_id/product_key` | 公共 Auth + products | D2 客户端如何携带真实本人 JWT，D3 产品注册与安全启用 |
| 本人 Aisenlens active/left/suspended、产品和全局限制 | 公共成员/限制 + CheckAccess | 备份签发前再次在线检查，退出/封禁不得获得**新的**签名权限 |
| 备份功能开关与**上限** | 公共 `plans.features/limits` 与 `entitlement_grants` | U04 未定具体键、单位、容量；D2/D3 确认准入能力与额度如何传递 |
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
| M01 | products、product_memberships、membership_events、platform_admins、platform_account_restrictions、admin_audit_log | Auth FK、状态/审计 CHECK/索引、默认不级联 |
| M02 | plans、entitlement_grants、redemption_code_batches、redemption_codes、redemptions、redemption_rate_limits | 所有跨表复合 FK、唯一来源、码计数与哈希/指纹长度 |
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
| 权益、续期与套餐冻结 | R-07～R-09、R-13～R-15 | 周期续期事务锁；永久授权；码撤销不追溯 grant；已有 grant 或 issued code 时更新 features/limits 拒绝，旧有效码在 plan 停用后仍可兑换 |

测试应包含 `git diff --check`、数据库 pgTAP 断言、双事务并发（非串行假测试）、拒绝读取 `code_hash` 的 SQLSTATE/HTTP、审核日志去敏、回滚故障注入。只有创建实际 SQL 和隔离 DB 后才能填写通过证据。**本次 D1 只交付设计，没有运行任何 pgTAP 或部署**。

## 7. 待决清单与 D2/D3 交接

### 7.1 已知用户决定（不代为填写）

| 来源 | 事项 | D1 状态/影响 |
| --- | --- | --- |
| U01 | Aisenlens 首发，本地优先 | **已确认**；首条对接以本地客户端本人 JWT 和私有备份为准 |
| U02 | R2 文件/配置备份首批必须交付 | **已确认**；D2/D3 必须有可信签发、备份元数据及撤权配额方案 |
| U03 | 内测/公众注册 | **待用户，D3 前**；不阻塞 D1 |
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
- **M2**：grant 与 issued code 均触发冻结、发码/授予和套餐修改同序锁；停用不使旧有效码失效。
- **M3**：批次 request_id 幂等、只存哈希、明文只首次响应；重试不恢复。
- **M4**：本人重复兑换判定先于码用尽/过期/撤销；失败计数在业务拒绝正常提交；多用户核销不超量。
- **M5**（D2 交接）：数据库业务拒绝表达与对外 HTTP 状态不冲突，错误 503 不得冒充可信 deny。
- **Aisenlens R2**：首批必须支持，但文件元数据归属与客户端签发属于产品专项；不能将产品备份强行塞入公共权益数据库。

**D1 设计退出判断**：本文件给出了能够起草 DDL、RLS、受保护 RPC 事务与测试的具体输入。**但**这不代表迁移、SQL 运行、Supabase/pgTAP 兼容与并发已经验证；这些是真正开始实现与 D4 验收之前必须关闭的技术风险。若实现时发现某项设计改变已定业务语义，应先回到现有权威和用户审批，而非自动默许。
