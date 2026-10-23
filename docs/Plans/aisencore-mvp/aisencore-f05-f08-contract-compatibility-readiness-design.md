# F05～F08｜RPC 幂等契约、产品/环境准入与真实兼容验证准备

> **2026-10-23 会员认证边界最终修订**：保留 Admin 创建码时首次输入强类型规范化、actor scoped request_id、原请求 UNKNOWN 核查与一次性明文；直授保留 duration/explicit_window 互斥和可信时段。Core 不再存 Free/Pro 产品功能/额度、plan_id、features/limits，也不接收 capability；30/365/永久是 Pro 时段预设，AisenLens 自己负责导出和 R2 资源策略。原 F05 文中签名若包含 plan_id 应按当前 D1/D2 最小 Pro 资格合同改写后方可编码。

> **实施设计状态（2026-10-22）**：F05 **DESIGN RESOLVED / RUNTIME NOT VERIFIED**；F06/F07 **GATES DEFINED / REMAINING PARAMETERS PENDING**；F08 **VALIDATION PLAN READY / VERSIONS & RUNS NOT VERIFIED**。已完成的执行清单按 Plans 规则删除，真实待验收合同以本文为准。**不是**已经编写的 SQL、SDK、API、测试或创建的云资源。
>
> 业务权威：[spec](../../spec/requirements.md)、[D1 数据和安全](./aisencore-mvp-d1-database-implementation-design.md)、[D2 API/Auth/Aisenlens](./aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)、[D3 管理/运维](./aisencore-mvp-d3-admin-infrastructure-design.md)、[D4 43+12 验收](./aisencore-mvp-d4-test-and-readiness-review.md)；与 [F01～F04 私有内核/锁序/R2/MFA 收敛](./aisencore-f01-f04-security-convergence-design.md) 一起使用。U01 Aisenlens 本地优先、U02 首批 R2 私有备份已确认；U03 公开注册目标、U05 单人运营与 Admin TOTP MFA 已确认，U04/U06～U11 按[当前用户决议](./aisencore-u03-u11-user-decisions-2026-10-22.md)区分方向与待定参数；本文**不替用户设定**额度、备份字段、域名、发码上限或恢复责任人。
>
> **2026-10-22 补充费用与资源安全审查**：未来如新增真实消费型业务，则费用需可信确定、严格 `>0` 且上限、同 actor/请求指纹幂等与事务回滚；拒绝直接复制 `public SECURITY DEFINER` 的示例扣减 SQL，详见[BAAS-Q01～Q10 安全测试指南](../../development/testing/README.md)。现有 F05 发码/管理员 grant 的真实请求幂等契约不变，**本轮不新增未来消费 API 或公共表**；F08 真实 SDK/DB/R2 执行仍 NOT RUN。

## 1. 决议总览与适用层次

| 问题 | 本轮约束 | 可立即定型的部分 | 后续尚需 |
| --- | --- | --- | --- |
| F05 · RPC 参数/批次幂等与 Admin grant | 有效参数/default/NULL、强类型首次值与时段证据、actor-scoped request_id、双模式 grant、受控元数据与响应脱敏 | DEC-05 A 已批准，实施合同固定 | SQL/PostgREST/RLS/并发/旧行迁移待实测 |
| F06 · Aisenlens 产品政策 | 定义可安全先做的验证和政策依赖条件，拒绝凭空默认产品行为 | **范围与用户决定门槛明确** | U04/U09/U10/U11 用户确认才能冻结产品级通过断言 |
| F07 · 环境/运营/法律政策 | 发布前可执行的审批/恢复/安全环境 gate | **门槛及取证要求明确** | U03/U05/U06/U07/U08 确认、真实环境演练 |
| F08 · SDK/DB/Edge/R2 兼容 | 版本发现方法、变更源、矩阵、test fixtures、runbook、失败分级 | **验证准备充分** | 真实版本锁、工具/SQL/签名/两连接/R2 隔离环境运行证据 |

## 2. F05｜公共 RPC 精确参数和错误/幂等语义

### 2.1 API 外壳约束

- 仍采用 F01 的 **public SECURITY INVOKER 薄包装 → private 最小 SECURITY DEFINER 内核**，公开 RPC 只暴露明确的命名参数。本文的表是**候选精确形参**，未创建真实函数，不能从 MD 直接声明编译 PASS。
- PostgREST POST JSON 的键名必须匹配函数形参；避免使用仅类型不同、同名同形参名的重载；除明确允许的配置对象字段外，不接受未知参数。变更函数签名后要验证 schema cache reload，否则可能返回“function not found”而不是业务拒绝。
- 统一语义：**缺失（键根本未发送）**、**显式 JSON null / SQL NULL**、**有类型的具体值**三者不能在客户端/服务端无意混同。仅声明有默认值的参数允许缺失，且要以服务端默认值形成同一有效请求指纹；显式 NULL 只在字段语义明确允许时接受。
- **签名、响应版本和真实授权**三者独立：函数的公开参数不能包含 `actor_user_id`、`created_by` 或冒充 `is_admin`；后端从已验证 JWT 取得操作者，实际角色、对象归属和 M1/M2/M3/M4/M5 权威验证继续在 private 内核完成。

| RPC 对外函数形参（类型） | 必需/允许空 | 输入约束 / 默认处理 | 响应与拒绝约束 |
| --- | --- | --- | --- |
| `admin_create_codes(product_id,tier=pro,grant_duration_days,config,quantity,request_id)` | 同 actor/request_id，首次有效强类型配置按产品、Pro、天数、数量、次数和过期时刻规范化；同参重放非秘密，异参冲突，UNKNOWN 不盲目重发 |
| `admin_grant_entitlement(target_user_id,product_id,tier=pro,mode,duration_days,starts_at,ends_at,reason,request_id)` | 原 DEC-05 严格 duration/explicit_window 与 actor-scoped 幂等、L7 首次可信计算/旧输入复核；不传 plan_id 或 SaaS 功能值 |
| **已取消：admin_upsert_plan** | 不再写公共功能套餐版本/Features/Limits；Pro 的 30/365/永久是发行/授权时间选项，真实命令只关心 tier=pro、产品、时间、来源与幂等 |
| `admin_revoke_grant(grant_id uuid,reason text)`、`admin_revoke_code(code_id uuid,reason text)` | 不能为空 | 幂等目标状态；审计同事务，重复撤销不增加有效副作用 | 按既定可预期业务错误/409；没有新发码明文 |
| `redeem_code(product_key text,code text)` | 两参数非 NULL，product_key 为不可信声明 | 先在声明产品核对 left/suspended 成员，再查码并对比真实归属；未知/跨产品一律无效码 | 预期拒绝 HTTP 200 ok=false、失败次数受控；旧单参公开入口必须安全下线 |
| `check_access(product_key text)` | 无副作用只读当前本人产品准入与 Pro 资格/时段，无 capability/limits | JWT 本人，用户/产品/成员事实受保护 | 可可信计算的业务拒绝 200/allowed=false；JWT 401，可信故障 503，不能误回 Free |

**重要参数策略**：MVP 不把 `admin_upsert_plan` 做成“省略字段保留旧值”的隐式 PATCH；React-admin 表单先读取安全的现值，再**全字段提交**。如果实现者将来需要 PATCH，必须另设单一命名 `patch jsonb` 及 `expected_version` 的独立审查接口，并明确区分 JSON 对象里缺失、显式 null 与字段更新；**现在不声称已经批准新接口或新增表列**。并发重复编辑不能仅以客户端表单状态防丢写，实际实现需补充一致性/409 验证。

### 2.2 发码首次有效配置的规范化与强类型幂等（DEC-05 A）

**已批准取舍**：继续保留服务端 actor-scoped `(created_by,request_id)` 唯一和第一次明文仅出现一次的合同，**优先在批次受保护元数据中存首次实际有效字段并使用 NULL-safe 等值比较**，不再要求所有新批次一律维护 canonical v1 SHA-256 指纹。只有确实无法由强类型列重建首次输入等价性的旧行/字段，才在 private 技术列保留带明确定义的指纹或附加字段；任何值都禁止经普通 Data API SELECT。

| 配置字段 | 默认与 NULL 语义 | 有效检查 |
| --- | --- | --- |
| `grant_duration_days` | 缺省或显式 NULL = 永久 | 非空必须严格正整数 |
| `max_redemptions` | 缺省=1；显式 JSON null **拒绝** | 非空必须正整数并受可信上限，U08 真实批次限额仍未定 |
| `expires_at` | 缺省或显式 NULL = 码没有截止 | 非空需带时区 RFC3339，规范到 UTC 微秒 |
| `quantity / product / plan / created_by` | 必填，actor 来自已校验身份 | product/plan 一致、活动发码资格、正数 quantity、绝不接受客户端 created_by 或指纹 |

**并发处理**：先校验 JWT+`aal2`+当前 admin、产品/套餐资格、L0/L3/L4 锁及真实 config；`UNIQUE(created_by,request_id)` 竞争的重试者读取**首次持久化字段**逐项比较。相同语义返回 `created=false` + 安全批次信息，**不回显首次明文**、不新增审计/码；异参 `STATE_CONFLICT`。超时结果 UNKNOWN 时先查原状态，不能通过换 ID 和重放猜测原码。已发行历史 v1 指纹不可擅自删除；迁移必须用真实旧数据验证规则及版本差异。真实 F05-C01～12 未运行。

### 2.3 管理员直授两种互斥模式与首次时段证据（DEC-05 A）

- `source_type=admin` 时以 `admin:<actor_uuid>:<request_uuid>` 唯一标识，actor 永远来自服务端当前 JWT；相同 request_id 的不同管理员各在自己的命名空间。
- **`mode=duration`**：仅提交正整数 `duration_days`，不能同时携带显式时间窗；服务端在统一 L7 同用户+同套餐锁中，可信计算首次 `starts_at/ends_at` 并持久化。重复请求读取原计算结果，不随当前时间漂移再顺延。
- **`mode=explicit_window`**：必须同时显式提交 `starts_at` 与 `ends_at`，其中**明确的 SQL/JSON null** 才是永久，省略结束键不允许隐式产生永久；非空时间比较和 UTC 精度由可信内核校验，未来授权不能提前启用。
- 首次请求将 user/product/plan、mode、每个实际有效输入（包括 reason 规范化、参数是否存在）、可信时钟与已计算时段存于受控列或 private 幂等行；只有证明现有强类型列**能完整还原**时才能删除旧技术指纹。合法本人/Admin 读取安全投影不能获取 hash、请求技术元数据或他人 grant。
- 请求重试**同 actor/request_id 同语义**返回原 grant 非秘密摘要、没有新授权/审计；同键异参 `STATE_CONFLICT`。原先纯显式签名需按升级方案安全迁移，不默许省略结束日期变成永久；真实 SQL/PostgREST/RLS/并发/NULL/时间精度均 NOT RUN。

### 2.4 重试、错误与角色对应

| 条件 | 稳定客户端处理原则 | 服务端是否新写 |
| --- | --- | --- |
| 相同管理员 + 同 request_id + 同规范化配置 | 批次 `created=false` 非秘密元数据；授权返回原 grant | 不重写、不开新审计、不回显旧码 |
| 相同键但配置/受益目标/时间/原因不同 | `STATE_CONFLICT`，API/HTTP 候选映射 409；不可自动换 request_id 来掩盖操作者误提交 | **无新业务事实** |
| 发码/授权响应超时、连接中断 | UI 状态 `UNKNOWN/VERIFY`，先查非秘密结果；发码无明文不能补发 | 幂等重试不二次发码或授权 |
| 管理员 `aal1`、被撤权或 blocked | 管理资格失败；UI 需要 MFA/重新登录或拒绝，不能使用旧缓存 | 无业务修改 |
| `redeem_code` 可预期无效 | **200 `ok=false`**，按固定失败限流计数业务规则持久化；重复本人已兑优先 | 仅应有的失败限流变动 |
| `check_access` 本人可信拒绝 / 无效 JWT / 技术失败 | 分别 **200 allowed=false / 401 / 503**；不可混为“无权益” | 无副作用 |
| SQL 事务审计失败/死锁或网关不可用 | 技术失败、全部写入回滚；合理有界重试且先核对最终状态 | 不产生半提交 |

## 3. F06｜Aisenlens 产品级决策与测试拆分

| 用户决定 | 未决参数/事实 | 可以先设计/验的安全底线 | 依赖用户确认后才可冻结的验收 |
| --- | --- | --- | --- |
| **U04** Free/Pro 功能、数值上限、试用及备份归属 | **已确认** Free 本地基础、Pro AI 分析/无水印导出/云备份、30/365/永久、首版不自动试用；**仍缺** feature key、价格和数值额度 | CheckAccess 根据真实权益计算功能/上限、R2 权威元数据使用 `ready+reserved` 原子预留 | 按 [当前用户记录](./aisencore-u03-u11-user-decisions-2026-10-22.md) 完成剩余字段与配额确认 |
| **U09** 允许云备份的配置/模板字段 | **严格白名单的非敏感平台配置参数及允许的模板文本已确认**；实际 JSON 键集合/版本待 Aisenlens 实现明确 | 用户主动触发、默认拒绝未列字段；不得备份视频/完整项目/AI 输出/API Key；可信服务端 final 内容校验 | 精确字段 schema、升级兼容与错误字段策略 |
| **U10** 恢复/版本/多设备冲突/保留 | **手动选择版本、差异预览、确认后替换所选类别已确认**；版本数量、保留期仍待定 | 只列本人已 ready final；损坏/不兼容不能静默覆盖；非 ready 对象不可下载 | 确切字段/版本清理与备份恢复 E2E |
| **U11** Pro 运行期间复核与断网体验 | **启动/关键操作复核、已启动纯本地任务断网可完成已确认**；15 分钟缓存只供运行验证，设备限制仍待定 | 本地匿名 Free 不受网络影响；**新受保护云操作/R2 签名**无法验证则拒绝 | 15 分钟重验实际性能与撤权窗口取证 |

**F06 结论（后续用户答复）**：U04/U09/U10/U11 的上述**产品方向部分已批准**，具体 feature keys/容量/schema/版本时限/缓存阈值仍待确定或真实验证，不能再笼统称“这四项全部待定”。不能把 R2 短期 GET TTL 候选或“同 Project 单独 schema”当作用户已批准的商业或存储政策；F03 Edge/R2 final 条件写尚未运行，旧 CopyObject 非当前路线。

## 4. F07｜生产环境/账号恢复/发码运营分段准入

| 用户决定 | 不可跳过的 Gate | 需要归档的真实证据 | 当前状态 |
| --- | --- | --- | --- |
| **U03** 内测/公开账号开放方式 | **已明确选择公众正常注册**；必须落实 Auth signup 防滥用、邮件/生产环境/隐私和删除处理 | 决议与 Auth 项目配置、邮箱测试、负向注册测试 | **DIRECTION CONFIRMED / 环境未创建** |
| **U05** 初始 admin、第二合格管理员、MFA 丢失恢复责任 | 已明确**单人日常运营，Admin TOTP MFA 列为 MVP 必做**；有效会话普通管理请求内检查 `aal2` 不每次请求 MFA 服务；备用身份/设备恢复待具体确定 | 真实因素注册/登录 AAL2/会话刷新、失设备受控恢复、RLS/最后管理员和低打扰验收；详见[AUTH-P06～P11](./aisencore-mvp-auth-entitlement-mfa-efficiency-design.md#43-admin-测试矩阵全部-not-run) | **MFA MVP CONFIRMED / 恢复责任与运行验证待定** |
| **U06** 域名、邮件品牌/供应商、OAuth/重置回调 | **统一账户品牌+自定义 SMTP 已定**；供应商/域名/发件地址/回调仍待确认 | 生产配置清单、邮件/回调/重置 E2E、回退记录 | **部分方向确认 / 未配置** |
| **U07** 账号注销、R2 元数据与对象清理/保留 | **人工核验、受控清理、合法保留例外已定**；申请入口/期限和具体留存例外仍待确认 | 注销工单、DB+R2 配对删除/恢复演练、公开政策 | **部分方向确认 / 未验证** |
| **U08** 人工发码分发责任、单批发码规模 | **本人唯一运营发码、小批次、首批单次兑换固定时长已确认**；100/批仅候选硬上限，不为单人运营虚构双人审批 | 指纹/批次上限与本人身份资格测试、首发明文交付/超时撤销重发、负载测试 | **方向确认 / 具体上限待定，Admin 未实现** |

**隔离环境先行**：在未来获得授权后可以首先建立本地/隔离测试环境并使用虚拟用户、模拟配置与限定数量的**测试码**，用于验证程序安全；不得把测试环境的任意假定数值上传生产或当作 U04/U08 业务政策。Dev/Staging/Prod 分环境使用**不同** Auth 项目、DB、R2 bucket、secret、发布权限；公开 Vite 构建只含 publishable key；所有真实迁移、生产恢复/部署需单独批准。完整 Admin 最小服务等级/运营体制需 U05/U08 处理后才能成立。

## 5. F08｜实际版本发现、兼容矩阵与预执行报告

### 5.1 已核查的官方变化（2026-10-22）

- [Supabase 2026-04-28 Data API 暴露行为变更](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)：新项目逐步默认显式授权；**2026-10-30 起现有项目新建的 public 表也需要显式 GRANT 后才可通过 Data API 访问**。现有表的既有 GRANT 不会自动消失。**迁移必须主动明确 RLS、GRANT、function EXECUTE，不能依赖“public 自动暴露”。**
- [Supabase Database API security](https://supabase.com/docs/guides/api/securing-your-api)：Grant 控制对象可达、RLS 控制行可见，两者缺一不可；函数默认 PUBLIC EXECUTE 与表的暴露默认设置不完全等同。
- [PostgREST Functions as RPC](https://docs.postgrest.org/en/stable/references/api/functions.html)：JSON POST 参数名必须匹配函数名、只有带默认参数才能省略、函数变更需 schema cache reload，同名参数仅类型不同的重载不支持。**这是上游文档版本，不意味着 Supabase 当前服务端实际 PostgREST 一定同版本。**
- [Supabase Edge auth](https://supabase.com/docs/guides/functions/auth) 与 [authorization headers](https://supabase.com/docs/guides/functions/auth-headers)：`Authorization` 是用户 JWT，`apikey` 是公开/服务 key；不可把 publishable API key 放 Bearer 当作会话；真实签名/JWKS/Edge `verify_jwt` 组合必须以版本验证。
- [Supabase CLI/pgTAP testing](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)：数据库结构、RLS、RPC、事务测试可用 pgTAP/CLI；真实 CLI 子命令及选项以目标版本 `--help` 为准。
- [Cloudflare R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/)（页面 2026-10-14 更新）/[presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)：已列出 CopyObject、`x-amz-copy-source-if-match` 等能力，但**当前选用的 SDK/Worker 行为、对象大小、实际签名和重放语义仍无实测证据**。
- [Supabase changelog breaking changes](https://supabase.com/changelog?types=breaking-change)：还需留意 **2026-11-10 HTTP API 部分旧 TLS 1.2 cipher 禁用**、已公告的 PostgreSQL 15.19/17.11 minor 安全更新与扩展/index 兼容、Node.js 20 支持淘汰。**与真实项目版本不对应的变更不可直接断言已影响该项目**。

### 5.2 版本锁定矩阵（当前全部 unknown / NOT RUN）

| 组件 | 需要发现和锁定的实际版本/配置 | 主要破坏性差异 | 取得证据方法（未来授权后） |
| --- | --- | --- | --- |
| PostgreSQL + extensions | PG major/minor、pgcrypto/pgTAP、RLS `BYPASSRLS` owner、事务隔离级别、时区精度、schema | 约束/函数 hash、默认权限、角色/扩展兼容 | 隔离 DB `SHOW server_version`、catalog/extension 清单、迁移审计 |
| PostgREST/Data API | 实际服务端版本、exposed schemas、function EXECUTE、schema cache 更新机制 | 同名形参 JSON、null/缺失/重载、错误 SQLSTATE HTTP、显式 Data API 授权新默认 | 真实 JWT HTTP RPC、响应 headers/实际服务版本佐证、DDL 后 schema cache 验证 |
| Supabase CLI/runtime | CLI 具体版、lockfile、实际 local stack postgres/auth/edge 与托管项目差异 | `supabase test db`/`db lint`、migration 记录、项目配置 | `supabase --version`、分层 `--help`、CI logs、版本清单 |
| Supabase JS/Auth/MFA | `@supabase/supabase-js` 与 `@supabase/server` 所选精确版、JWT signing mode、JWKS/刷新 | `getClaims`、TOTP `aal2`、signOut scope、JWT 撤销/会话新鲜度 | 包锁文件、验证 JWT/MFA 真实 E2E、未授权负向记录 |
| Edge Functions | runtime/Deno/SDK、`verify_jwt`、secret key 注入和授权头 | 公共密钥不等于用户 JWT、Edge 查询 Auth Admin 前先校验资格 | 实际 isolate 测试、401/403/503、secret 脱敏扫描 |
| React-admin/Vite | React-admin/MUI/Vite/Node 精确版本、Provider 接口 | resource list/count、authProvider API、构建公开环境变量、Node 20 退场 | package lockfile、类型检查/preview E2E/构建制品 secret 扫描 |
| Cloudflare R2 / Edge SDK | R2 S3 实际兼容版本、Edge Runtime、AWS SDK v3、**唯一 final 条件创建**、私有 Bucket 和 CORS | Edge JSON 内容校验、不可覆盖条件写、受控 GET URL 有效期/撤权时间窗、DB/R2 补偿；Worker/CopyObject 仅属未采用备选 | **隔离桶真实 PUT→HEAD→Copy→GET→replay**、内容 SHA-256/HEAD 与对象元数据差异 |
| Cloudflare Pages / CI | Pages builder Node/runtime、环境变量 scopes、域名/回滚机制 | preview/prod secret 误注入、SPA 刷新、不能回滚 DB migration | CI 安全日志、staging preview/rollback 与 DB 恢复演练 |

此时**不得填写任何假定的实际版本号**，也不能将“某版本官方已支持该命令”记为“本项目已执行成功”。每次选定版本后在 repo 固定 lockfile/服务版本记录，升级同样要重跑对应风险的反例。

### 5.3 按实际顺序执行的验证 runbook（将来获授权后才执行）

| 顺序/验证包 | 操作范围和必要断言 | 出口证据 |
| --- | --- | --- |
| **V00** 基线与环境 | 检查无生产密钥、测试身份隔离、版本/CLI help、变更审批；拒绝把本地端口暴露公网 | OS/CLI/SDK/PG/PostgREST/R2 环境指纹、测试项目/桶明确隔离 |
| **V01** DDL + F01 | 在空隔离库应用版本化迁移，验证产品唯一线上 Free 配置列/校验及 Pro Grant/code 同产品复合外键，明确不存在 Free 指针 FK 或 Free Grant、**按 DEC-05 保存首次规范输入/时段的私有幂等元数据**，而非必建旧 admin_request_fingerprint 列；核验 EXECUTE/owner/RLS/GRANT | 迁移快照、anon/用户 A/B/aal1/aal2 越权 SQL/HTTP 负向和安全投影 |
| **V02** F05 批次/授权幂等 | F05-C01～C12：默认/NULL/canonical 时间/同键配置差异/跨管理员、响应丢失、grant 指纹/冻结计划；不允许明文重放 | 实际请求/JSON、批次/授权计数与 digest、HTTP 409/200、无审计重复 |
| **V03** F02 与 M1～M5 | LCK-01～07 真双事务屏障，并发发码与修改计划、码锁/账号限流/授权续期、审计故障注入 | 锁等待/超时/SQLSTATE、事务回滚快照、重复请求无第二 grant |
| **V04** D2/Auth/API/F04 + MVP 性能 | JWT 签名/issuer/audience/aal2、**真实 Admin TOTP enroll/challenge/verify、刷新/降级、会话恢复**、Admin 普通读写不逐操作请求 MFA/Auth、Edge/Auth Admin 当前资格、M5 可信拒绝 200/401/503、PostgREST schema cache | HTTP+JSON、Edge 请求日志（脱敏）、Auth/MFA 计数与 P50/P95、未授权 Auth Admin 查询次数 0，AUTH-P01～P12 |
| **V05** R2/F03 | DEC-02 A：受保护 Edge 非敏感 JSON 白名单/限体、真实 R2 final 条件写、不可覆盖、摘要、超额/越权、断线/DB 失败/删除失败双端对账 | 对象 bytes/sha256、DB ready+reserved、错误及孤儿清理实测 |
| **V06** Admin/Aisenlens/F06/F07 | React-admin Provider/首次发码明文、Aisenlens 匿名 Free、本地 Pro 权限；U04/U09/U10/U11 确认后才运行其精确产品断言 | E2E 截图/网络/日志脱敏、只读/写隔离、已确认用户政策 |
| **V07** 灾备/上线门槛 | 迁移新空库 + 有旧数据、DB/R2 **配对恢复**、MFA 第二管理员恢复、Secret/TLS/SMTP/回调、Pages staging smoke/rollback | 审批单、恢复点/耗时、权限清单、数据/文件清单一致性与回滚结果 |

**F05 专项验收用例**（均是将来运行的设计，当前 NOT RUN）：

| Case | 操作与输入 | 可判定断言 |
| --- | --- | --- |
| F05-C01 | 同一发码 request_id 的 `{}` 与 `{max_redemptions:1,grant_duration_days:null,expires_at:null}` | 同一 fingerprint、只一次发行、重放不含明文 |
| F05-C02 | `expires_at` 为同一瞬间的不同 UTC offset 字符串 | 归一后同指纹；不同时间则 STATE_CONFLICT |
| F05-C03 | `max_redemptions:null`、0、小数/字符串、未知 config 字段 | INVALID_INPUT，0 个新码/批次 |
| F05-C04 | 同 actor 同 request_id 但数量/plan/product 改变 | STATE_CONFLICT，历史批次不变、没有第二份明文 |
| F05-C05 | 两 actor 使用完全相同 UUID request_id | 独立合法批次，作用域不串扰 |
| F05-C06 | 并发同键发码并令首成功响应丢失 | 仅一个批次和一个码集合；任何重放只有非秘密元数据 |
| F05-C07 | 同 actor/request_id 同 grant 参数重复 | 只存在一个 grant/source_ref/审计，不重复延长 |
| F05-C08 | 同 actor/request_id 变更 target、plan、时段或 reason | STATE_CONFLICT，不覆盖旧 grant；跨 actor 相同 UUID 不误冲突 |
| F05-C09 | grant 不同 UTC offset、相同实际时刻重放 | 同一 grant 指纹；`ends_at=NULL` 与非 NULL 不等价 |
| F05-C10 | 发码只填写数量但未明确 tier 或授权天数，或含业务 Features/Limits | 拒绝无效发行参数；不补造功能套餐/旧版 plan_id |
| F05-C11 | Pro 30天/365天快捷预设被移除后重新查询历史批次 | 已发行有效码仍按首次强类型保存的 product+tier=pro+grant_duration_days 兑付；不重写历史 Grant 或业务功能 |
| F05-C12 | RPC 签名创建或修改后 PostgREST schema cache 仍旧、并存同名不同类型重载 | 实际 HTTP 错误可诊断；清缓存/无歧义签名才通过，不把 404 当业务不存在 |

**取证规范**：每条必须具备 `case_id,run_id,commit_sha,migration_hash,db_version,postgrest_version,sdk_lock_hash,edge_runtime,auth_key_mode,r2_sdk/runtime,environment,fixture_ids,actor_aal,request_id,precondition,request_masked,observed_http/json,db_before_after,expected,actual,status,trace_ref,reviewer,timestamp`。严禁记录明文码、JWT、secret、R2 URL。未执行时 `status=NOT RUN`，模拟/测试双连接结果不能冒充真实资源行为。版本缺失、权限测试失败、明文重显、并发超量/授权绕过、R2 final 被覆盖均为 P0 阻断。

## 6. F05～F08 退出/交接和未变业务规则

- **F05** 文档契约可判设计收敛：精确外部参数、默认/NULL/指纹、admin grant 命名空间与持久防变参数机制；**运行未验**，D1 真实 DDL、函数签名和 SQLSTATE 仍是验收前依赖。
- **F06** 产品技术边界与可测安全下限已定，但真实用户政策 **U04/U09/U10/U11** 未定；**不能宣布产品需求本身关闭**。
- **F07** 环境门槛和证据要求已定，**U03/U05 的已确认方向尚未通过生产验证，U06/U07/U08 仍有具体参数待确认**且云资源尚未建立；**不能宣布生产就绪**。
- **F08** 官方资料风险与测试 runbook 已准备，真实版本未知，全部 V00～V07、F05-C01～C12 及 D4 43+12 用例实际 **NOT RUN**。
- **总体**：完整 MVP 开发/上线仍是 D4 的 **BLOCKED**；非生产工程骨架理论上有条件可准备，但要用户未来单独授权。F01～F04 也只达设计层收敛，真实授权/并发/R2/JWT 需同一测试计划补证。

## 7. 官方来源与验证界限

本阶段仅检查截至 **2026-10-22** 可访问的 Supabase/PostgREST/Cloudflare 官方公开说明，未读取用户 Supabase 实际项目配置，未执行 CLI 或任何云端测试；官方说明也可能随版本变化。具体依据已在 §5.1 列出。**下一次实际实施前必须重新核查适用版本和公告的生效日期**，尤其 2026-10-30 Data API 授权默认行为、2026-11-10 TLS 客户端支持变化。
