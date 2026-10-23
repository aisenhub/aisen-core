# D2｜公共 API、Supabase Auth 与 Aisenlens/R2 接入实施设计

> **2026-10-23 会员认证边界修订**：AisenCore `check_access(product_key)` 仅认证账号、产品/成员与 Pro 当前资格及授权时段；去除 capability、Free/Pro 功能规则/额度键、plans 功能表和功能版本克隆。现有 DEC-01 自有码双参/防枚举、DEC-05 直授时段/幂等、MFA 安全与 AisenLens 已批准的受限 R2 JSON 备份 Edge 工作流保留；R2 的业务容量/文件策略归 AisenLens 专项模块，不属于通用 Core Pro 功能权限。UI-G0A 仍未批准，RPC 尚未落库。

> **成熟度：D2 文档型实施设计（实施候选）**。以下 SQL 签名、路由、JSON 示例、对象路径和服务器内部状态用于指导下一步实现，**不是已经创建或真实测通的接口**。本文件不得重定义已有业务不变量；冲突时以 [现行唯一 API 逻辑权威](../../architecture/backend/api-contract-and-mvp-acceptance.md)、[业务领域规则](../../architecture/domains/README.md) 与 [D1 物理/事务设计](./aisencore-mvp-d1-database-implementation-design.md) 为准。
>
> **2026-10-22 后续批准合同覆盖**：DEC-01 新兑换双参数/成员先验、DEC-05 强类型请求幂等与双模式直授、DEC-02 Aisenlens 小型白名单 JSON Edge→R2 final 已纳入本设计；公开 INVOKER/private 最小 DEFINER、L0～L8 和 Admin MFA/Auth Admin 继续沿用[F01～F04 当前安全实施约束](./aisencore-f01-f04-security-convergence-design.md)。旧签名与 staging 示例不应再直接施工，SQL/SDK 运行 NOT RUN。
>
> **F05～F08 合同与验证补订（2026-10-22）**：[F05 精确参数/default/NULL/幂等 v1、F06/F07 用户准入与 F08 版本验证手册](./aisencore-f05-f08-contract-compatibility-readiness-design.md) 取代下方任何尚未固定的 PATCH/重试/指纹候选；未执行 SQL、HTTP、SDK 或 R2 测试。
>
> **MVP 低请求量 Auth/Pro/Admin MFA 补订（2026-10-22）**：[独立实施设计](./aisencore-mvp-auth-entitlement-mfa-efficiency-design.md) 对 SDK 调用预算、Pro 按需复核/15 分钟候选、Admin 会话内无重复 MFA 挑战作更具体的**实施约束**。用户已明确把**Admin TOTP MFA 列为 MVP 必需**；不增加普通用户强制 MFA，也不修改既定公共 API 错误语义。
>
> **BaaS/原子计量设计评审（2026-10-22）**：[BAAS-Q01～Q10 安全测试指南](../../development/testing/README.md) 确认 **无需为 MVP 增加 Redis、独立公共 API 服务器、VIP JWT Hook 作为动态授权、通用消费 RPC/余额表或 AI 代理 Edge**。客户端缓存只节流 Pro UI、R2 权威签发/确认/下载继续实时核查；产品 `ready+reserved` 必须在产品元数据事务中可信预留、最终对象核验后结算，重试幂等和 R2/DB 补偿不变。示例 SQL 和“节省 85%”不可当实际验收。
>
> 先行计划：[D2 实施设计](./aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)；已确认 U01 = **Aisenlens，本地优先**，U02 = **首批必须支持 R2 私有文件/配置备份**；U03 公开注册、U05 Admin TOTP MFA 与单人运营已确认，其余具体参数按[用户决议](./aisencore-u03-u11-user-decisions-2026-10-22.md)待定。本轮不执行代码、SQL、API 调用、云配置、部署或 Git 提交。

## 1. 系统边界、请求通道和权威

| 通道 | 何时使用 | 身份与最小权限 | 不允许的做法 |
| --- | --- | --- | --- |
| Supabase Auth SDK | 注册/确认邮箱/密码登录/找回、会话刷新、TOTP | 公共 Auth Project 签发的本人会话 | 不自建第二套用户表、登录/刷新 API |
| 公共 Data API 的 RLS SELECT | 产品公开目录、本人产品成员和授权/兑换记录、管理员已授权列表 | publishable key（项目可公开）+ 本人 JWT；RLS + SELECT 列白名单 | 不直接授予普通客户端受保护表 DML |
| `POST /rest/v1/rpc/<name>` | 本人/管理员受保护状态转换与可信只读准入 | 已验证用户 JWT → `auth.uid()`；每个函数独立校验当前权限；**单次 RPC = 单 PostgreSQL 事务** | 不凭客户端传入 user_id 冒充操作者，不拆成多个 SDK 请求假装原子 |
| Supabase Edge Function | 只读 Auth Admin 用户检索、Aisenlens R2 临时签名和必要的产品备份中介**元数据控制** | JWT 验签 → 当前资格/产品/成员/能力 → R2 / Auth Admin 的最小授权；高权限密钥仅服务端 | 不凭公开 API Key、调用方自报产品 ID、客户端 Pro 缓存直接签名 |
| Aisenlens 本地客户端 | 匿名 Free、需登录的 Pro 校验及用户主动备份/恢复 | 仅保存本机产品数据，必要时持本人 Auth 会话；配置备份字节直传/直读 R2 | 不上传本地视频、完整项目数据、AI 分析结果或 API Key，不将管理员身份默认变成产品文件访问权 |
| Aisenlens 产品持有的备份元数据存储 | 文件属主、对象指针、版本、已用与保留状态 | **可信服务端**按用户/产品隔离，所需状态写入原子化；具体物理数据库位置 D3 定 | 不在 AisenCore 公共 products/memberships/grants 表追加通用文件字段，不使用客户端自报 used bytes |

**固定检查顺序（公共会员资格）**：本人有效 JWT → blocked → 产品 active → 当前产品成员 active → 当前有效 Pro Grant 的时间与撤销状态 → 返回 `allowed/reason/tier/pro_active/period/evaluated_at`。**随后** AisenLens 自己的 Edge/可信业务端验证文件所有权、备份/导出功能策略、实际已用/预留与额度；不再由公共 check_access 传入 capability 或返回 limit。兑换首次建成员和 Admin 直授继续按其专属流程处理。

## 2. 公共 PostgreSQL RPC 的实施候选签名

### 2.1 请求与字段约定

- 对外 schema = `public`，**仅 SECURITY INVOKER** 的 PostgREST RPC 薄外壳；需扩权的真正单事务执行内核及私有资格助手 = **不暴露**的 `private SECURITY DEFINER`。包装层要调用私有内核，调用者实际需要精确的 private USAGE/EXECUTE；**私有内核也必须独立验证 JWT actor、权限、资源属主**，不能假设通过 wrapper 才能调用。详见 [F01 最终候选](./aisencore-f01-f04-security-convergence-design.md#2-f01公开普通权限包装层--非暴露的定点扩权内核)。真实 SQL 名按 snake_case，参数名作为 POST JSON 字段；主要 JSON 输出候选 `jsonb`，不能传任意 JSON。
- 下面列出的 SQL 形参及类型属于**候选签名**，实际 DDL 要先满足 [D1](./aisencore-mvp-d1-database-implementation-design.md) 中的 UUID/FK/行锁/审计约束、默认值和 RPC overloading 限制，形成 OpenAPI/客户端类型后再冻结。
- `product_key` 是稳定产品标识，不是机器身份。只有管理员可以选择目标其他用户的 `target_user_id`；所有普通用户 API 的执行者来自 `auth.uid()`。所有敏感管理函数从当前 JWT `aal='aal2'` 加当前 `platform_admins.active` 且非 blocked 共同判定身份。
- 所有时间为 ISO 8601 UTC 字符串，实体 ID 为 UUID，业务枚举/能力键使用已确认的逻辑语义；JSON 对外只含必要公开状态，不包含哈希/密钥/管理封禁理由/其他用户信息。
- **只读也需分别授权**：不带当前 JWT 的 Data API 表查询仅可读已开放产品的公开列；不提供 `get_all_users` 之类通用公开 RPC。查看本人历史权益/兑换仅靠带 JWT 的 RLS SELECT。

### 2.2 本人可调用的 RPC

| RPC 候选 SQL 签名 | 权限/数据库副作用 | 成功响应的必需字段与边界 |
| --- | --- | --- |
| `get_my_products()` → jsonb | 本人只读，**绝不创建成员** | `products[]`：`product_key,product_status,membership_status,entitlement_summary`；成员历史如 `left` 仍可查看 |
| `admin_check_access()` → jsonb | 仅在完成 `aal2` 后按当前管理员名册及 blocked 校验的受保护**只读**资格 RPC；供 Admin 界面和 Auth Admin Edge 复核使用 | `is_admin:boolean`，不给别人的管理员名单/封禁理由；仅认证+MFA 已满足也不能代替当前数据库名册判定 |
| `check_access(product_key text)` → jsonb | 本人只读、无副作用、不计量 | `allowed,reason,product_status,membership_status,tier,pro_active,current_period_ends_at,effective_ends_at,is_lifetime,evaluated_at`；不返回 Features/Limits、capability 或额度 |
| `ensure_membership(product_key text)` → jsonb | 本人；平台未禁、产品 active，首次无记录原子建 `active` + 一条 `join`；已有 active 无写入 | `product_key,membership_status,created`；left/suspended 不能隐式恢复 |
| `leave_product(product_key text)` → jsonb | 本人；仅 active→left + `leave` 事件；重复退出不得再写事件 | `product_key,membership_status`；不删除备份、授权或本地文件 |
| `rejoin_product(product_key text)` → jsonb | 本人明确动作；仅 left→active + `rejoin`；产品/全局限制另行检查 | `product_key,membership_status`；不允许 suspended 通过此操作解封 |
| `redeem_code(product_key text, code text)` → jsonb | 本人/声明产品 left/suspended 先拒绝、本人限流后查码；码的可信 `product_id/tier=pro/grant_duration_days` 必须和声明产品一致；成功同事务写成员（如 none）、Grant/Redemption/次数，拒绝按已批准优先级及失败计数处理 | 返回 `ok,product_key,tier=pro,starts_at,ends_at,membership_created`；不返回 `plan_key` 或产品功能数据 |

**典型 CheckAccess 真正的可信业务拒绝（HTTP 200）**：

```json
{
  "allowed": false,
  "reason": "MEMBERSHIP_LEFT",
  "product_status": "active",
  "membership_status": "left",
  "evaluated_at": "2026-10-21T00:00:00Z"
}
```

仅作为结构样例，示例时间不代表实际测试；JWT 401 与可信计算故障 503 不得伪造成 `tier=free` 或业务拒绝。公共资格响应绝不返回 `features/limits`、capability、余额或备份配额；额度、归属和用量由 AisenLens 可信业务端管理。

**典型成功兑换（HTTP 200）**：

```json
{
  "ok": true,
  "product_key": "example_product_key",
  "tier": "pro",
  "starts_at": "2026-10-21T00:00:00Z",
  "ends_at": null,
  "membership_created": true
}
```

**典型业务拒绝兑换（HTTP 200）**：

```json
{"ok": false, "code": "REDEEM_CODE_INVALID"}
```

账户 blocked、left/suspended 的失败优先级须按[API 长期错误合同](../../architecture/backend/api-contract-and-mvp-acceptance.md)执行：在声明产品成员被限制时不查码，已兑本人优先于码后续失效仅在成员准入通过后成立。限流由 DB 每用户 15 分钟 10 次失败记账；不得将预期业务拒绝抛为回滚计数的 SQL 例外。

### 2.3 管理 RPC 清单与具体输入

**所有以下操作均要求当前有效管理员 + JWT `aal2`，并在单个受保护 SQL 函数内再次确认。** 下面使用 `target_user_id` 区分管理员指定对象，绝不把它当 actor 身份。每个实际管理行为的状态变更与对应 `admin_audit_log` 或 `membership_events` 同事务提交/回滚。

| 候选 SQL 签名 | 必要动作和结果 |
| --- | --- |
| `admin_create_product(product_key text,name text,description text DEFAULT NULL)` → jsonb | 新产品 `draft`，返回 `product_id,product_key,status` 并审计；不得覆盖已有 key |
| `admin_update_product(product_id uuid,name text,description text)` → jsonb | 仅修改允许的展示属性、写前后精简审计；不改变 `product_key` |
| `admin_set_product_status(product_id uuid,status text,reason text)` → jsonb | `draft/active/suspended` 受控状态；与新 ensure/兑换并发按 D1 产品锁序串行 |
| `admin_suspend_membership(membership_id uuid,reason_code text)` → jsonb | 保存原 active/left，设置 suspended，**只写成员事件**，重复暂停不覆盖原状态 |
| `admin_restore_membership(membership_id uuid,reason_code text)` → jsonb | 按 `pre_suspend_status` 恢复原 active/left 并写事件，不自动恢复 Pro |
| **不提供 admin_upsert_plan** | 30/365/永久是 Pro 发行期限预设，不存在 Pro 功能套餐版本表、Features/Limits 编辑器或相关版本克隆/冻结 RPC |
| `admin_create_codes(product_id uuid,tier text,grant_duration_days integer,config jsonb,quantity integer,request_id uuid)` → jsonb | 仅启用产品的 `tier=pro` 与正授权天数；沿用 M3/F05 actor-scoped request_id、首次强类型输入/NULL 规范、同参重放不返回明文、异参冲突、UNKNOWN 按原请求查旧批次的安全规则；不接受 Free/任何产品功能策略 |
| `admin_revoke_code(code_id uuid,reason text)` → jsonb | 只撤销未来兑换，不追溯 grant；原子审计 |
| `admin_revoke_code_batch(batch_id uuid,reason text)` → jsonb | 候选最小批次撤销入口：对批次码逐行受控撤销、写精简审计；非新业务权限，只支撑明文丢失后的撤销重发 |
| `admin_grant_entitlement(target_user_id uuid,product_id uuid,tier text,mode text,duration_days integer,starts_at timestamptz,ends_at timestamptz,reason text,request_id uuid)` → jsonb | 仅本产品 `tier=pro`；DEC-05 互斥 duration 正天数可信顺延、explicit_window 完整时间或显式永久、同 actor 请求幂等与跨产品隔离；不产生 Free Grant、不修改用户 is_pro |
| `admin_revoke_grant(grant_id uuid,reason text)` → jsonb | 只设置撤销信息并审计，不删除历史 |
| `admin_grant_admin(target_user_id uuid,reason text)` → jsonb | 管理员名册受控授予，审计；引导首个管理员不靠前端公开 API |
| `admin_revoke_admin(target_user_id uuid,reason text)` → jsonb | M1 共用管理员保护事务锁，拒绝使合格管理员清零 |
| `admin_block_account(target_user_id uuid,reason_code text)` → jsonb | 全局 blocked；M1 共用保护锁，不能绕过最后合格管理员；审计 |
| `admin_unblock_account(target_user_id uuid,reason text)` → jsonb | 删除限制行但留下管理审计，成员/权益不自动恢复 |

**Admin UI 与真实 RPC 的模式映射（避免永久授错）**：原型里的 `mode='window'` 和 `mode='lifetime'` 是互斥 **UI 选项标识**，**绝不是服务端另外两个签名**。正式调用时：按天选项 → `mode='duration'`、正整数 `duration_days`、时间窗字段不可混入；指定起止 → `mode='explicit_window'`、必须明确提供完整 `starts_at/ends_at`；永久选项 → 用户勾选二次确认后发送 `mode='explicit_window'`、明确的 `starts_at` 和**显式携带字段** `ends_at:null`，不得遗漏属性、错误地以 `mode='lifetime'` 调用，也不得暗中降成周期授权。授权的可信起止计算/首次语义由 RPC 保存，UI 预览不作为账本权威。

**Pro 到期/撤销投影**：公共 Core 以可信时间读取同产品有效 Pro Grant，最后一份 Pro 失效后只返回 `tier=free/pro_active=false`（表示无有效 Pro），不创建降级事务；仍有其他 Pro 有效则继续 Pro，未来 Pro 不提前生效。受保护在线业务先检查账号/产品/成员，匿名本地 Free 不依赖此接口；具体 Free/Pro 功能策略完全属于 AisenLens。

**设计约束**：这里的 SQL 参数名是客户端生成的**候选接口名**；在 [F05 详规](./aisencore-f05-f08-contract-compatibility-readiness-design.md#2-f05公共-rpc-精确参数和错误幂等语义) 中已把全字段提交、NULL/default、批次及 admin grant 幂等定为**实现候选基线**，不再提供模糊的“可以直接做 PATCH”选项。仍须真实 SQL 编译、PostgREST schema cache/签名、D1 L0～L8 与领域授权时间一致性核验；不得以候选改变历史权益。

**发码 `config` 有效字段（DEC-05 A）**：`grant_duration_days` 缺省/NULL 的永久语义、`max_redemptions` 缺省=1/显式 NULL 无效、`expires_at` 缺省/NULL=无截止及 UTC 微秒精度均由可信服务验证。优先存首次规范强类型字段并以 NULL-safe 等价值比较，只有缺省含义无法从持久字段还原才可保留私有指纹；绝不能仅凭 request_id 判同参；所有非法字段、客户端 hash/created_by 均拒绝。U08 的批量上限待确认。

**发码首次响应与重放**（建议结构，精确 `status` 字段实现时固定）：

```json
{
  "batch_id": "00000000-0000-4000-8000-000000000001",
  "created": true,
  "codes": [
    {"code_id": "00000000-0000-4000-8000-000000000002", "plaintext": "<FIRST_RESPONSE_ONLY>"}
  ]
}
```

```json
{
  "batch_id": "00000000-0000-4000-8000-000000000001",
  "created": false,
  "codes": [],
  "plaintext_available": false
}
```

第二个响应只能读取已存在批次**非秘密元数据**；相同 `request_id` 且配置不同须拒绝 `STATE_CONFLICT`。第一响应若因网络丢失也**不能再取回**明文，操作员只能撤销旧批次并以新 `request_id` 重发；管理日志、DB、导出、Edge Function access logs 不得收录明文内容。示例 `<FIRST_RESPONSE_ONLY>` 是说明性占位符，不表示正式编码格式。

### 2.4 只读 Data API 与 Auth Admin Edge 查询

- `GET /rest/v1/products?select=id,product_key,name,description,status&status=eq.active`：匿名/已认证仅已开放产品安全投影；管理员按当前资格可读全表；**返回的产品列表本身不触发加入**。
- `GET /rest/v1/product_memberships?select=...`、`entitlement_grants`、`redemptions`：只读本人行；管理员读取依靠当次 JWT+RLS；不能把 member status、grant 来源等交由客户端 INSERT/PATCH。
- `redemption_codes` 和 `redemption_code_batches` Admin 列表仅查非秘密列/已核准投影；请求 `select=*` 会试图包含不可读哈希字段，应在 DataProvider 明确 SELECT 列白名单并在 RLS/GRANT 负向测试中确保失败时不泄露任何敏感列。
- Auth 用户主档不进 PostgREST：建议唯一只读 `POST /functions/v1/admin-user-lookup`，请求体 `mode:'by_id'|'list'|'email_exact'`；**先真实验 JWT+ `aal2` → 用原 JWT 调 `admin_check_access` 检查当前名册且非 blocked → 再执行仅服务端 Auth Admin 查询**。即使 SDK 需提前创建高权限 client，也不能在资格成功前发起任何 Auth Admin 请求。只读资格 API 不支持传入任意目标用户 ID，不返回管理员名单/阻断细节；逐次鉴权与撤权窗口见 [F04](./aisencore-f01-f04-security-convergence-design.md#5-f04管理员-totp当前资格与-auth-admin-密钥链)。
- `by_id` 调 `auth.admin.getUserById(id)`；`list` 用 `auth.admin.listUsers({page,perPage})`；`email_exact` 只在严格有界分页里逐页查并服务端比对规范化邮箱，未覆盖全部人时返回 `search_incomplete:true`，不得冒充“查无用户”；成员页少量 UUID 用限制并发 `getUserById` 补邮箱。
- Edge 结果最小投影 `id,email` 与经核准必要状态，不返回用户私有元数据、Auth Tokens、其他无关邮箱列表；`service_role`/secret 只允许函数服务端读取。

## 3. HTTP 状态、SQL 错误、重试与脱敏

### 3.1 三类结果：业务否决、预期可提交失败、真实故障

| 入口 | 正常/业务拒绝 | 鉴权/权限失败 | 技术错误 |
| --- | --- | --- | --- |
| `check_access` | **HTTP 200**，`allowed=true/false` + 稳定 `reason`；可信业务拒绝包含 blocked、产品暂停、left/suspended、缺少能力 | 无效/过期/缺失本人 JWT = **401** | 可信计算不可完成 = **503/5xx**，**不可**返回 `allowed=false` 掩盖故障 |
| `redeem_code` | **HTTP 200**，成功 `ok=true`；预期业务拒绝 `ok=false,code`（包括 RATE_LIMITED）以保留 DB 滚动失败限流；blocked 返回 `ACCOUNT_RESTRICTED` | 未验证 JWT = 401 | PostgreSQL 意外错误整体回滚，5xx |
| 普通受保护写入 RPC | 业务结果按现有稳定码转换 400/403/404/409/429 等，不用 200 包装全部拒绝 | 身份 401；无当前管理员/`aal2` 403 | 事务失败 503/5xx |
| `admin-user-lookup` Edge | 有界分页、精确查，`search_incomplete` 明示未完全覆盖 | 无 JWT 401；资格不够 403 | Auth Admin 不可用 503/5xx，不误报查无此人 |
| Aisenlens 备份 Edge | **由本阶段新增候选产品接口**统一 Problem Details 错误结构与常规 2xx/4xx/5xx；数据和权限按用户/产品校验 | 401/403；不能把缺少配额当作签名通过 | 503/5xx：不发新 R2 URL、不把未完成上传记作已提交 |

**公共稳定业务码**严格复用 [现有逻辑权威 §4](../../architecture/backend/api-contract-and-mvp-acceptance.md#4-错误模型)：`AUTH_REQUIRED`、`ADMIN_REQUIRED`、`ACCOUNT_RESTRICTED`、`PRODUCT_UNAVAILABLE`、`MEMBERSHIP_REQUIRED/LEFT/SUSPENDED`、`ENTITLEMENT_REQUIRED`、`REDEEM_CODE_INVALID`、`REDEEM_ALREADY_USED`、`RESOURCE_FORBIDDEN`、`STATE_CONFLICT`、`INVALID_INPUT`、`RATE_LIMITED`、`SERVICE_UNAVAILABLE`。Aisenlens 文件超额/过期/冲突等可在产品侧使用**独立产品错误码**，不得覆盖这些公共码的含义。

**PostgREST 实现约束**：PostgREST 官方可通过 `RAISE SQLSTATE 'PTxyz'` 或 `PGRST` 特殊 SQLSTATE 映射自定义 HTTP 错误，实际受所部署版本约束。建议 D3/D4 验证的样例为 `RAISE SQLSTATE 'PGRST' USING MESSAGE='<JSON with code/message>', DETAIL='<JSON with status>'`；这会使 SQL 事务回滚，**绝不可用于兑换“必须持久化失败次数”的正常业务拒绝**。未核对运行时前不把候选 SQLSTATE 写成已经工作的稳定协议。API 响应中以独立稳定 `code` 供客户端处理，不把原始 PG 错误信息透传成用户文案。

**Edge 错误示例（候选 JSON）**：

```json
{
  "type": "about:blank",
  "title": "Access denied",
  "status": 403,
  "code": "RESOURCE_FORBIDDEN"
}
```

不在日志记录原始 JWT、密码重置链接、兑换码明文、R2 预签名 URL（URL 带签名，应按 bearer token 保护），也不在错误体泄露对象键、哈希、其他人的账号状态。

### 3.2 幂等、并发、查询恢复规则

| 操作 | 状态恢复与重试约束 |
| --- | --- |
| `ensure_membership` | `UNIQUE(user_id,product_id)` + 原子写事件；active 重复返回 created=false；left/suspended 拒绝隐式复活 |
| `leave_product/rejoin_product` | 同一成员行条件更新且操作人/目标基于当前状态；超时后先 `get_my_products` 或本人表读，再决定是否重复 |
| `redeem_code` | 输入码相同重复提交仅一次 grant；先查本人 `redemptions`（在身份、blocked、限流通过之后），已兑换过优先 `REDEEM_ALREADY_USED`；未知/过期/用尽/撤销对其他人统一失败 |
| `admin_create_codes` | `(created_by,request_id)` + 有效输入 首次持久化规范字段比较；同键参数变化 STATE_CONFLICT，同键相同重放不生成码且永不再回显明文；响应丢失可查非秘密批次，确需明文只允许撤批/新 request_id 重发 |
| `admin_grant_entitlement` | `source_ref=admin:<actor_uuid>:<request_uuid>` + 首次受限元数据比较规范输入和可信计算结果（duration/explicit_window 两模式）；同参返回原 grant，异参冲突，不重复授权/审计；L7 串行化顺延，不把服务时钟变化当不同请求 |
| 用户/管理员撤权 | 当前资格读与状态锁在同一可信 PostgreSQL 函数内；M1 最后管理员统一串行；客户端请求超时后只能查询当前权威状态 |
| 备份开始/确认/删除（产品候选） | 各阶段用 `request_id` 或 upload intent ID 去重；分清已签发、已上传、已**验证并提交**，不能靠收到 PUT 200 就认为用户真实已用配额已落账 |

**请求追踪字段**：公共 HTTP/Edge 可以回显非秘密 `request_id` 或 `trace_id` 协助排错，不允许记录输入兑换码、明文码、Bearer URL 或 refresh token。

## 4. Supabase Auth、JWT、邮件与管理员 MFA 实施设计

### 4.1 用户身份与回调

1. 首版单公共 Auth Project，邮箱+密码；**Confirm Email 开启**、未确认账号没有可用于受保护业务的正式会话；注册、验证、登录、密码重置直接复用 Supabase Auth SDK，不新增 `/login` 或独立 `/refresh` 业务端点。注册或验证成功**不创建** Aisenlens 成员。
2. 邮件确认、密码重置的 `redirectTo` 只允许配置在 Auth allowlist 中的已审核 URL；生产 `Site URL`、发件品牌、SMTP、合法回调清单待 U06；禁止开放重定向和把 Auth code/refresh token 贴到任意第三方页面。
3. **MVP 最小跨设备恢复（B01）**：首版邮箱+密码的 Aisenlens 桌面客户端优先直接通过官方 Auth SDK `signInWithPassword` / `signUp`，**不为密码登录引入 OAuth/deep link/PKCE 回跳框架**。确认邮箱与重置密码邮件指向 Auth allowlist 内受控 **HTTPS 页面**（例如静态 `/auth/confirm`、`/auth/reset-password`）：在手机或其他电脑打开也能完成官方 SDK 支持的确认/密码更新，之后回桌面端重新登录；不以本机 `aisenlens://` 或 `127.0.0.1` 为唯一邮件入口。实际回调域名、模板配置、邮件 token/hash 交换方式随当前 Supabase Auth SDK 实测，不自行手写会话协议。
4. 登录/找回密码只恢复 Auth 身份，不改变 `left` 成员、`suspended` 或全局 `blocked`。错误邮箱提示不得便于枚举账号是否存在；生产发件额度/送达和找回演练在 D3/D4 实测。

**跨产品邮件模板边界（B03 简化）**：共用 Auth Project 意味着共用 Site URL、模板及回调允许名单。首发只配置实际 Aisenlens 使用的合法 HTTPS 回调和中性模板；若模板使用 `RedirectTo`，必须真实检查 Supabase 模板变量/链接组合的 SDK 行为，不能只拼接不可信 `product` 查询参数形成开放跳转。第二个产品到来前不建设动态邮件品牌/路由中心。

### 4.2 JWT 验证、会话和设备安全

- 客户端请求公共 Data API 使用本人的 `Authorization: Bearer <access JWT>` 与公开的 Supabase publishable key；**publishable key 不是登录凭据**。真实 JWT 的校验由 Supabase/网关与所调用的 Auth/数据库组成的可信层承担。
- 独立 SaaS 后端（未来云端产品）必须验证 JWT 签名、允许的算法/`kid`、固定预期 `iss`、`aud`、`sub`（有效 UUID）、`exp/nbf`，轮换 JWKS 不得信任未知 issuer；JWT 公共签名密钥可缓存，但平台产品/成员/管理员状态必须新查可信公共数据库。既有架构已确定优先使用非对称签名；D3 在实际项目验证 key 模式，不能把 HS256 的 shared secret 提供给 SaaS 或桌面端。
- 官方 `auth.getClaims(jwt)` 可验证**Supabase Auth 自己发行的** JWT；项目采用非对称钥时可通过 JWKS 校验，旧式对称钥会走 Auth Server 验证路径。仅解析/解码 JWT、直接使用不可信 `getSession()` 缓存、依赖 `user_metadata`、查看用户显示的 Pro 标记均不能代替验签和实时权限核验。
- access token 短寿命、refresh token 可轮换/一次性使用；桌面端优先系统安全凭据存储/受控本地加密（依实际平台 SDK 验证），避免明文配置文件、运行日志、R2 配置备份或错误报告。多设备可独立登录并刷新，不能共享 refresh token 或跨应用拷贝。
- 本产品登出默认仅清本产品会话，不主动终止其他 SaaS 会话；按 SDK 确认可用的 `signOut({scope:'local'})` 或等效本地作用域，明确全局登出是另一种用户操作。撤销 refresh token 不等于已发 JWT 立刻失效，因此新受保护操作仍查当前 blocked/成员/权益；会话过期先尝试受控刷新，失败要求重登，**不默认放行**。
- 同一账号在另一个 Supabase Project 的业务 RLS 不会天然接受 AisenCore JWT；若 Aisenlens 元数据位于其它 DB/Project，可信产品函数验证公共 JWT 后用本产品自己的后端权限执行属主检查（详见 §6），不能把公共 service_role 交给独立 SaaS 后端。
- **SDK 调用量约束**：本地 `getSession()` 可取得 SDK session 但必要时会刷新，**不是可信服务端验签**；非对称 JWT 的 `getClaims()` 可使用缓存 JWKS，`getUser()` 才会逐调用访问 Auth 服务。不得每次 Pro/按钮/render 独立调用 `getUser()`，不得把刷新 Auth JWT 当作 Pro 权益刷新。客户端将 JWT 随 `check_access` 请求发送，可信数据库一次请求内查询当前权限，不需要前置第二次 Auth API 调用。实际 SDK 版本/AAL 行为仍按 F08 验证。

**Admin 会话降级与紧急撤权（B02 最小修复）**：已有可信 `aal2` 时的其他标签页/路由不能无条件再次 `signInWithPassword` 覆盖会话为 `aal1`；发现 `aal` 降级则暂停受保护操作并走正常 TOTP 验证。JWT 签出后即使 Auth refresh/session 被撤销，旧 Access JWT 仍可能有效直到 `exp`；如需在管理员设备失窃后立即拒绝旧 JWT（尤其最后一名管理员不可自撤权的情况），必须在服务端管理资格检查中提供可执行且经过时间边界测试的失效机制或采取等效受控安全处置，**不能依赖前端登出或单纯删除会话**。不先建自定义会话平台，不未经实测就把 JWT 固定为 15 分钟；实现与 U05 真实运维演练时确定最小有效方案。

### 4.3 管理员 TOTP MFA

1. Supabase Auth 登录 `aal1` 后，内部 Admin 登录页只能引导完成必要的 TOTP 流程，**不能在 `aal1` 调用本来就要求 `aal2` 的管理员资格 RPC 并把拒绝误判为“此人不是管理员”**。有意进入 Admin 的已登录操作者可调用 Supabase Auth 的 `auth.mfa.enroll({factorType:'totp'})`（SDK 精确参数以版本为准）→ `challenge` / `verify` → 刷新/取得 **`aal2` JWT** → **再**调用受保护 `admin_check_access()`，仅服务端核验为合格管理员才能进入管理资源。未在名单中的人即使自行完成 TOTP 也没有管理权限。
2. **每次管理 RLS SELECT 与管理 RPC 都验证**：当前 JWT `aal2` + 当前 `platform_admins.active=true` + 无全局 blocked；不能只靠 React-admin 隐藏菜单、`user_metadata` 或旧缓存。因素被撤销/管理员资格被撤销后下一次服务端检查必须按当前约束拒绝；token assurance 变化时需按 SDK 刷新会话并验证，不能只信 UI。
3. 不建立自研 TOTP/恢复码服务，MFA 设备遗失、管理员初始化和管理员名单保底的**受控运维恢复责任**由 U05/D3 决定；最后合格管理员“数据库人数非零”并不保证本人有可用 MFA 设备。
4. 管理查询 Auth Admin SDK 仍在服务端：Edge 先验 JWT 真伪/`aal2`，再**用该原 JWT** 调 `admin_check_access`，明确通过后才执行 Auth Admin 只读查询；最少字段/限速/分页/无界 exact 邮箱检索拒绝。资格撤销与在途外部查询并非同 DB 事务，**不得承诺绝对即时撤权**；强制负向用例见 [ADM-01～06](./aisencore-f01-f04-security-convergence-design.md#53-必须执行的负向-e2e)。
5. **已纳入 MVP 的低打扰 MFA 验收**：Admin TOTP 首次 enroll/challenge/verify 和取得 `aal2` JWT 是**必做功能**；正常 `aal2` 会话的常规 PostgREST 只读/管理 RPC 不另行调用 Auth MFA 或每次弹验证码，而是经验证 JWT 的 `aal` 声明加当前管理员资格在**该业务请求/事务**内完成授权。认证等级因刷新、会话终止、因子失效降级时应重新引导挑战并 fail closed；真实恢复与多设备登录另需 AUTH-P06～P11。

### 4.4 Edge Function 的当前兼容性审查

当前 Supabase 文档推荐使用 `@supabase/server` 的 `withSupabase({auth:'user'})` 用户模式，通常保留平台 `verify_jwt=true`；但运行的 CLI/Edge 版本、JWT signing key 模式和旧 API key 支持可能影响准确调用。**候选实现**：入口强制 JWT 验签、用户身份在原 JWT 的 RLS 客户端查询，确需 Auth Admin/R2 secret 时再以服务端最小钥访问；在本地/隔离环境验证后冻结导入路径与包版本。
- 不因为调试遇到 401 就将用户端函数设置成公开 `verify_jwt=false`；若部署组合需要关闭网关验证，则必须证明函数内部使用经验证的用户令牌模式且安全覆盖一致，不把无签名校验的 payload 当用户。
- R2 签发 Edge 可能需保存 R2 Access Key/Secret，仅从服务端环境读取且隔离项目/环境；浏览器/桌面客户端不能持有这些凭据。签发前所有用户/产品/成员/权益/文件属主检查都以当前可信状态为准。
- 生产配置中的 CORS origin 白名单是浏览器兼容/降低滥用的辅助手段，**不是**授权控制；原生桌面客户端不由 CORS 代为认证。

## 5. Aisenlens 首发端到端交互

### 5.1 权限与业务路径

**Pro 查询性能实施约束**：首发 Aisenlens 本地 Free 打开和操作不依赖登录/公共 API，已登录 Pro 在启动/首次进入与关键操作时**按需**查询 `check_access`；同账号/产品同时请求以 single-flight 去重、闲置期间不建立固定 15 分钟轮询。**15 分钟只是最新权益快照的待测新鲜度候选**，不得代替云端备份签发、complete 或下载的可信即时检查。UI 可异步渲染权益状态，不得让联网检查阻塞本地 Free 基础软件。按 [专项设计 §3](./aisencore-mvp-auth-entitlement-mfa-efficiency-design.md#3-aisenlens-权益复核事件驱动--短期快照候选) 实施；可选聚合快照**未冻结 API 签名**，必须独立评审，不能假称现有 SQL 已提供。

```text
本机匿名 Free ──> 本地拉片、视频、时间轴、AI Key、Free 设置（不登录、不联网、不建成员）
       │
       └── 用户明确触发需要账号的 Pro 操作 / 私有配置备份
                    │
               公共 Supabase Auth（确认邮箱后登录，取得本人 JWT）
                    │
           public.ensure_membership('aisenlens' 的实际 product_key 待产品注册确认)
                    │
         公共 check_access(product_key)
                ┌───┴──────────────────────┐
      可信准入/有效权益                 业务拒绝/不可验证
                │                        │
       Aisenlens 本地功能判定       保留匿名 Free，明确告知
                │                 left：需本人明确 rejoin
           私有备份请求             suspended：无法自助恢复
                │                 503/断网：新云备份签发拒绝
         受保护 Edge 接收白名单 JSON / 创建唯一 R2 final
                │
           本人恢复时短期 GET、客户端直接下载
       （元数据、实际计量由 Aisenlens 持有）
```

这里 `aisenlens` 只是候选 `product_key` 示例；**U01 确定产品名，不意味着其最终机器标识已经审批**。对于未使用登录服务的匿名本地 Free，不应在启动时一律要求网络；若用户已登录但只打开本地 Free，查询准入不能隐式创建成员。

### 5.2 需要区分的分支

| 情况 | Aisenlens 客户端/可信签发服务应执行的动作 |
| --- | --- |
| 首次有账号的 Pro/主动备份，无产品成员 | 用户 JWT → 合法触发 `ensure_membership` → `check_access` → 对应产品执行真实功能/备份授权 |
| 已 active 但无指定 Pro 能力 | `CheckAccess` 根据 Free/未撤销 grant 给出能力结论；没有能力提示升级；**不能假设所有备份必然仅 Pro 可用**，实际策略 U04 决定 |
| 仅成员 `left` | 普通启动、登录、ensure 不能隐式恢复；明确 rejoin 且通过验证后才能继续新受保护操作 |
| 成员 `suspended` 或全局 blocked | 新 Pro 权威请求/备份签发拒绝；本机已存在的视频/项目不由平台删除，本地原本匿名 Free 不因公共服务故障中断 |
| 产品 suspended | 新受保护业务操作失败；不批量更改历史成员、授权和 R2 备份 |
| 有效 Pro 被撤销/到期 | 下次可信检查时拒绝**新的**受限制操作；对已经运行或离线状态中的流程如何中断由产品策略另定，不承诺即时强制终止本地软件 |
| 联网、JWT 刷新或公共服务故障 | 明确展示“无法验证”而非“被封禁”；**新云端上传/下载和新短期签发 fail closed**；匿名 Free 可离线继续 |
| 本地 UI 仍显示旧 Pro | UI 缓存只用于显示；启动在线确认，关键 Pro 动作合理复核；云端 R2 必须签发当次重新查公共权益 |
| 多设备同时备份 | 本人会话分别验签；服务器产品元数据提供幂等和配额原子预留；冲突及版本选择在产品专项定，不能依赖本地设备时钟 |

**仍需用户确定的真实产品行为**：Aisenlens 哪些本地操作触发再次在线复核、断网后已开始的 Pro 操作是否允许完结/是否保留短暂宽限、多设备配置冲突策略、以及备份功能归属 Free/Pro/具体额度。D2 仅提供安全上限和候选 UX，不把它们写成既定业务规则。

## 6. R2 JSON 私有备份：已批准的 Edge 可信上传候选（DEC-02 A）

**首发限定**：Aisenlens 用户主动选择的非敏感、小体积、字段白名单 JSON 由受保护 Supabase Edge 校验并以服务器受限凭据条件创建 R2 final；**不采用客户端 staging PUT → Worker/CopyObject → complete 旧备选**。普通其它私有大文件仍可按客户端 R2 直传架构另行设计。唯一长期权威为[产品文件架构](../../architecture/database/product-data-and-files.md)。

### 6.1 最小候选 Edge API（名称未部署）

| 候选受保护路由 | 用户输入与最小响应 | 服务端边界 |
| --- | --- | --- |
| `POST /functions/v1/aisenlens-backup-upload` | 本人 JWT、稳定 `request_id` 和有硬性正文上限的 JSON；成功只返回 `backup_id/status/size_bytes/version` | 验本人 JWT/产品/成员/blocked/权益/属主、schema/大小/可信 SHA-256；产品 DB `pending` 原子预留，R2 唯一 final 条件写、DB `ready`/审计；失败对账 |
| `GET /functions/v1/aisenlens-backups` | 本人 JWT + 限量分页；只返回本人的 ready 安全摘要 | 不接受浏览器自定 user_id/object_key，不开放 bucket ListObjects |
| `POST /functions/v1/aisenlens-backup-download` | 本人 JWT + `backup_id`；受限单对象短期 GET | 每次重新检查当前身份/属主/产品/成员/权益/ready，客户端可直读 R2 |
| `POST /functions/v1/aisenlens-backup-delete` | 本人 JWT + `backup_id,request_id` | 原子删除意向、幂等 R2 物理清理/版本回收与故障对账 |
| 可选 `GET /functions/v1/aisenlens-backup-status` | 本人 JWT + 已创建 `request_id` | HTTP 响应丢失时只确认原请求的持久状态，不重写对象 |

### 6.2 元数据、幂等与恢复

Aisenlens 的产品私有元数据需有 `backup_id,owner_user_id,product_id,request_id,status,final_key,reserved_bytes,actual_bytes,sha256,format_version,created_at,ready_at,deleted_at` 等必要字段。不要求首发 JSON 有 `staging_key/source_etag` 或必须的 `verifying` 状态。受保护 DB RPC 只在单数据库事务内更改预留/ready/审计；R2 条件创建后发生数据库/网络故障仍必须以 `request_id`、实际 hash/owner/bytes 可恢复对账；**不得宣称跨 DB/R2 事务原子**。

恢复前版本兼容性检查、按类别展示差异并由用户确认后替换**已按 U10 确认**；字段白名单、字节限额、版本数、留存期限和失败回滚产品细则仍需 U09/U10 真正定值。旧 R2 GET 短凭据未到期前可能继续有效，撤销只能即时阻止新签发。未来实施必须验证 JWT/RLS/HTTP/SDK/条件写、网络断线、重复请求与删除单边失败（见[F03 实测要求](./aisencore-f01-f04-security-convergence-design.md)），目前全为 NOT RUN。

## 7. 追踪测试矩阵与 D1/M1～M5 回归

下表把**设计场景**映射为未来必须实现的验证。测试层次：Auth SDK 模拟/隔离环境、PostgREST/RPC 契约、数据库 pgTAP/双事务并发、Edge Function 负向鉴权、R2 可控隔离桶、Aisenlens 桌面 E2E。**本阶段不把这些测试宣称为通过**。

| 场景组 | 现行验收引用 | D2 验证断言与 D4 执行位置 |
| --- | --- | --- |
| 登录与成员自助 | I-01～I-10、I-23、I-24 | 注册/确认/重置不自动加入；Aisenlens Free 无登录；首次受保护操作才建成员且仅一次；退出/重加/封禁正确；A 产品本地登出不影响 B；Auth 流与 RPC 双向契约 |
| 账号/产品隔离与 RLS | I-11～I-17 | 被封禁/产品暂停后新受保护操作拒绝；越权表写/读及审计删除均拒绝；业务状态与事件同事务；真实非管理员 JWT 负向测试 |
| 公共准入与故障 | I-18～I-22、I-28 | 阻断是 **HTTP 200 + allowed=false/reason**，JWT 错 401，真正故障 503；缓存旧 Pro 不放行 R2 新签发，资源所有者权限仍由产品判断 |
| 管理资格与 M1 | I-25～I-27 | 管理员 `aal1` 及被撤权后的管理读/写均 403；最后管理员自封禁/撤权、双管理员并发互斥不得归零；Auth Admin 封禁不能绕过 DB 检查 |
| 兑换码与 M3/M4 | R-01～R-06、R-10～R-12 | 创建码仅首次响应出现明文，重放无明文；重复使用优先，码不泄漏状态；失败限流 15 分钟/10 次提交成功、未知码统一拒绝；跨产品码隔离 |
| 续期/冻结与 M2 | R-07～R-09、R-13～R-15 | 不重叠续期、永久授权、码撤销不追溯 grant、已有码或 grant 后套餐不可修改、旧有效码在套餐停用后仍可兑换 |
| Aisenlens 私有备份（D2 补充） | I-03/I-04/I-16/I-18～I-21 的产品端延伸 | 未认证/left/suspended/blocked/权益不足无法签发；他人 UUID/Key 不能下载；超配额、并发意向、签名过期、PUT 重放、重复 complete、数据库/R2 跨系统故障、孤儿对象清理；新上传失败不损坏已 ready 备份 |
| 安全供应链与配置 | D2 新的技术验证项 | 当前 SDK/Edge 模式、JWKS 换钥、HS256 回退条件、Cookie/deep link、CORS/secret、签名过期响应；禁用浏览器/桌面 service_role 和任何 R2 长期凭据 |

**必须做的故障注入（实现后）**：RPC 成功 DB 返回前客户端断网；已创建 batch 但首响应丢失；R2 已写入但 complete 超时；公共 CheckAccess 503；产品元数据服务不可用；用户在签发和 PUT 间被封禁；管理员资格在查询和 Auth Admin SDK 调用间撤销（对敏感操作尽量减少检查-使用窗口）。测试需分别判定“新操作 fail-closed”“已发短期 URL 有真实撤权窗口”。

## 8. 外部官方文档核对与真实版本门槛（2026-10-21）

**已检索的资料只证明当前官方文档描述的能力，不等于 AisenCore 已安装、已调用或已部署**：

- [Supabase 更新与 Breaking Changes](https://supabase.com/changelog?types=breaking-change)：2026-09 PostgreSQL minor upgrade 关联 pgcrypto 及运维检查；2026-10 公共 API 的 TLS 旧 cipher 变更需在后续 Windows 客户端 HTTP/TLS 兼容性检查中纳入。实际环境版本尚未取证。
- [Supabase JWT 与 JWKS](https://supabase.com/docs/guides/auth/jwts)、[getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims)：JWT 校验、非对称 JWKS 与 HS256 时回到 Auth server 的区别；真实 signing key 类型/SDK 版本未验证。
- [Supabase Edge Function 用户验证](https://supabase.com/docs/guides/functions/auth)：当前文档的 `auth:'user'`、`verify_jwt`、用户 RLS/服务端高权限区分；Edge Runtime 和第三方依赖需在 D3 锁版本，不能直接复制文档里的伪生产例子。
- [Supabase MFA/TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp)、[会话](https://supabase.com/docs/guides/auth/sessions)、[登出](https://supabase.com/docs/guides/auth/signout)、[重定向白名单](https://supabase.com/docs/guides/auth/redirect-urls)：`aal2`、token 刷新/本地登出、桌面回调许可；品牌/域名仍待用户 U06。
- [Supabase Data API 安全](https://supabase.com/docs/guides/api/securing-your-api)：GRANT 和 RLS 两层，table/function exposed settings 需按真实项目配置核验。
- [PostgREST 官方错误映射](https://docs.postgrest.org/en/v16/references/errors.html)：`PTxyz` 与 `PGRST` 的自定义 SQLSTATE/HTTP；**部署的 PostgREST 是否兼容尚未测试**，写入业务失败是否回滚尤其不能猜测。
- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)、[直接 PUT](https://developers.cloudflare.com/r2/objects/upload-objects/)、[CORS](https://developers.cloudflare.com/r2/buckets/cors/)：当前单对象短期 GET/PUT 预签名和重放风险，服务器持长期凭据；浏览器 CORS 与到期报错限制不等于桌面端授权。

**进入正式实现前需要实测**：Supabase CLI/SDK/Postgres/PostgREST/Edge 版本锁、公开 API 和校验函数、TOTP/邮件回调、Windows 客户端密钥安全存储与 HTTP TLS 支持、R2 的 HEAD/PUT/校验/最大对象、JWT 过期与短期 URL 重放行为、对象元数据的产品端并发计数。没有真实环境和执行授权时，这些全部列为 **not run**，不能标记通过。

## 9. 用户待定决策与 D3 交付

### 9.1 用户明确决定和仍需决定

| ID | 事项 | 本阶段状态 | 最迟不再可延后 |
| --- | --- | --- | --- |
| U01 | **首个产品 Aisenlens，本地优先** | **已确认** | 不再询问 |
| U02 | **Aisenlens 首批 R2 文件/配置备份必须支持** | **已确认** | 不再询问 |
| U03 | 公众开放注册目标 | **已确认方向；未获生产部署批准** | 公众发布前完成邮件/隐私/反滥用实测 |
| U04 | AisenLens 自己的 Free/Pro 具体功能、备份单位/容量和本地限制 | **属于产品实施，不是 AisenCore 会员功能配置待办**；AisenLens 根据可信 Pro 资格决定和强制执行，公共 API 无 capability/limit |
| U05 | 初始管理员人选/第二管理员与受控 MFA 恢复责任 | **待用户** | D3 初始化前 |
| U06 | 生产域名、邮件品牌、SMTP 与回调清单 | **待用户** | D3 域名/邮件配置前 |
| U07 | 人工注销、备份保留/删除、通知时限 | **待用户** | 真实对外开放前 |
| U08 | 发码分发责任人与单批规模 | **待用户** | D3 发码 Admin 设计前 |
| **U09（本阶段识别）** | Aisenlens **实际纳入 R2 的设置与模板字段白名单**，是否有额外可备份的非敏感配置 | **待用户明确具体范围**；现行禁止上传视频/AI 结果/项目/Key 不可变 | 客户端备份序列化与 R2 签名实际实现前 |
| **U10（本阶段识别）** | 多设备/版本恢复时采用**覆盖或合并**，冲突及版本数/保留窗口 | **待用户**；建议首次实现采用需用户确认的明确恢复动作，禁止静默覆盖，**非已批准** | Aisenlens 恢复 UI/业务实现前 |
| **U11（本阶段识别）** | Pro 运行中复核点、断网后已开始操作、跨设备的实际体验 | **待用户**；建议关键收费操作复核、新云端备份一律在线；实际 UX/宽限期不由 D2 确定 | 客户端权限执行实现前 |

**U09～U11 是 D2 发现的真实产品行为待确认条目**，仅在实施设计台账新增，**不是已经由用户批准**；若未来确需改变正式 spec 的产品需求，先获得用户确认再同步需求权威。签名 TTL、内部 key 格式、元数据 SQL 选址与小型技术版本优先由实施团队在 D3 提供可验证方案，不转嫁为用户必须逐项选型。

### 9.2 给 D3 的输入

1. Admin 的 Resource/Provider 需严格使用 §2 的读取列与管理 RPC 签名候选；首次明文一次性复制/下载，不可“重新导出”；管理员用户查询只读 Edge，强制真实 `aal2`。
2. 环境需隔离开发/测试/生产的 Supabase Auth、Edge Functions、Cloudflare Pages/R2；选定真实 JWT 签名方式与密钥管理、SMTP/redirect、Windows deep link handler、Secret/CORS/HTTPS/TLS；所有密钥最小权限。
3. Aisenlens 备份产品元数据落点必须明确并起草自己的最小 schema / 事务：owner、intent、reservation、ready 对象、实际 quota、删除/孤儿清理；首批 R2 的真实 Bucket、范围与支持的 GET/PUT/HEAD 需在隔离环境验证。
4. D4 需要完成 §7 的用户/管理员/本地优先/R2 授权与并发用例，结合此前 43 项逻辑场景；所有外部服务验证运行后才可标为通过。
5. **D3 启动仍必须先建 D3 详细计划**，按该计划执行并在结束时再次复查 spec、五类 architecture、development、Plans/总索引，用户政策缺失时保持 BLOCKED 或标注上线前条件，不能自行确定业务数字。

## 10. 本阶段设计退出结论

**D2 文档设计的核心流程已有候选完整覆盖**：逐 RPC 输入输出与身份、业务结果/异常映射、Auth/TOTP/JWT、Aisenlens 本地 Free/Pro 在线路径、首批 R2 私有备份的可信签发、元数据/配额与可补偿的上传确认和下载恢复。**还不是实施/集成验收通过**，因为真实 PostgREST 函数、Supabase 项目、Edge、R2、Windows 客户端、邮件与 pgTAP 全未运行。U03～U11 中所有“待用户”的事项在实施对应产品体验或环境前必须关口确认，不得把候选值当用户已批准。
