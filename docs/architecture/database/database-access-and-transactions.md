# 数据库访问隔离、可信写入与事务边界

> 状态：MVP 架构设计结论。采用 Supabase Auth + PostgreSQL Grants/RLS + 可信 Edge Functions + 单库事务；不是已部署的表结构、SQL、迁移或安全策略。实现前需按当时官方文档核验具体 API 与版本。

## 1. 唯一权限判定边界

- **Supabase Auth** 验证“用户是谁”；`user_id` 来自经校验的用户凭据，不能来自客户端任意填写的操作者字段。
- **AisenCore 公共可信服务**负责产品状态、成员状态转换、跨产品访问隔离、公共功能权益和平台管理资格。
- **各 SaaS 可信业务后端**负责具体项目/文件/任务的属主及业务权限；公共 `allowed=true` 不替代产品业务授权。
- **PostgreSQL Grants 与 RLS** 是数据库安全边界而不是成员生命周期引擎；不能用 UI 按钮隐藏或仅在 JWT 中放成员状态替代可信执行时的检查。
- 所有产品共用一套逻辑状态含义，**不**要求所有产品采用同一个数据库或 Supabase Project；远程 SaaS 首版通过公共用户 JWT 与授权 API 接入。

## 2. 最小数据库访问矩阵

| 对象 | 未登录/anon | 普通 authenticated 用户 | 可信公共服务 | 内部 React-admin |
| --- | --- | --- | --- | --- |
| `products` | 仅明确公开的可展示产品资料；非公开状态/管理字段不可泄露 | 按需读取公开/允许展示资料 | 读取全部所需字段；管理员操作受服务端控制 | 通过受保护管理接口查看与修改 |
| `product_memberships` | 禁止 | **仅本人必要记录 SELECT**（如开放 Data API）；不直接 INSERT/UPDATE/DELETE | 按当前规则查询、原子状态变更 | 列表查询、暂停/恢复走可信管理接口 |
| `membership_events` | 禁止 | 默认不直接开放 | 仅可信事务写入、必要审计查询 | 受限审计查看，不直接改写 |
| 管理员身份表/账号限制状态 | 禁止 | 不允许直读完整他人/管理员名单或直写 | 可信检查、限定管理写入 | 仅受保护 API |
| Auth 管理与会员权益 | 禁止直接高权限 | 各自按最小授权查询 | 专门受保护能力负责 | 不依赖前端角色声明 |

可行的 MVP 默认：公开产品信息可用受限 SELECT；成员本人 SELECT 可用 RLS，**所有成员变更由 Edge Functions 执行**。若为了统一响应而把成员读取也包进 Edge Function，底层仍应限制表暴露面；“经 API 读取”不等于必然允许客户端直接访问表。公开字段较少时可通过受限查询/独立投影避免泄露草稿和管理备注。是否使用单独公开视图在实际需要时决定。

## 3. PostgreSQL 与 Supabase 安全约束

1. 可通过 Data API 访问的 Schema 中，逐表开启 RLS，配置最低限度的 `GRANT` 和逐操作 Policy；`GRANT` 与 RLS 是两个不同的校验层，缺一不可。
2. `authenticated` 只说明身份类型，不能自动授权读取全部行。本人读取约束到可信 `auth.uid() = user_id` 等作用域；必要索引优先覆盖 `user_id`、`product_id`。
3. 普通用户不应能直接改写 `user_id`、`product_id`、`status`、`pre_suspend_status`、管理员状态或审计事件；避免通过“改属主”绕过授权。
4. 尽可能保留现有官方 Auth/JWT 校验机制；JWT 中的用户可修改元数据不可作为管理权限依据，过期的权限声明也不能代表当前成员资格。
5. `service_role` / secret key 属于服务器高权限凭据，不放入浏览器、桌面端或一般独立 SaaS 后端。即使可信 Edge Function 使用高权限客户端，**也必须先验证最终用户、管理员资格、目标产品、参数及允许的操作**。
6. 如使用数据库受保护函数，优先最小职责、非公开 Schema、显式 EXECUTE 授权及固定可信调用路径；`SECURITY DEFINER` 有绕过 RLS 风险，不能为了省去策略而普遍启用。视图也要按实际数据库版本核查 RLS/`security_invoker` 行为。

## 4. MVP 的单事务状态转换执行路径

客户端与 SaaS 后端首先通过公共服务验证最终用户/管理员、目标产品及操作条件；真正修改时，在**同一 PostgreSQL 事务**中读取并锁定/条件检查权威状态、更新 `product_memberships`、插入一条 `membership_events`，然后一并提交或回滚。

**成员合法状态转换的业务真相**以[成员生命周期](../domains/membership-lifecycle.md)为准；当前状态与封禁前状态约束、五类事件以及相应事务不变量，以[数据库逻辑约束与最小审计](./database-constraints-and-audit.md)为准。这里重点约束**执行边界**：多个独立 HTTP/Data API 请求不是一个事务；平台管理员权限不能仅凭前端声称；封禁与解封、重复加入、产品暂停与首次加入必须有原子条件及一致的并发先后语义。

独立 SaaS 自身数据库初始化失败不回滚公共成员；由产品业务端幂等重试，不引入跨库分布式事务。

## 5. 安全错误与故障默认

- 认证失败 → 401；无权执行目标操作 → 403；状态转换冲突 → 409；参数无效 → 400；资源不存在或应防枚举 → 404（具体映射在 API 契约中）。
- 公共授权暂时不能可信确认 → 新的云端受保护操作默认不放行，返回“暂时无法验证”，**不**冒充成员被封禁。
- 单次请求内可复用必要授权判断；不跨请求长期信任客户端或 SaaS 本地的 `active` 缓存；重要变更在下一次新授权判断体现。
- 已执行中的业务和预签名 R2 URL 可能存在撤权延迟，按对应业务操作/短期授权约束处理。原本离线免费本地功能不因公共授权服务中断而禁用。

## 6. MVP 不做与落地验收

不构建通用多租户 RBAC、Redis 撤权广播、第二套签名令牌、全表审计触发器链或全量事件溯源。

**实施时必须验证**：anon 不能看到成员；普通用户只能看到自己；普通用户不能直接插入/修改成员、管理员或审计；登录有效但 `left/suspended` 不能通过 API 继续使用；管理员身份不能靠用户可编辑字段伪造；成员状态+审计共同提交/回滚；并发确保唯一且封禁不会被旧请求覆盖。推荐使用 Supabase 当前官方数据库测试、RLS 安全检查手段而非手写全套测试框架。

参见：[数据库约束与最小审计](./database-constraints-and-audit.md)、[公共 API MVP](../backend/public-api-and-saas-integration.md)、[平台管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)。

官方依据：[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Edge Functions 身份验证](https://supabase.com/docs/guides/functions/auth)。