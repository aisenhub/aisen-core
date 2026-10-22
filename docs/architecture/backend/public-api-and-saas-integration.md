# 公共 API 与独立 SaaS 接入时序

> 状态：MVP **调用路径、信任边界与异常行为的已确定逻辑架构**，尚未实施。**操作清单、输入输出、状态码与验收的唯一权威**是[API 契约与验收](./api-contract-and-mvp-acceptance.md)；本文不另立操作清单或错误码表。业务状态权威见[成员生命周期](../domains/membership-lifecycle.md)、[权益与兑换码](../domains/billing-and-entitlements.md)。

## 1. 参与方及责任边界

| 参与方 | 责任 | 不得越界 |
| --- | --- | --- |
| 浏览器、桌面与移动客户端 | 通过 Supabase Auth 登录，凭本人 JWT 查询/发起自助操作 | 不保存 service_role、支付/R2 长期秘密；不自称是某 SaaS 的可信后台 |
| 独立 SaaS 可信后端 | 验证用户 JWT、进行业务对象及输入初检、按用户上下文向公共 RPC 请求成员/准入、检查项目/文件权限及执行用量计数 | 不凭 `product_key` 冒充管理员；不持有公共 service_role；不以公共 Pro 代替业务对象授权 |
| AisenCore 公共 PostgreSQL RPC / PostgREST | 在用户 JWT 下验证公共账号限制、产品、成员及权益；以同事务函数维护状态与审计；RLS 约束读取 | 不读取/执行业务资源的属主权限、不让普通客户端改写公共状态 |
| React-admin | 通过 Data Provider + RLS 查询列表，管理 RPC 发起变更 | 不依赖 UI 角色缓存或按钮隐藏作权限控制 |
| 需要秘密的 Edge Functions | Auth Admin 用户查询、未来已核实的支付通知与 R2 临时签名 | 不绕过管理校验，也不拆散原子业务写入 |

**身份与调用方区分**：有效 AisenCore JWT 证明用户身份，不证明调用者就是某产品后端。首版对开放产品接受合法用户直接自助加入的风险；`joined_at` 不代表已由独立 SaaS 验证真实首次业务使用。邀请制、后台服务凭据与机器操作范围等在有具体产品需要时再做，不构造统一机器密钥。

用户、产品、成员、权益、业务资源是分离维度；平台 Admin 身份不授予对各 SaaS 私有项目的天然访问权限。身份和多 SaaS 验签及会话约定见[会话专项](../applications/auth-and-multi-saas-sessions.md)。

## 2. 公共读取与变更调用路径

- **登录与重置密码**：各应用直接用 Supabase Auth SDK；不新建登录、刷新、确认邮件或 SSO 接口。
- **只读**：`get_my_products`、`check_access` 由调用方携带有效用户 JWT 访问公共 RPC；前者查看本人产品概览，后者无副作用地检查指定产品/能力。已认证且可可信计算时，`check_access` 的准入拒绝返回 **HTTP 200 + `allowed=false/reason`**，认证失败为 401、可信计算故障为 503/5xx；不在只读路径隐式加入。管理列表则由 React-admin 复用 Data API 的筛选、排序和分页，依靠管理员 RLS；Auth 用户的邮箱/ID 查找通过只读 Edge Function。
- **状态变更**：`ensure_membership`、`leave_product`、`rejoin_product`、`redeem_code` 和管理函数均是单次受保护 PostgreSQL RPC；函数内按当前状态执行锁定、写入、审计。Edge Function 的多个独立 Supabase SDK 调用不是事务，不能代替此路径。
- **未来消费型功能的安全门槛，而非新增当前接口**：如果产品确实需要按次扣减/容量预留，应由产品可信端计算有效费用/字节数并经受保护事务完成 actor/资源属主/当前权益核验、正数/边界条件、行锁与幂等，不能让浏览器传任意 `cost_amount` 后直接 UPDATE；同请求重复提交不能二次扣费。Aisenlens R2 现有 `ready+reserved` 预留、final 校验与补偿必须遵守该原则。详见 [BaaS/RPC 评审](../../Plans/aisencore-mvp/aisencore-mvp-baas-quota-security-lessons.md)；**不在本轮新增 `consume_quota`、公共积分账本或 Edge AI 代理**。
- **权益与额度**：公共 `check_access` 返回允许性及所需功能/上限，不扣减、预留产品用量；产品对自己的数据拥有计数和执行职责，见[权益专项](../domains/billing-and-entitlements.md#3-mvp-权益逻辑模型)。

## 3. 首次合法接入时序

### 3.1 独立云端 SaaS

1. 用户通过公共 Auth 登录并向 SaaS 后端发起**真实需要登录**的产品操作；仅登录或浏览介绍页面不建成员。
2. SaaS 后端根据具体资源、请求入参进行安全初检（不得借非法资源请求创建成员），并按[会话专项](../applications/auth-and-multi-saas-sessions.md#5-跨产品身份与会话安全)核验用户 JWT。
3. 对符合自动加入条件的**开放产品**，SaaS 后端以**原用户 JWT**调用公共 `ensure_membership(product_key)`。公共 RPC 用 `auth.uid()` 确认身份、检查平台账号限制及当前产品/成员状态；若无记录，原子创建 `active` 并同事务写 `join`，若已 `active` 则幂等返回。
4. SaaS 后端在自己的业务库幂等初始化必要的工作区，再针对受保护操作读取公共 `check_access` 并检查**具体资源权限与用量**。已有 `left` 或 `suspended` 不由普通登录或 ensure 自动恢复。
5. 若公共成员已创建、SaaS 业务库初始化失败，公共成员保持成功；SaaS 下次合法请求可幂等重试业务初始化。**不做跨库分布式事务**。

### 3.2 本地优先与混合产品

1. 离线匿名 Free 功能不使用公共登录、成员、授权服务。
2. 首次真正使用需要账号的 Pro/私有备份等功能时，以 Supabase Auth 登录，客户端凭**本人 JWT**直接调用同一 `ensure_membership` RPC；混合产品的云端路径按 3.1 执行。
3. 客户端在启动时在线校验 Pro、运行中按关键操作合理复核；本地免费内容不因公共服务异常而被无故锁定。具体撤权与离线行为见[本地优先专项](../applications/local-first.md)。

### 3.3 主动兑换与未来支付回调

用户主动提交兑换码调用 `redeem_code`：无成员时可在同一个数据库事务中创建 `active` 与 `join` 事件，`left`/`suspended` 则不消费码。**未来支付 Webhook/补单不是用户主动使用**，只写可信授权来源，不调用 ensure，不恢复成员。精确分支只以[计费权益 §5](../domains/billing-and-entitlements.md#5-授权与产品成员状态的关系唯一权威)为准。

## 4. 准入复核与缓存

- 公共准入的**唯一检查顺序**及业务错误分类见[API 契约 §2、§4](./api-contract-and-mvp-acceptance.md)。`check_access` 不生成成员、不扣减额度、不代表具体资源授权，也不签发跨请求有效的产品许可证。
- 单次 SaaS 可信请求可以复用新鲜的公共授权判断；不可跨多个关键请求长期以客户端展示缓存或嵌入 JWT 的“Pro/成员”声明为权威。SaaS 在数据库写入或资源访问前自行核验其资源所有权与实际用量。
- 已提交的退出、封禁和产品暂停在**下一次可信检查**时被反映；已执行中的长任务按产品确定检查点，先前签发的 R2 预签名 URL 可持续至到期。无法取得可信公共授权时，不为新的云端受保护操作放行，也不将网络故障表述为“被封禁”。
- 结果不明时先读取当前可信记录再安全重试；兑换码、发码批次和管理授权的幂等规则见[API 契约](./api-contract-and-mvp-acceptance.md)，不能因为客户端超时就假定失败。
- **MVP 调用量优化**：Aisenlens 客户端的本地 Free 不发公共 Auth/权益请求；Pro 只在进入/启动及关键操作前按需复核，同一用户产品并发查询去重，**不启动全局固定 15 分钟轮询**。15 分钟仅候选客户端快照新鲜度，并不改变 `check_access` 已确定的 200/401/503 语义、不授权任何需要服务器实时检验的 R2 操作；可评估**另建只读聚合能力快照**减少逐 feature 读，但未批准新的 RPC 名和 JSON 字段，不应绕过 API 权威。参见[详细性能方案](../../Plans/aisencore-mvp/aisencore-mvp-auth-entitlement-mfa-efficiency-design.md)。

## 5. 跨产品隔离与延后事项

- 各 SaaS 以公共不可变 `user_id` 关联自己的项目/文件；业务库可以共用或独立。若业务数据库在**另一个 Supabase Project**，其 RLS 不自动接受 AisenCore JWT；默认由该 SaaS 自己的后端验证公共 JWT，再按自己可信的业务数据库凭据访问并执行资源授权。另一个选择是在 AisenCore Project 内使用独立的产品 Schema，必须验证 Schema 暴露与 RLS 边界。不可把两个项目的 Auth/RLS 当作天然互认。
- 机器调用、邀请审批/私有产品、公共计量账本、跨域无感 SSO、长任务强制即时撤销与自动支付回调，仍在真实需求进入相应阶段时设计；**R2 文件签名已因首发 Aisenlens 的必需私有备份进入 D2 实施设计**（[D2 接入方案](../../Plans/aisencore-mvp/aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)），不代表相关 Edge Function 或 Bucket 已部署。
- 本文描述的是**待实施的架构**，不代表 PostgreSQL 函数、RLS、Edge Function、环境或 SaaS 客户端已经存在。

相关：[API 契约](./api-contract-and-mvp-acceptance.md) · [数据库事务与权限](../database/database-access-and-transactions.md) · [管理员控制台](../applications/admin-console.md) · [统一会话](../applications/auth-and-multi-saas-sessions.md)。
