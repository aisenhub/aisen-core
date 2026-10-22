# F01～F04｜安全设计收敛定稿（实施候选，待真实验证）

> **状态：DESIGN RESOLVED / RUNTIME NOT VERIFIED**。本文件保留有效的安全设计；完成的阶段执行清单按 Plans 规则删除。本文件给 D1、D2、D3 的后续实际代码/迁移提供**优先遵循的安全实施约束**；不替换 [现行需求](../spec/requirements.md)与[逻辑 API/43 项验收](../architecture/backend/api-contract-and-mvp-acceptance.md)，不表示任何数据库函数、Edge、R2 或 MFA 已运行。
>
> **2026-10-22 追加用户决定**：Admin **TOTP MFA 明确纳入 MVP**。原 F04 `aal1→TOTP→aal2→管理员资格` 安全链不改变；性能/体验补充以[低请求量 Auth/Pro/Admin 专项](./aisencore-mvp-auth-entitlement-mfa-efficiency-design.md)为准：有效 `aal2` 会话的普通 Data API/管理 RPC **不会另起 MFA challenge/verify 网络请求**，后台从当前经验证 JWT + 资格表在原业务请求内鉴权，Auth Admin Edge 保留服务器资格检查。
>
> **外部 `SECURITY DEFINER` 示例安全反例（2026-10-22）**：禁止把未验证费用正数/actor/属主/EXECUTE 的消费函数直接建于 exposed `public`；一个负 `cost_amount` 可被扣除而令余额变大。F01 最小权限和 F02 全入口锁序、F03 R2 跨系统补偿、F04 当前管理员资格原则均不因“少一次 RPC”而放宽，详见[BAAS 原子配额安全清单](./aisencore-mvp-baas-quota-security-lessons.md)。
>
> 四项关联：[D4 F01～F04 风险](./aisencore-mvp-d4-test-and-readiness-review.md#61-静态交叉评审发现的问题与风险台账)；D1 [物理/RLS/事务候选](./aisencore-mvp-d1-database-implementation-design.md)、D2 [接口/Auth/R2](./aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)、D3 [管理端与基础设施](./aisencore-mvp-d3-admin-infrastructure-design.md)。
>
> **范围固定**：U01 Aisenlens 本地优先、U02 首批 R2 私有文件/配置备份必需；U03～U11 仍待用户决定。保留 M1～M5 业务语义，尤其重复兑换优先级、管理保底、套餐冻结、兑换失败限流与 CheckAccess 200/401/503。

## 1. 最终设计决议概览

| 风险 | 设计层收敛决议 | 运行验收前状态 |
| --- | --- | --- |
| **F01** | 对外 `public` RPC 一律以 **SECURITY INVOKER** 最薄包装；真正需扩权的单事务业务函数放 **`private` 不暴露 schema** 且最小 `SECURITY DEFINER` 所有者；所有被授权执行的私有内核本身再验证身份与操作权限 | **设计收敛；未验证** NOLOGIN owner/GRANT/RLS/PostgREST |
| **F02** | 固定全局 Admin 写锁 → 目标账号门禁锁 → 用户限流 → 产品 → 套餐 → 成员 → 码 → 授权续期 → 写入/审计，按实际对象子集取得，绝不逆序；兑换特殊分支明确 | **设计收敛；未验证** pg 两连接竞态/死锁/时段 |
| **F03** | **用户只得 staging PUT 短 URL**，永久 final 对象只由可信产品服务复制/确认写入，ready 记录始终指向从未暴露过客户端 PUT 的 final key；源 ETag 条件复制与最终内容校验 | **设计收敛；未验证** R2 CopyObject 条件/重放/Worker |
| **F04** | `aal1` 只做官方 TOTP enroll/verify，取得被验证的 `aal2` JWT → `admin_check_access` 当前名册资格；Edge 持原用户 JWT 复核后才使用 Auth Admin 服务端秘密 | **设计收敛；未验证** SDK/JWT/资格撤销与 Auth Admin E2E |

**“设计收敛”不能替代 D4 最终全量 READY**；F05～F08、U03～U11 仍按原评审台账保留，亦无实际测试结果。

## 2. F01｜公开普通权限包装层 + 非暴露的定点扩权内核

### 2.1 对外可调用层与内部角色

```text
浏览器/Aisenlens/SaaS 带本人 JWT
   → Supabase 网关/ PostgREST（先验证签名，附 auth.uid()/auth.jwt() 上下文）
   → public.<rpc>(...) SECURITY INVOKER，公开但必须显式 EXECUTE 白名单
   → private.<rpc_core>(...) SECURITY DEFINER，非 exposed schemas
       ├─ 再从可信 auth.uid()/auth.jwt() 取 actor，不接受请求 user_id 冒充
       ├─ 本人受保护操作：blocked/产品/成员/权益验证
       ├─ 管理操作：当前 aal2、platform_admins.active、无 blocked
       └─ 获取事务锁、状态变更 + 审计，一起提交或回滚
```

**执行权限决定（必须在 DDL migration 同事务实现）**：

| 角色/Schema | `public` invoker RPC | `private` definer 核心 | 表/管理员数据 |
| --- | --- | --- | --- |
| `anon` | 不授任何受保护业务 RPC EXECUTE（公开产品目录只读表安全投影） | 无 `USAGE`/EXECUTE | 仅 active 产品的安全列 |
| `authenticated` | 仅相关本人和受保护管理 RPC 的签名**显式授 EXECUTE**；管理资格在内核再检查 | 为了 invoker 外壳**确实能够调用内核**，授 `private` schema **USAGE** 和每个被允许的定点内核函数的 **EXECUTE**；**不授 CREATE，不暴露 private 于 PostgREST** | 只读表仍依 D1 RLS + 列级 GRANT；不授业务表 DML |
| `private` 内核 owner | 不经客户端访问，不是可登录用户 | 推荐受控 `NOLOGIN` + 仅定点表权限的最小执行者，不能默认使用迁移 `postgres`/全局 `BYPASSRLS` | 必须在隔离库证明其 DML 能运行且 RLS/所有者继承不会扩大查询范围 |
| migration/运维角色 | 仅经审批的版本化部署 | 在创建/变更函数的同一迁移内设置 owner、撤权、授白名单 | 与浏览器可用 role 完全分离 |

**容易误解的 PostgreSQL 事实**：`public SECURITY INVOKER` **不会**代替 `authenticated` 获得调用 `private SECURITY DEFINER` 的权限，故必须明确授予后者 `USAGE + EXECUTE`。这意味着拥有直接 SQL 连接与相应 `authenticated` 角色的调用者理论上**可以直接执行获准的 private 内核**，因此安全性**不能依靠“只有 wrapper 会调用”**。每个私有内核须独立执行全部 JWT/操作资格、对象属主与输入校验；网络层不暴露 private 只减少 PostgREST 攻击面，不能代替函数内授权。普通客户端绝不可持有数据库角色密码或连接凭据。

### 2.2 最小可审查安全契约

- `public` wrapper **不具扩权**，不得接受可信的 `actor_user_id`、`is_admin`、`service_role` 等参数；只进行类型收敛/最小输入白名单，逐一委托对应 `private` 内核；**同一 SQL RPC 调用保持一个 PostgreSQL 事务**，不能 wrapper 内通过 Edge 或多 HTTP 请求串联状态+审计。
- `private` definer 函数 **`SET search_path = ''`**，完全限定 `public`、`auth`、`private` 及扩展函数名称，禁止动态 SQL/可变外部 callback/用户传入对象名；真实可执行角色应是经过权限矩阵核验的 scoped owner。
- 各函数默认 `EXECUTE` **先撤销 PUBLIC**（注意数据库角色 `PUBLIC` 是所有人继承的权限）并撤掉不必要的 `anon/authenticated` 历史显式 GRANT，再按**精确函数签名**重新授；同迁移核对 `ALTER DEFAULT PRIVILEGES` 在实际函数创建者身份下是否生效，防止后续函数回到 PUBLIC EXECUTE；`public` 的客户端角色绝不授 CREATE。
- RLS 中的 `private.is_platform_admin()` 无 `target_user_id` 参数，只取已验证会话与当前表状态；它的 `EXECUTE` 供限定 RLS policy 调用，结果仅布尔，不可任意查别人资格。不要依赖 JWT 用户可编辑 `user_metadata`，不把 `aal2` 当永久管理员资格。
- `check_access` 的私有查询仍需保证 **可信业务拒绝 200 allowed=false**，JWT 无效=401、可信查询失败=503/5xx；`redeem_code` 的预期失败必须正常返回 `ok=false`，防止通过异常回滚滚动失败次数。
- 未来 DDL 的清单断言：`pg_proc.prosecdef` 对 exposed wrapper = false；`private` 不在 PostgREST exposed schemas；所有内核 function owner、`EXECUTE` 授权、真实 role/BYPASSRLS 标志与列级 GRANT/Policy 逐个比对；anon、用户 A/B、admin aal1、admin aal2、已撤管理员、被 blocked 管理员都要跑真实 SQL/HTTP 负向测试。

### 2.3 授权边界的限制

PostgREST 识别 JWT 的具体网关配置与 Supabase SDK/CLI 版本必须实际核查；SQL 中任何有权设置请求上下文 GUC 的**高权限 DB 会话**都不等同真实 Auth JWT；生产不能把 SQL 连接权/密码给普通客户。函数所有者可能绕开 RLS，必须在 definer 函数**显式**检查每个实际被操作 `user_id/product_id/plan_id` 的资格与关联一致性。封禁/管理员资格在**每次新事务**重新核实；已在执行中的事务与外部请求不能承诺无时差的全球瞬时撤销。

## 3. F02｜唯一事务锁总序与逐操作锁矩阵

### 3.1 先约定锁级别，不再由各函数自行选择顺序

| 级别 | 作用域/锁模式 | 何时取得、为什么 |
| --- | --- | --- |
| **L0** | **全平台 Admin 写入口**事务级 advisory mutex（固定、唯一、私有 namespace） | **每一项管理写 RPC**（不只是改管理员资格）先取得 L0，再重新检查当前管理员 `aal2`+资格；确保 admin 撤权与 admin 已认证写入串行、M1 共用入口 |
| **L1** | **目标账号**事务级 advisory lock（对 `auth.uid()` 或管理目标 `target_user_id`），名字空间与 L0、L7 不交叉 | 任何会改变/要求未 blocked 的本人敏感 RPC、所有影响目标账户的管理写入和 Block/Unblock；锁后重新查 blocked。不存在 restriction 行时也有锁，不依赖 SELECT FOR UPDATE 锁“缺失行” |
| **L2** | **本人核销限流行** `redemption_rate_limits` 插入唯一安全创建后 FOR UPDATE | 仅 `redeem_code`，先修剪滚动 15 分钟时间戳，达到阈值不继续锁产品/码；未知/不可兑失败记录需正常提交 |
| **L3** | 目标 `products` 行：要求 active 的请求 `FOR SHARE`、改变状态/套餐跨版本一致性 `FOR UPDATE` | 按 UUID 升序锁多产品，确保产品状态与本事务操作串行；若函数不需要产品状态，可以不取此层，但**之后不得反向补锁 L3** |
| **L4** | 目标 `plans` 行：发行/直接授予 `FOR SHARE`，修改已存在权益字段 `FOR UPDATE` | `plans.is_active` 对**旧发行码兑现不重新施加新发行限制**；在冻结设计不变量下码兑现只读已经冻结的方案 |
| **L5** | **已存在**的 `product_memberships` 行 `FOR UPDATE`；**不存在的成员不在此提前写入** | 对状态变更及合法核销先读取/锁住当前状态，严格区分 left/suspended；核销中确认可兑后，首次 INSERT 才进入 L8 写入阶段 |
| **L6** | `redemption_codes` 行 `FOR UPDATE`；多码按固定 UUID 升序 | 核销先从码哈希定位其产品/码 ID（**不先取行锁**），经 L3/L4/L5 后再锁码并重新核实资格；必须先查本人是否已有 redemptions，再判断已用尽/到期/撤销 |
| **L7** | `user_id + plan_id` 的事务级 advisory lock、已有 grant（必要时）按稳定顺序 | 所有直接授权/同套餐续期都按此锁序计算最新有效期限；多个 grant 以稳定 ID 顺序加锁，不能先锁 grant 再补 L6 |
| **L8** | 同事务写码次数/成员/授权/审计和唯一约束；必要时幂等批次/来源键的唯一冲突序列化 | 不再取得更低级别对象锁；`admin_audit_log` 或成员事件失败，整笔技术事务回滚；业务拒绝按既定契约提交限流失败窗口 |

**准则**：只获取需要的级别，但绝不先 L6 后 L3 或先 L7 后 L5。每级的**多个对象**先按稳定 UUID 顺序排序。碰到 PostgreSQL FK/唯一键/索引引入的**隐含锁**、升级锁及级别嵌套时，真实双连接竞争测试必须证明无循环；超时/死锁当作技术失败整体回滚，采取有界重试，**不**以部分写结果冒充业务拒绝。

**L5/L6 关键处理**：之前 D1 的候选 `redeem_code` 写“锁码，再找成员”，现在统一修订为 **先锁产品与已存在的成员，再锁码**。要避免用户猜未知码就被自动入会：允许先读取成员当前状态并取得已有成员行锁，但**实际首次成员 INSERT + join event 应在码最终核验为可兑之后，作为 L8 写入阶段发生**；如果不存在成员行则在已持产品锁的前提下暂不 INSERT。此时新增的成员唯一键/隐含 FK 锁可能出现在 L6 之后，必须由**所有同用户入会/管理路径统一 L1** 的锁承诺消除可见循环，并用双连接测试审查隐含锁；如果真实数据库证明仍有循环，应调整实现策略，**不能宣称这一设计已实测无死锁**。成功才能生成 grant、redemption、码计数，任何技术失败全部回滚。

### 3.2 RPC 获取锁矩阵（空格=不需，使用 “—”）

| 受控操作 | L0 Admin | L1 账号 | L2 限流 | L3 产品 | L4 套餐 | L5 成员 | L6 码 | L7 续期 | 必须复核的结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ensure_membership / rejoin_product` | — | 本人 | — | SHARE | — | UPDATE/唯一键 | — | — | blocked/active/left/suspended 不得隐式恢复 |
| `leave_product` | — | 本人 | — | — | — | UPDATE | — | — | 退出不撤销 grant/R2 |
| `redeem_code` | — | 本人 | UPDATE | SHARE | 只读冻结 plan | 已有成员 UPDATE；无成员时暂不写 | UPDATE | user-plan | M4 已用优先、失败只计限流；成功时 L8 创建缺失成员并写 grant→redemption→次数 |
| `admin_create_codes` | 全局 | — | — | SHARE | SHARE | — | 新增批次/码 | — | 仅 active plan 新发；M3 request_id 重放无明文 |
| `admin_upsert_plan` | 全局 | — | — | UPDATE | UPDATE/新版本 | — | — | — | 已引用权益不可改，其他计划键类型一致 |
| `admin_grant_entitlement` | 全局 | 目标用户 | — | SHARE | SHARE | — | — | user-plan | 新授予不能入会，时段与 source_ref 幂等 |
| `admin_revoke_grant` | 全局 | 目标用户 | — | — | — | — | — | 视需要 | 只标撤销和审计，不删除历史 |
| `admin_suspend / restore_membership` | 全局 | 目标用户 | — | — | — | UPDATE | — | — | pre_suspend_status 精确恢复，事件同提交 |
| `admin_revoke_code / batch` | 全局 | — | — | SHARE | — | — | UPDATE（多码按 ID） | — | 只阻未来兑，批量撤销审计原子 |
| `admin_set_product_status` | 全局 | — | — | UPDATE | — | — | — | — | 产品暂停不更新成员/授权历史 |
| `admin_block / unblock_account` | 全局 | 目标用户 | — | — | — | — | — | — | 资格 L0 保底、账号 L1 使新受保护写线性化 |
| `admin_grant / revoke_admin` | 全局 | 目标用户 | — | — | — | — | — | — | M1 修改后有效管理员数量非零 |
| `check_access / get_my_products / admin_check_access` | — | — | — | **一致性只读** | **一致性只读** | **一致性只读** | — | — | 无副作用；当次权威数据库读，不承诺锁住整个外部操作 |

**获取目标 ID 的前提**：先用**非锁定只读**查询由 `code_hash/membership_id/grant_id/batch_id` 识别目标产品/用户，不能因此授权或信任该瞬时状态；按矩阵取得所需 L1/L3…后**重新读取并锁定目标行、核实 ID/属主/产品与状态未变化**。若发生对象迁移/目标不匹配，安全拒绝或有界重试。不要在取得 L5/L6/L7 后才发现需要补锁另一个更低级别的对象。涉及跨用户批次按用户 UUID 排序取 L1；多数批次只锁码不锁用户。

### 3.3 状态、幂等与跨系统线性化

- **管理员写入一律 L0**，在锁内重新验证 actor 当前 `aal2` 和 `active && !blocked`，从而 M1 最后管理员不会与其他 admin 写入交叉破坏授权。管理员本人的被 block/revoke 持 L0；若目标同时为当前操作者，照样在修改后核对 M1 非零。
- **账号状态**：`block`/ `unblock` 持 L0+目标 L1；全部用户受保护数据库写入及目标授权也持同一 L1，故**数据库新写**与封禁具有提交串行顺序；但 **不表示**不持 L1 的只读 `CheckAccess` 或跨系统 R2 预签 URL 可被瞬间撤销。
- **M2**：新发码/直授在 L3 产品 SHARE→L4 计划 SHARE 后核查 `is_active`；修改权益需 L3 产品 UPDATE→L4 plan UPDATE，再检查包括已撤销码在内的历史引用。锁的冲突保证先后次序，不能先出码再允许旧 plan 权益变化。
- **M4**：`redeem_code` 在 L1、L2、L3/成员可用性读取并锁码后，**先查用户+该码的历史兑换**。对已经兑过的合法用户返回 `REDEEM_ALREADY_USED`（即使当前码用尽/失效），不计本次失败；对新用户统一不透露过期/耗尽/撤销差异。用户是否 blocked 和已经 RATE_LIMITED 的分支优先于这次重复查询。注意若成员后续被暂停/退出，重复兑换的优先级与已定业务身份限制的交集必须按 API 权威执行；此处不批准暂停成员绕过准入。
- **失败限流**：不论未知码、已存在码但业务拒绝等合规失败，都在同事务中更新 `redemption_rate_limits` 再**正常返回** `ok=false`；不要在失败前创建成员或 grant，也不要抛 SQL 异常回滚计数。真正 DB 异常/审计故障整体回滚，响应 5xx。
- **周期续期**：在 user-plan L7 锁内读取最新**未撤销**同套餐 grant 的未来末端，计算下一时段；永久授权不叠加假的周期。不同码同用户同 plan 并发依靠 L1/L7 排序。
- **管理读、R2 签发**：数据库 read RPC 不取这套写锁，得到的是当前语句/事务一致性判断；R2 签发跨 Edge→数据库→R2 并非同事务，封禁可能在查权后与出 URL 前发生，新 URL 的最短 TTL 和额外提交前复核只能缩短窗口、不能声称真正原子撤销。

### 3.4 必须真实执行的并发及故障用例

| ID | 两连接/故障注入排程 | 不得出现的结果 |
| --- | --- | --- |
| `LCK-01` | A/B admin 同时互封禁、撤权、一方再授管理资格 | 资格总数清零或审计与资格不同事务（M1/I-27） |
| `LCK-02` | 修改 plan 功能与新发码/直接授予对撞 | 先发码后仍改变冻结功能（M2/R-14） |
| `LCK-03` | 同一用户两张同 plan 码同时兑，另附 `admin_grant_entitlement` | grant 时间区间重叠、来源重复或循环等待（R-13） |
| `LCK-04` | A/B 争同一码最后一次、A 同码再次提交、revoke_code 同时执行 | 超量、重复 grant 或已用用户被误判为其他新用户（R-04/R-05） |
| `LCK-05` | block_account 与用户 ensure/rejoin/redeem、管理员对目标直接 grant 并行 | block 已按锁序提交后仍新发 grant/成员；被 block 的账户在下一事务获得受保护权益 |
| `LCK-06` | 码未知/失效、限流时间窗口临界、业务拒绝、写审计故障 | 失败次数回滚或失败后留下成员/grant/码计数副作用（R-06/R-11/I-15） |
| `LCK-07` | 多码批次撤销与多个 redeem、产品暂停并行，设置短事务等待超时 | 循环死锁或部分撤销/审计提交；若发生真实 deadlock 需定位隐式 FK 锁并修总序 |

## 4. F03｜R2 备份对象不可被旧 PUT 重放改写

### 4.1 以 staging/final **双键**作为确认后的不可变边界

```text
Aisenlens 用户主动选择允许字段 → JWT/本人与产品权益
   → Edge: 写 Aisenlens 自有备份元数据 pending / quota reservation
   → 仅签短期 PUT 到 staging/<user>/<intent_uuid>/<random>（私有、不可列举）
   → 客户端直传 R2 staging（期间即使签名被重复使用，也只能覆写 staging）
   → backup-complete: 产品元数据 pending → verifying（幂等锁）
      ├─ R2 staging HEAD 得到 ETag/真实 size
      ├─ 可信产品验证层执行受条件约束的 CopyObject staging → unique final key
      ├─ 可信层验证**final 实际内容**、允许配置 schema/大小/digest
      ├─ 原子提交备份元数据 final_key + actual_bytes + checksum + ready / quota
      └─ 失败则 failed/pending + 安全清理或补偿；final 即便存在也不对外列出
   → 本人下载请求再次经授权，只签单个 final GET
   → 旧 staging PUT URL 重放只影响 staging，永远不改 ready final
```

**信任边界**：最终 R2 key 由服务端不可预测地生成、每次备份独占、数据库 `UNIQUE(final_key)`，**永远不给任何客户端发 final PUT URL**；服务端需要为 final 创建时避免已存在同 key 被覆盖的条件写/先占用原子策略并在隔离 R2 兼容性环境证明。R2 当前 S3 API 列出 `CopyObject` 和 `x-amz-copy-source-if-match` 支持；以 HEAD ETag 为源条件复制候选，防 staging 在检查与复制之间被替换，失败应退回验证/重试状态。**ETag 不是通用内容安全/密码学 SHA-256 校验的替代品**；源复制和 final 内容校验/版本绑定必须一起完成。

**字节传输边界**：**Aisenlens 客户端仍直接 PUT/GET R2，不经公共 PostgreSQL/PostgREST/Edge 转发**。要验证 final 文件内容白名单，推荐由**可信 R2 产品验证组件**（例如经评审的 Cloudflare Worker + R2 访问权限）内部读取/解析/有条件复制，Edge 只负责本人/权限/元数据控制与可信调用签发；它是 Aisenlens 自有的窄范围备份验证，不成为 AisenCore 通用文件业务服务。该组件及 Worker/SDK 的实际能力、最小权限与资源成本尚需 D3 实施前做独立安全评估；如果使用其它服务端校验途径，也必须维持“客户端文件字节不经公共 Supabase”的既有边界。

### 4.2 完整的状态/异常序列

| 元数据状态 | 进入和唯一动作 | 出错恢复 |
| --- | --- | --- |
| `pending` | L1 用户身份/产品权益已确认，原子保留 ready+reserved 限额，生成随机 staging/final keys；同 `request_id` 幂等 | PUT 未发生/URL 过期清理 staging 并释放 reservation；不显示列表 |
| `verifying` | `backup-complete` 抢到本人 intent 行的单独锁，禁止两个 complete 双计费；用实际 size/ETag 条件 CopyObject 再验 final 内容 | R2/DB 失败保持非 ready 或标 failed；若 final 物理已有且元数据未提交，异步对账/清理该“孤儿 final”；不自动复制两次覆盖 |
| `ready` | 数据库仅存唯一 final key/可信 content digest/版本/实际 bytes；最终对象不再允许客户端 PUT | 重复 complete 只返回既有 ready 非秘密数据；签发 GET 时仍校验本人及当前权益 |
| `failed/deleting/deleted` | 幂等撤销 intent 或用户删备份、可信服务端删对象并结算额度 | R2 对象与元数据状态不一致时定期 reconciliation；对象实际删除失败应重试/告警而非声称已彻底清除 |

**配额**：事务下按 **committed ready + reserved pending/verifying** 占用量结算，`expected_bytes` 只能用于预留的**上限约束**，确认后以真实 final 大小结算；PUT 超预计与配额则不 ready，可靠释放/隔离 staging/final；跨用户跨产品不能共用占用行。实际配额数字/单位/容量单位 U04 未定，不在 F03 决议中发明。

**字段白名单**：U09 决定哪些非敏感配置/拉片模板允许备份。客户端本地序列化白名单 + 服务端对 final 内容的结构字段验证缺一不可；**HEAD 仅能验证 size/ETag 等元数据，绝不能证明内容无 API Key/私人文本**。可信验证器应拒绝意外字段、错误格式/版本和明显秘密字段，不能不实保证用户自由文本绝不可能包含秘密；视频、完整项目/时间轴、AI 结果和 API Key 默认不允许备份的架构边界不变。

**撤权时间窗**：被 block/left/权益过期后拒绝**新签名和新的服务器 complete**；已发 staging PUT URL 到期前仍可能 PUT，故绝对不能通过 staging 存储公开资料，也不能将其当最终文件；已经发出的 final GET URL 在过期前也可能继续访问。需要在产品/技术验证后选短 TTL，不能声明即时撤销历史 URL。

### 4.3 隔离 R2 必须验收的测试

- **R2-01**：同一 staging URL 在未过期时重复 PUT A→B，已 ready final 的 SHA-256/内容始终为提交版本；重复 complete 不重新结算。
- **R2-02**：HEAD 后、条件 CopyObject 前重写 staging，源条件必须失败或实际复制版本再经 final 完整校验；不能把与已校验来源不同的 final 标 ready。
- **R2-03**：final key 已存在/同时两个 complete，对象不能被覆盖；必须拒绝并清理或产生新唯一 key，不能无声改变旧 ready。
- **R2-04**：欠配额/超预计大小/错误 schema/包含禁止字段，不能提交 ready，释放额度并对账清理。
- **R2-05**：用户被 blocked 后仍能使用未到期 staging PUT URL，但无法完成 ready 或新签发；过期后 URL 失效；final GET 的旧 URL 残余 TTL 真实记录。
- **R2-06**：Copy 成功但 DB 写失败、DB ready 成功但清理 staging 失败，对账最终消除孤儿而不丢失 ready 对象。恢复/版本政策 U10 待定。

## 5. F04｜管理员 TOTP、当前资格与 Auth Admin 密钥链

### 5.1 严格区分认证阶段与管理员授权

| 阶段 | 允许的动作 | 必须拒绝 |
| --- | --- | --- |
| `aal1` 邮箱密码登录 | 官方 SDK TOTP factor enroll/challenge/verify；本机基本 Auth 会话处理 | 调用管理员 Data API 受限表或管理 RPC、提前显示管理员名单；**不要在 aal1 调管理员资格 RPC 后把 403 误解为“不是管理员”** |
| TOTP 验证成功 | 从可信 Supabase Auth 获得并确认**新的 `aal2` JWT**（含有效时间、issuer、audience）；旧 `aal1` token 不得继续使用 | 仅因前端设置 `aal2` 字符串就进入管理 |
| `public.admin_check_access()` | `SECURITY INVOKER` wrapper → 内核从同一个 JWT 查询真实 `platform_admins.active && !blocked` + `aal2`，返回极简 `is_admin:boolean` 或不泄露的稳定拒绝 | 有任意 user_id 的资格探针；返回管理员名单、封禁详情、原始 JWT 或秘密 |
| 管理端受保护 Resource | 表的 RLS + 列级 GRANT、每一写 RPC 的内核**每次重新校验** | 以 React-admin `canAccess` 缓存、`user_metadata` 或过期 JWT 中的管理员声明做授权 |
| `admin-user-lookup` Edge | 验真实 JWT → 确认 `aal2` → **使用该原 JWT** 查 `admin_check_access()` 最新数据库资格 → 再启用只在服务端的 Auth Admin 凭据 → 只读目标查询 | 在验证前创建高权客户端查用户；服务端用 `service_role` 替换来客 JWT 进行资格检查；任意邮箱扫描/无界返回 |

**验签不只是“读 JWT payload”**：使用所选 Supabase 官方验证机制（JWKS 非对称优先或与 Auth Server 的受信回退）验证签名、允许算法、预期 `iss/aud/sub/exp`、`aal2`，不要把 publishable key、`X-User-Id`、User Metadata 当作管理员授权。当前资格只在服务端 DB 查，`is_admin=false` 对所有不具管理员资格者不泄露具体内部原因；函数调用是否为 HTTP 403/200 false 按 D2 外部错误语义保持一致，**这里推荐不泄露的 boolean 只读结果，不重新解释 CheckAccess 的 200/401/503**。

### 5.2 Auth Admin Edge 的可信执行序列

1. 先做方法/Content-Type/分页与 `by_id/list/email_exact` 输入上限检查、无密码/Token 日志；未登录以 401。
2. 在函数内以正式签名校验本人 JWT、`aal2`；使用 caller 的 **原始 Authorization Bearer** 初始化只读 PostgREST 客户端，调用 `admin_check_access` 的**当前数据库资格**，失败/超时 **403 或 503 fail closed**。
3. 仅当资格明确为 true，才在服务器范围访问 `auth.admin.getUserById` 或分页 `listUsers`。高权限 secret 不入浏览器和 Aisenlens、不得随请求 header 透传出去；若 SDK 需要初始化 Admin client 早于此步骤，也**严禁在资格通过前执行任何有权 Auth Admin 请求**。
4. `by_id` 仅有效 UUID；`list` 严格 page/perPage 上限；`email_exact` 严格时间/总页数上限，规范化匹配且未覆盖的结果标 `search_incomplete=true`，不能把“扫不到”误报不存在；频率与账号枚举监控由服务端限制。
5. 白名单结果 `id,email`（其他必要字段只有经产品审查后允许）；出错不回显 Supabase Auth Admin 原始错误、metadata 或 secret。**只读接口不得实现禁用账户**，尤其不能绕过 M1 的最后管理员保底。

**资格撤销竞态**：每次新 Edge 请求重新查 admin；在检查后到 Auth Admin 读取之间**仍有不可完全消除的 TOCTOU 窗口**，该读取没有与 Postgres 管理保底共事务。对只读 PII 最小化、短请求/结果不缓存、必要时返回前复核与审计可以缩窄窗口，但**不能宣称原子即时撤权**。账户封禁或撤权之后新进入的请求必须被拒；在途请求的时间窗由真实 E2E 测试量化。初始管理员/备用与恢复 U05 未批准，不能视为已完成。

### 5.3 必须执行的负向 E2E

| ID | 试验 | 预期 |
| --- | --- | --- |
| `ADM-01` | 无 JWT、错误签名、过期、伪 `aal2`、错误 issuer/aud | 401；任何高权限 Auth 请求 **0 次** |
| `ADM-02` | 有效 `aal1` 且在管理员名册 | 无受保护读/写/用户查询，允许完成 TOTP 引导 |
| `ADM-03` | 有效 `aal2` 但不在名册、active=false、blocked=true | 403 或不泄露 false；Auth Admin 请求 0，不能枚举别人的邮箱 |
| `ADM-04` | `aal2` 管理员在登录后被 revoke/block，仍拿旧 JWT | 下一次管理 RLS/RPC 与 Edge 请求拒绝，不依赖 JWT 原有 cached claim |
| `ADM-05` | 两名 admin 并发修改权限、一个 Auth Admin 只读查询在途 | L0/M1 保底；新请求拒绝，真实在途窗口记录且不误称完全原子 |
| `ADM-06` | 邮箱查找超出分页上限、速率攻击、Auth Admin 服务暂时不可用 | `search_incomplete` 或有界稳定拒绝/503；不泄露用户名单或把故障当没有用户 |

## 6. 与 D1～D4 的变更落点及实施前关口

| 下游 | 必须同步的设计 | 测试/上线前仍需证明 |
| --- | --- | --- |
| D1 | `public invoker/private definer`、`authenticated` 对私有内核最小 USAGE/EXECUTE、definer owner/RLS、L0～L8 锁矩阵与 M1/M2/M4 | SQL 可编译、pgTAP、GRANT/真实 JWT、两事务死锁与行重验 |
| D2 | 原 RPC 对外名字与业务 JSON/HTTP 不变；Auth Admin 与 `admin_check_access` 用新调用链；R2 staging→final 不可复写 | PostgREST SQLSTATE 200/401/503、Edge 验签、R2 条件 Copy 与最终校验 |
| D3 | React-admin 原 Resource/一次性明文/Provider 流程不改；MFA gate、Edge 执行先后、R2 窄产品验证组件/CI secret 分级对齐 | SDK 版本、AAL 刷新、密钥与构建扫描、Worker/Edge 兼容和对象权限 |
| D4 | 只将 F01～F04 标为**DESIGN RESOLVED / RUNTIME NOT VERIFIED**，补上 LCK/R2/ADM 用例，原 43+12 项仍 NOT RUN；F05～F08 不变 | 用户明确的开发/测试授权后实际补证，P0 运行关口未解除 |

**不得将设计收敛误写为“全量正式开发就绪 READY”**：本轮未连接实际 DB/R2，不知道最终 PostgREST/SDK/CLI 版本和 Supabase 角色能否按此运行；F05～F08 的字段/业务/环境风险以及 U03～U11 仍待处理。工程骨架的潜在有条件准备不代表已获编码授权。

## 7. 官方参考与实际限制（2026-10-22 资料复核）

- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)：`SECURITY INVOKER/DEFINER` 与空 search_path，默认函数 `PUBLIC EXECUTE`、ALTER DEFAULT PRIVILEGES 的作用域、definer owner 可绕过 RLS；**真实部署权限须实际查询与验证**。
- [Supabase Securing Edge Functions](https://supabase.com/docs/guides/functions/auth)：须按实际 SDK/项目 signing key 模式选择真实用户验证方式，不得把可公开 API Key 当用户 JWT。
- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)：同一预签名 URL 在 TTL 内可重复使用，必须分离 staging 和 final。
- [Cloudflare R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)：目前列有 `CopyObject`、`x-amz-copy-source-if-match`、`HeadObject`/条件操作，**实际 Edge/Worker 使用的 SDK/环境/对象大小限制仍须隔离桶验证**。
- [PostgreSQL Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)：仅事务级锁自动随事务结束释放；命名空间/hash 碰撞只影响串行，不可用于授权判断。

**当前实际证据仅是设计文本与静态 Markdown/工作区检查**。没有编写代码/SQL，没有执行 pgTAP、真实 JWT、双事务、Supabase Auth Admin 或 R2 CopyObject，没有创建环境、部署或提交。
