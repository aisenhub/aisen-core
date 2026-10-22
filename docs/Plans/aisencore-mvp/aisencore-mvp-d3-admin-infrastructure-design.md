# D3｜React-admin 与 Supabase/Cloudflare 基础设施实施设计

> **D3 已批准方案覆盖（DEC-01～06 A）**：成员邮箱安全批量查询优先真实隔离测试证明的受限 SQL RPC，失败可直接改用已批准 Edge 单请求批量聚合；Admin React-admin 产品/套餐标准 create/update 继续走安全单次 RPC，Free 版本切换/两模式直授/发码为显式安全命令；Aisenlens 小 JSON 备份由受保护 Edge 校验并条件创建 R2 final，**不再按旧阶段 staging/Worker/通用直传 JSON 施工**。Admin **G0A 高保真四类基准+用户实际签收仍 BLOCKED**，通过后才可按单独开发许可进入 G0B 最小 React-admin 原型，再实现页面、运行 G3。D3 旧声明均以[现行 Admin 架构](../../architecture/applications/admin-console.md)、[主架构](../../architecture/current-main-architecture.md)和[UI-G0](../../architecture/applications/admin-ui-design-system.md)覆盖；部署、代码、测试 NOT RUN。

> **状态：设计候选，未开发、未安装、未配置、未部署。** 本文为 D3 保留的实施设计，完成的执行清单已删除；业务唯一权威为[现行需求](../../spec/requirements.md)，逻辑规则看 [Admin 架构](../../architecture/applications/admin-console.md)、[D1 数据与安全设计](./aisencore-mvp-d1-database-implementation-design.md)、[D2 API/Auth/R2 设计](./aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)。U01 Aisenlens 本地优先、U02 首批 R2 备份、U03 公众注册、U05 单人运营与 Admin TOTP MFA 已确认，其余具体参数依[当前用户决议](./aisencore-u03-u11-user-decisions-2026-10-22.md)待确认。
>
> **F01～F04 安全收敛修订（2026-10-22）**：实施时按 [F01～F04 安全收敛方案](./aisencore-f01-f04-security-convergence-design.md) 使用 public `SECURITY INVOKER` / private `SECURITY DEFINER` 最小内核、统一 L0～L8 锁序、暂存/最终 R2 双键，以及 Auth Admin 先原 JWT+`aal2`+当前资格再高权限读取。本 D3 页面、资源及部署说明不代表真实实现已经通过验证。
>
> **F05～F08 后续补订（2026-10-22）**：Admin RPC 表单/Provider 的默认值、NULL、同键重放、授予来源与环境/SDK 检查，以 [F05～F08 合同与验证准备](./aisencore-f05-f08-contract-compatibility-readiness-design.md) 为准；**U03 公众注册及 U04～U11 部分方向已确认，剩余子项待定**，实际代码/联调未执行。
>
> **MVP MFA/性能新增决定（2026-10-22）**：用户明确把 **Admin TOTP MFA 纳入首版必须交付**，但要求有效管理会话期间**不逐次输入 TOTP、也不为普通管理查询额外串行发送 MFA/Auth HTTP 请求**。按 [低请求量 Auth/Pro/Admin 实施设计](./aisencore-mvp-auth-entitlement-mfa-efficiency-design.md) 调整 Provider，并将 AUTH-P01～P12 纳入 D4/F08 真实验收。U05 备用恢复实际身份仍未落实，其他政策具体值仍待批准。
>
> **BaaS 成本与部署边界补订（2026-10-22）**：按 [BAAS-Q01～Q10 安全测试指南](../../development/testing/README.md) 保持 **Cloudflare Pages 静态 Admin + Supabase Auth/PostgREST/RLS/受保护 RPC + 极少量必要 Edge + 直连私有 R2**，MVP 不额外部署 Redis、独立 Node/API 服务器或为用户自带 API Key 的 AI 模型服务搭公共代理。Supabase Data API 标称 Unlimited Requests **不是免费无限 DB CPU/带宽/Edge**；D3 监控须分别量测 Auth/DB/Edge/R2 与配对恢复。真实配额以当前服务计划为准。
>
> **新增 D3-UI 详细页面阶段（2026-10-22）**：本 D3 的 Resource/Provider/认证/基础设施属于**技术实施设计**，不是页面线框与视觉规范完成的证明。用户已要求补入独立 [D3-UI 实施设计](./aisencore-mvp-d3-ui-admin-uiux-design.md)与[逐页面 UI/UX 实施设计](./aisencore-mvp-d3-ui-admin-uiux-design.md)：工作台/运营页面导航、宽窄屏线框、发码明文仅一次、TOTP MFA、全字段套餐与受保护操作，以及 D3-UI-X01～X18 **待执行**验收。**未创建实际 Admin 工程、原型或线上管理后台**。
>
> **UI-G0 强制视觉基线关口（2026-10-22 最新用户决定）**：按 [Admin 全局 UI 规范](../../architecture/applications/admin-ui-design-system.md)，先统一 MUI 字体/字号/间距/组件与布局，并准备**四类可见高保真参考 + 多宽度变体 + 用户明确视觉批准记录**，只有 `UI-G0A APPROVED` 后才能启动正式 `apps/admin` Theme/Layout/页面编码。**当前只是规范候选，UI-G0A = BLOCKED**；D3 Resource/Provider 映射与 D3-UI 文字线框不能替代这个门槛。不为本次 UI 方案增加任何服务器或绕过 `aal2`/RPC 安全逻辑。

## 1. 前置事实、范围及推荐架构

目前代码库只有文档与辅助资料，根目录没有 `package.json`、`src`、`apps` 或 `supabase`。D1 的 12 张关系表和管理 RPC、D2 的 Auth/Edge/R2 端点均仅为**待实现设计**；因此 Admin 目前没有可调用的真实后端，所有 UI/配置规格只能作为实施输入，**不能**视为联调成功。

**推荐拓扑（候选）**：`apps/admin` React + TypeScript + React-admin/Vite，构建后在 Cloudflare Pages 托管**仅静态资源**；浏览器持 publishable key + 本人 JWT，读 Supabase PostgREST 安全列（RLS + GRANT），变更只调用受保护的 PostgreSQL RPC；Auth Admin 用户只读查找用 Edge Function，浏览器绝不持 service_role；Aisenlens R2 备份需另一个可信 Edge/产品层处理 JWT + 会员检查 + 产品属主/配额，再签发短期 R2 GET/PUT，客户端直传直读，文件字节不经过公共 PostgreSQL。

不引入另一个通用后台服务器、UI/表单状态框架、通用文件中心、BaaS 管理直写端点或通用机器身份。**ra-supabase 是否复用需在安装前检验当前 API 和版本**；若不能遵守列级 GRANT/特定 RPC，只实现 React-admin 标准 Data Provider 的最薄适配层，不自造管理框架。

## 2. React-admin 资源、字段与操作矩阵

| 最小导航/Resource 候选 | 列表/详情读字段与筛选 | 管理动作、目标与高风险处理 |
| --- | --- | --- |
| `products` | `id,product_key,name,description,status,created_at,updated_at`；按状态/键过滤，时间排序、分页 | 创建 `admin_create_product`，修改 `admin_update_product`，发布/暂停 `admin_set_product_status`；状态确认说明暂停不清除历史授权 |
| `users`（虚拟只读） | `id,email` + 必要身份状态，UUID 或严格有界邮箱查；`admin-user-lookup` Edge 分页 | 用户不经 PostgREST 直接编辑；全局限制应由独立高危管理动作 RPC，并要求当前管理员资格与 reason |
| `product_memberships` | `id,user_id,product_id,status,pre_suspend_status,joined_at`；产品/状态过滤 | `admin_suspend_membership`/`admin_restore_membership`；显示来自 left 的恢复仍为 left，不能用 UI 修改 `pre_suspend_status` |
| `membership_events` | `id,membership_id,action,actor_type,actor_user_id,created_at`；以成员 ID 过滤 | 只读，不提供编辑/删除 |
| `plans` | `id,product_id,plan_key,name,features,limits,default_duration_days,is_active`；按产品筛选 | `admin_upsert_plan` 候选；grant 或任何已发行码引用后冻结权益字段，修改权益创建新版本；停用不得撤销旧码 |
| `entitlement_grants` | `id,user_id,product_id,plan_id,source_type,starts_at,ends_at,revoked_at`；按产品/用户 | `admin_grant_entitlement`（显式用户、套餐、期限、reason、request_id），`admin_revoke_grant`；不自动建成员 |
| `redemption_code_batches` | `id,product_id,plan_id,quantity,max_redemptions,expires_at,created_at`；按产品/批次 | `admin_create_codes` 首次成功仅在**易失页面状态**展示明文；`admin_revoke_code_batch`；超时不确定先读非秘密批次元数据 |
| `redemption_codes` | 仅 `id,batch_id,product_id,plan_id,redeemed_count,max_redemptions,expires_at,revoked_at` 等白名单列 | `admin_revoke_code`；**绝不选择 `code_hash` 或提供明文导出/再次显示** |
| `redemptions` | `id,code_id,user_id,grant_id,created_at` | 只读，必要关联 grant/用户前再次判当前资格 |
| `platform_admins`/`platform_account_restrictions` | 授权管理员所需最小字段；单独受限页面，不向普通用户公开 | `admin_grant_admin`/`admin_revoke_admin`/`admin_block_account`/`admin_unblock_account`；管理员人数保底只能由 M1 DB 事务保障 |
| `admin_audit_log` | `id,actor_user_id,action,target_type,target_id,created_at` 和经脱敏白名单的 before/after | 只读，审计记录不可编辑或导出秘密；用 target_type/target_id 分页 |

**列表机制**：React-admin 的 `getList` 将 page/perPage、sort、filter 映射到 PostgREST `range`、`order`、白名单过滤；必须以服务器响应的 `Content-Range` / `count: exact` 得到 `total`（大表改 `planned` 需清楚说明近似，不可伪报精确）。`getOne` 基于 RLS 安全列 + id，读不到返回明确未授权/不可见，而非推断对象不存在。`getMany` 用 `in` 有界批次和白名单列；`getManyReference` 只允许已批准外键及范围过滤。UUID 始终是 React-admin record `id`。对空态、加载态、分页越界、被撤销权限和跨页数据变更都要有清晰状态。

**表单**：使用 React-admin/MUI 与 React Hook Form 原生组件，创建产品需标识/名称，套餐功能键/额度遵守 D1 JSON 规则。**F05 对 `admin_upsert_plan` 固定全字段提交**：更新只更名/停用也携带原 features/limits/plan_key，不允许把遗漏字段静默变为 NULL/空 JSON；客户端显示既有引用的冻结事实，服务端仍独立锁内校验。发码 `config.max_redemptions` 缺省=1 但显式 null 必须作为错误；其他字段按 F05 v1，不能以前端字符串对象序列化替代服务端有效指纹。危险动作二次确认明确目标、reason、范围，不用 UI 代替授权；不将 JWT、码明文、R2 URL 写入持久存储/监控。

## 3. Provider / RPC / MFA 具体映射

| 层/行为 | 设计接口和职责 | 必须拒绝的行为 |
| --- | --- | --- |
| `authProvider.login` | Supabase Auth 邮箱密码登录；完成确认邮件时按 SDK 处理会话 | 登录成功就视为管理员 |
| MFA gate（**MVP 必须实现**） | `aal1` 仅可引导 TOTP enroll/challenge/verify；取得**新且已验证的 `aal2` JWT** 后调用**一次初始** `admin_check_access()` 查当前名册和 blocked。会话等级降级/新登录时重新必要挑战，日常操作不弹 TOTP | 在 `aal1` 调管理资源；每次页面跳转/业务按钮重复启动 MFA challenge/verify |
| `authProvider.checkAuth` / `canAccess` | 首次可信 `aal2` 后使用已确认的短期**UI 非权威**资格（例如 30～60 秒仅待测），普通路由/按钮不反复远程 `admin_check_access`；登出、账号切换、`aal` 降级、401/403 立即失效；**后端每次业务 API 在自身 RLS/RPC 中重验当前资格** | 导航每次独立 `getUser()` + MFA API + `admin_check_access` 串行；或以 UI 缓存替代可信授权 |
| `authProvider.logout` | 复用 Supabase Auth signOut，明确本地与全局会话作用域，失败清理 UI | 从前端直接撤销全部用户 token 或服务端管理员资格 |
| `dataProvider.getList/getOne` | 一次主要 HTTP 请求读取 JWT+RLS 安全白名单列；已验证 JWT 的 `aal2` 与当前管理员资格在**该 Data API 请求内**核查；虚拟用户 Resource 才委托只读 Edge | `select=*` 读取 `redemption_codes` 哈希、查询 `auth.users`、管理 DML；普通每次列表读额外远程 MFA/getUser/admin_check_access |
| 管理 `rpcAdapter.execute(operation,payload)` | 显式映射 D2 的**单个受保护业务 RPC**：在同一事务内核验 JWT `aal2`/admin 资格/blocked、事务锁/审计；发码/直授首次提交前产生 UUID `request_id`，重试保持 UUID+输入，异常先查状态 | 每次写前串行另发认证/MFA RPC、任意 Data API PATCH/DELETE、网络重试换 UUID |
| 用户检索 Edge | `admin-user-lookup`：**先验真实 JWT 与 `aal2` → 使用原 JWT 查当前 `admin_check_access` → 通过后才执行服务端 Auth Admin 只读查询**；UUID/分页/有界 exact email、结果最小化 | 在资格通过前执行 service_role/Auth Admin 查询；浏览器含 secret；把超限查询声称“不存在” |
| 非常规错误 | 401 进入登录/令牌刷新；403 MFA/资格拒绝；409 刷新当前实体；429 显示等待时间；503 服务不可用而非 blocked；超时不确定先读状态 | 捕获异常后 optimistic success、无条件重试发码或授予 |

**写调用接口并非任意 CRUD**：只支持显式管理 RPC 白名单，未列的通用 CRUD 必须显式拒绝，**不自动写表**。Provider 以 F05 的字段三态、全字段 upsert、响应幂等结果和错误码建立候选 TypeScript 合同；页面实际操作位置、文本线框、错误与高风险确认见 [D3-UI](./aisencore-mvp-d3-ui-admin-uiux-design.md)。SQL/PostgREST 签名与 schema cache 尚需 V01/V02/V04 在隔离环境实测。

**MFA 与免费额度验收**：普通已登录 Admin 从列表、详情、分页到受保护写入**原则上每个操作只有一项主要业务 HTTP 请求**，该请求内部权限 SQL 不等于额外的 Auth/MFA 网络往返；JWT 到期刷新与只读 Auth Admin Edge 需要的服务端复核属于例外。实测收集 Auth `getUser`、MFA challenge/verify、`admin_check_access`、Data API/Edge 次数，以及 P50/P95、RLS SQL 成本。注册因素、后续 challenge、会话刷新后的 `aal2`、新设备/失设备恢复与撤权均为首版真实验收条件，不能只是一个 UI gate 原型。

### 3.1 首次发码明文页面（M3）

管理用户选择产品、套餐、有效配置、批次数量并确认后生成**一次** `request_id`；如果只是**网络重试同一逻辑操作**，必须**保留该 UUID**，只有明确撤销旧批且新建新的发行操作才生成新 UUID。调用 `admin_create_codes` 成功且 `created=true` 时，仅在当前 React component 内存展示 `plaintext`，提供用户主动触发的一次性复制/下载，告知离开此页无法再次获取；页面卸载/导航/登出后清空，不入缓存、路由、localStorage、IndexedDB、日志、错误监控、截屏分析或下载历史服务端。首次响应丢失，**同 request_id 重放只能确认非秘密批次信息，绝不能取回明文**；管理员可撤销旧批并用**新** request_id 重发。D3 UI 不得提供历史明文查询/重新导出。

### 3.2 管理安全特殊场景（M1/M2/M4/M5）

- **M1** 最后合格管理员：Admin 界面只是请求确认；`admin_revoke_admin` 与 `admin_block_account` 在 DB 使用同一锁，409 / `STATE_CONFLICT` 必须显示，刷新列表不重复提交。
- **M2** 已发行码或 grant 引用后的套餐权益冻结：展示不可编辑字段或提示新建版本，不能靠前端禁用替代服务端校验；停用套餐不作废旧有效码。
- **M4** 用户兑换“本人已兑”优先于码过期/撤销/用尽，由后端负责；Admin 不推断兑换结果、次数与最后状态。
- **M5** `check_access` 的可信业务拒绝是 HTTP 200 `allowed=false`；401/503 不是同一个拒绝原因。云端备份签发必须对无法验证一律拒绝**新签名**，不伪造 blocked 事实。

## 4. 环境隔离、组件拓扑与密钥

### 4.1 环境矩阵（目标方案，未实际创建）

| 环境 | Supabase 项目范围 | Pages | R2 | 外部用户与数据 |
| --- | --- | --- | --- | --- |
| `dev` | 独立 Auth、PostgreSQL、PostgREST、RPC、Edge；人工/测试账号 | Dev 预览构建 | 独立 dev 桶/权限 | 仅假用户和合成备份；不得有生产数据 |
| `test/staging` | 与生产结构同版本的隔离项目，测试 MFA/限流/并发 | 受限 preview/staging | 独立测试桶 | 测试邮箱、模拟/隔离真实签名 |
| `prod` | 独立受控正式项目，生产数据和审计 | 正式 Pages 站点 | 私有正式桶 | 真实用户，启用邮件、域名、备份与恢复策略后才开放 |

**没有真实项目 ID、账号、域名、Bucket 名或服务端密钥**；这都是 D3 的目标布局。对于开发规模小且成本敏感的变体，可先本地环境 + 受控 staging，再按公开上线门槛升级，但**不可把测试数据与真实用户混库、共桶或复用高权限密钥**。正式三环境是否马上全部创建，受 U03 及实际成本/发布安排影响，用户决定前仅保留隔离目标。

### 4.2 配置与密钥准入矩阵

| 参数/秘密类别 | 运行位置 | 保护/授权要求 |
| --- | --- | --- |
| `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` | Admin 静态产物（**公开**） | 必须指向对应环境；publishable key 并非 user JWT，不能替代 RLS |
| Supabase 用户 access/refresh token | 用户 Auth SDK 会话 | 不在源码/日志/浏览器调试平台上传；需 MFA 检查与真实 JWT |
| Supabase `service_role` 或 secret key | 限定 Edge Function/必要部署后台 | 绝不写 Vite `VITE_*`、前端、Aisenlens 客户端；最小权限、权限使用日志与轮换 |
| R2 access key/secret、bucket 权限 | **仅可信 Edge/产品服务** | Aisenlens 小 JSON 条件创建唯一 final、恢复签单对象短期 GET；普通文件直传例外另行限制短 PUT；dev/test/prod 密钥分离，客户端不得得到 R2 长期 secret |
| DB migration 凭据、管理员初始化秘密 | CI 或受控人工运维秘密库 | 只在发布/引导步骤按需注入，不能与普通 Admin 登录身份共用 |
| SMTP/API 邮件凭据、Auth 回调白名单 | Supabase Auth 的服务端配置 | U06 确认邮件品牌/域名/发信后设置、验证确认邮件及密码找回 |
| Cloudflare Pages deploy token/GitHub CI token | CI/托管密钥库 | 最小仓库/项目范围、受保护正式环境、审批和轮换 |
| `SENTRY_*` 等可选遥测 | 服务端/前端按数据类型隔离 | 禁止采集 JWT、code plaintext、签名 URL、Auth 管理结果秘密 |

生产上线前安全检查：搜索版本库/构建产物/Source Maps 中不应有任何秘密，验证 Pages 构建中的 `VITE_*` **均可被公众看到**。数据库迁移必须验证**public RPC 不存在扩权 SECURITY DEFINER**、所有私有 definer 内核和 RLS 辅助函数的最小 owner/USAGE/EXECUTE/固定 search_path、默认 PUBLIC EXECUTE 撤销与真实 SQL 权限矩阵，以及所有表 RLS/列级 GRANT；额外要求全管理写 L0、用户敏感路径 L1 统一锁序。R2 bucket 私有，不设置公开自定义域；CORS 白名单只解决浏览器跨域，不负责鉴权。

### 4.3 Aisenlens 非敏感小 JSON 的 Edge/R2 部署路线（DEC-02 A）

项目所有者已经批准 **Supabase Edge Function** 接收用户主动提交的、白名单和体积上限保护的 Aisenlens 非敏感 JSON，执行真实 JWT/本人/blocked/产品/成员/备份权益与 schema/大小/可信 SHA-256 校验。由受保护产品元数据 RPC 同事务执行 `pending`/配额预留，Edge 使用服务器受限 R2 凭据对唯一 `final_key` 条件创建，受保护 RPC 再核对当前授权并提交 `ready`/审计。**本首发 JSON 功能不使用客户端 staging PUT、CopyObject 或额外 Cloudflare Worker**。普通其它文件的 R2 客户端直传原则仍有效；视频、项目/时间轴、AI 结果和 AI Key/Token 不能借此扩大备份范围。

产品元数据可以采用经真实权限核验的同 Supabase Project 私有产品 Schema 或 Aisenlens 自有库，不能未经验证建 AisenCore 通用文件中心。实际 R2 SDK 条件创建、密钥最小范围、隔离桶/迁移与 RLS/EXECUTE 必须实测。任何 R2 已写/DB 未 ready、DB ready/HTTP 断线、物理删除失败、过期 pending 留物理对象，都依稳定请求 ID、有限预留、不可下载的非 ready 状态及异步对账清理。**没有跨 PostgreSQL/R2 的 ACID**。

恢复仅列本人 `ready` 并在当前权益/属主验证后签短期 R2 GET，客户端下载直读；已签 URL 的 TTL 残余访问时间必须真实测试。U09/U10 的字段、容量、版本/保留策略仍待定，不能拿 256 KiB/10 版本候选或产品部署建议冒充确认。详细候选 API 和验收见[D2](./aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)和[长期文件规则](../../architecture/database/product-data-and-files.md)。

## 5. 迁移、构建与 CI/CD

### 5.1 数据库变更与管理员引导

采用 D1 的 M00～M05 迁移 DAG：数据库版本/安全角色准备 → 公共表/约束 → 权益/发码 → RLS/GRANT/函数 → 安全管理员引导 → 隔离测试。**先实现迁移脚本并在空隔离库和带历史测试数据的库重建成功，获得正式发布批准后才应用生产**。迁移文件生成、历史版本表、锁序与 RLS 负向测试进入 CI，绝不直接在 Dashboard 手工修改生产而不留版本记录。

首次 owner：由用户 U05 指定**真实且已确认身份的 Auth 账号**，在受控运维流程中引导唯一初始管理员；成功后先配置并验证 `aal2`、第二恢复/备用管理员，确认 M1 共同保护锁，再开放 Admin。不能在仓库嵌入 UUID/口令/恢复码。Supabase Auth Admin API 的外部禁用账户操作不能绕过数据库最后管理员保护。

### 5.2 CI/CD 目标流程

**F08 真实版本准入**：以后得到编码/测试授权后须先发现项目实际 PostgreSQL/PostgREST/SDK/CLI/Edge/R2 版本并锁定 CI 工具链，执行 [V00～V07 验证 runbook](./aisencore-f05-f08-contract-compatibility-readiness-design.md#53-按实际顺序执行的验证-runbook将来获授权后才执行)。特别注意 Supabase 公告的 **2026-10-30 Data API 新表显式 GRANT**，不能依赖默认 public 暴露；2026-11-10 的旧 TLS 1.2 cipher 支持变化也进入客户端兼容验收。运行结果未取证前不可将 staging 部署写为 PASS。

```text
PR / feature branch
  → format/lint/typecheck/unit/security secret scan
  → build Admin (Vite) + verify public env only
  → isolated DB migration + pgTAP/RLS/RPC negative/concurrency tests
  → auth/Edge/R2 mock contract tests
  → Pages preview + smoke test（访问受保护，合成数据）
  → review/approve staging
  → staging Auth/Edge/RPC + R2 isolated integration
  → 手工审批生产变更（DB 备份与恢复点已验证）
  → 严格顺序部署数据库迁移、Edge、Admin 静态站点
  → 登录、TOTP、Admin、发码与 Aisenlens 备份冒烟测试
  → 上线记录 / 监控 / 失败回退或前向修复
```

不要在真正生成代码/锁文件前虚构 CLI 命令。Pages SPA 的历史路由刷新需配置 fallback 或 redirects，并验证它**只影响静态导航**，不替代真实 API。前端发布回退可切换 Pages 已验证版本；数据库不可把不可逆/破坏性 migration 依赖“git revert”恢复；先采取兼容演进，再依据备份与前向修复脚本回滚。涉及实际数据迁移、账号删除或宽权限变更须人工审批。

### 5.3 运维与恢复

- **Supabase**：数据库备份/PITR 的实际可用性、保留时长受所选计划限制，须查清服务等级并在 staging 做一次**恢复演练**；迁移前加一致性检查和明确恢复点，审计记录不得任意删除。
- **R2**：必须有对象与备份元数据**配对恢复**方案：仅恢复 PostgreSQL 元数据而 R2 已清理会生成死链接；仅恢复 R2 但无元数据会产生孤儿。演练 list→signed GET→客户端恢复以及过期、损坏、配额计算恢复。
- **监控**：Auth 邮件与回调失败、管理员 MFA/资格拒绝、管理 RPC 状态冲突与 503、发码重放/批次冲突、R2 签名失败、pending 超时/孤儿激增、预留配额不一致。仅记录非秘密 trace id、动作类别、耗时和匿名统计，不打印密码、JWT/refresh token、码明文或签名 URL。
- **密钥**：每环境独立、最小权限、定期轮换和泄露时即时撤销；R2 key 轮换会影响新签发，已发短期 URL 的生效边界须单独测试。备份秘密不得随用户配置上传。
- **故障策略**：公共权益不可验证时拒绝新的受保护云端操作/新备份 URL，客户端继续允许原本匿名本地 Free，不把 503 包装为真实 blocked；R2 已发 URL 的自然失效时间窗口应在事故响应预案中明确。
- **上线门槛**：U03～U11 中与实际功能有关的决策确认、真实 SMTP 与回调/域名、管理员恢复/第二管理员、数据注销政策、安全审核与 D4 验收**不能仅凭本文完成**。

## 6. D4 测试映射及风险

| 关键组 | 现有验收关联 | 未来必须采集的执行证据 |
| --- | --- | --- |
| Admin 资格 + MFA | I-25～I-27、M1 | 普通用户/aal1/已撤权 admin 访问全部列表与 RPC 均拒绝；两管理员并发互封禁，最后一人拒绝且无错误审计 |
| 成员与产品状态 | I-01～I-17 | RLS 只见本人/管理员、跨产品不混权、恢复 left、产品暂停并发、同事务事件 |
| 权益/授权/冻结 | I-18～I-24、R-07～R-09、R-14～R-15、M2 | 套餐引用冻结、停用不使旧码失效、授权撤销、会员/产品差异；503 不放行 |
| 发码安全与重放 | R-01～R-06、R-10～R-13、M3/M4 | 仅首次响应可见明文、代码表中不可读 hash、重放不明文、同码同用户重复语义/15 分钟限流、并发不超量 |
| CheckAccess M5 | I-18/I-21/I-28 | 可信业务拒绝 HTTP 200 + allowed=false、JWT 无效 401、系统失败 503，UI 提示区别 |
| Auth Admin Edge | I-25/I-26 + D2 扩展 | 鉴权前不能查 Auth Admin；by_id/分页/有限 email exact、达到上限明确 incomplete、secret 不泄露 |
| Aisenlens / R2 | I-03/I-04/I-16/I-18～I-21 的产品扩展 | 本地 Free 可离线；非本人/left/blocked/失效权益无法取得新 URL；跨设备预留、重复 PUT/complete、HEAD 与计量、签名过期、孤儿/恢复/删除 |
| 部署、环境与恢复 | D3 新增工程验收 | Pages 环境变量/构建秘密扫描、测试/生产环境隔离、迁移空库恢复/回退演练、生产恢复点和权限最小化 |

以上全部是**D4 的计划测试**，并没有真实通过结果。

## 7. 用户决策台账与实施阻塞

| ID | 需决定事项 | 状态、建议与最迟节点 |
| --- | --- | --- |
| U01/U02 | 首发 Aisenlens 本地优先、首批 R2 必需 | **已确认**，已经体现在本实施设计 |
| U03 | 对公众开放/邀请制内测 | **已选公众正常注册运营**；实际邮件/注销/安全/公开发布验收仍待执行 |
| U04 | 功能键、Free/Pro 配额/存储单位/试用 | **部分已定**：本地 Free，Pro AI 分析/无水印导出/R2 备份，30/365/永久，不自动试用；具体键与额度未定 |
| U05 | owner、备用管理员和恢复责任 | **单人日常运营 + Admin TOTP MFA 为 MVP 必做已确认**；新登录/失效时真实挑战、有效会话日常不重复 TOTP；备用身份及 MFA 恢复责任未定且须实测 |
| U06 | 正式域名、发信品牌/供应商与回调 | **统一身份品牌 + 自定义 SMTP 已定**；域名/提供商/回调尚待批准 |
| U07 | 账号注销、备份保留、数据处理责任及政策 | **人工核验、受控清理、合法留存例外已定**；实际期限、入口和例外范围未定 |
| U08 | 批量发码上限、人工分发责任 | **单人 Admin 人工发码、小批次、首批单次固定天数已定**；100/批只是候选 |
| U09 | 可备份设置/模板字段白名单 | **严格非敏感平台配置/允许模板文字已定**；具体 Aisenlens JSON 字段还未定义 |
| U10 | 恢复覆盖/合并、版本与多设备冲突/保留 | **手动选版本、差异预览、确认后替换类别已定**；版本数量/保留期限未定 |
| U11 | Pro 复核点、断网宽限及多设备体验 | **启动/关键操作复核及已启动纯本地任务可完成已定**；15 分钟缓存为测试候选，设备政策未定 |

**纯技术可在实现前由团队核验**：React-admin/ra-supabase/SDK 具体兼容版本、R2 对象 key 格式/短 URL TTL 试验、产品元数据物理 schema、Cloudflare Pages redirect 以及 CI workflow 语法。这些候选需要真实隔离环境测试和安全审查，不能由文档直接断言已可用。

## 8. D3 阶段退出及尚待真实验证

**文档设计交付**：管理资源/Provider/高风险交互、三环境/密钥/R2 服务/迁移发布/恢复及 D4 测试门槛均具体化。**未交付任何代码、SQL migrations、真实 Supabase/Cloudflare 配置或已运行测试**。D1/D2 都尚未实现，U03～U11 仍有未落实的产品参数与运行验收（但已确认方向不再标未决）。下一步 D4 仍必须先制定自己的阶段计划；任何实际开发/资源变更须按用户单独授权执行。
