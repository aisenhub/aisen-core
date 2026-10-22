# MVP｜低请求量认证、Aisenlens 权益快照与 Admin TOTP MFA 实施设计

> **状态：DESIGN COMPLETED / RUNTIME NOT VERIFIED**；本文件保留专项有效约束和待执行测试，完成的执行清单已删除。本轮用户已批准**将 Admin TOTP MFA 纳入 MVP**，同时明确目标：尽量降低 Supabase Free 的不必要 Auth/DB/Edge 调用与客户端感知延迟。本文是**待实现的规范**，无实际 API、SQL、代码、生产配置或 p95 性能取证。
>
> 与 [正式需求](../../spec/requirements.md)、[统一会话](../../architecture/applications/auth-and-multi-saas-sessions.md)、[本地优先](../../architecture/applications/local-first.md)、[公共 API](../../architecture/backend/public-api-and-saas-integration.md)、[D2 接口/Auth](./aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)、[D3 Admin Provider](./aisencore-mvp-d3-admin-infrastructure-design.md)、[F01～F04 安全收敛](./aisencore-f01-f04-security-convergence-design.md)及 [D4 分层验收](./aisencore-mvp-d4-test-and-readiness-review.md)共同使用。**不修改**既有 `check_access` / `admin_check_access` 的已定义业务错误语义或要求跳过可信鉴权。

## 1. 用户已批准的 MVP 方向及层次

| 层次 | 目标 | 必须成立的边界 |
| --- | --- | --- |
| **普通 Auth** | 免费计划少发没必要的身份网络请求 | Session/refresh 由官方 SDK 负责；客户端读缓存不能被可信后端当成身份验签 |
| **Aisenlens 本地 Free** | 打开/使用离线基础工作流不依赖 Supabase | 未登录不会因启动而加入产品、查询权益或占用 R2 |
| **Aisenlens Pro** | 启动/进入 Pro 及关键操作**按需复核**，不是“全在线用户每 15 分钟固定轮询” | 15 分钟是**待实测的新鲜度候选**，不是离线许可证；功能/额度分别计算，旧 JWT 不包含权威 Pro |
| **R2 备份** | 本人私有内容直连 R2，避免公共后端传字节 | **签发/complete/下载**等可信服务器阶段都依当前授权与产品属主校验，绝不直接接受 UI 快照 |
| **Admin MVP** | **必须实现 Supabase Auth TOTP MFA**（enroll、challenge、verify、`aal2` 会话门禁）、必要的恢复/失效路径、负向测试 | 进入 Admin 数据与管理 RPC 的服务端始终验证当前 JWT `aal2` + 活跃 admin + 非 blocked；不可移除后端检查 |
| **Admin 性能** | 不让每次页面导航/数据查询叠加另一条 MFA/Auth HTTP 调用 | 有效 `aal2` JWT 随**原业务请求**送达，RLS/RPC 在同请求或事务内校验；UI 缓存仅能节流导航，不得授权 |

**为何“每次检查”不等于每次“重新验证 MFA”**：TOTP challenge/verify 用来取得足够认证等级的签名 JWT；此后 Supabase/PostgREST 可以从经验证的 JWT `aal` 声明判断 `aal2`，读取当前管理员名册。除首次 MFA、会话失效、因子/认证等级变化等场景外，不要求每个管理数据请求重新访问 Auth MFA 服务器，更不能每个管理按钮弹 TOTP。

## 2. Auth SDK 调用预算与免费额度原则

| SDK/路径 | 预期性质 | 应用时机与禁用误区 |
| --- | --- | --- |
| `auth.getSession()` | 读取客户端持有的 session，必要时**可能联网刷新**；返回的本地数据不等于可信服务器验签 | 客户端显示登录状态、取得当前 bearer；不能服务器盲信浏览器传来的原始 session 字段 |
| `auth.onAuthStateChange()` | 监听登录、登出、会话/token 变动；客户端事件不提供管理员真实授权 | 建议集中维护单一会话状态，不每个组件单独请求用户资料 |
| `auth.getClaims()` | 非对称 JWT 以可信 JWKS 验签且缓存适用时可以减少 Auth 网络；旧对称签名路径可能仍联网 | 校验令牌签名、iss/aud/exp/aal 的**身份声明**，不以 claim 代替 blocked/成员/Pro/管理员当前资格 |
| `auth.getUser()` | 当前官方 JS 说明每次请求 Auth 服务器 | 仅用户资料确需权威刷新、恢复、敏感账号状态或安全异常定位时使用；**禁止 UI 每次 render/navigation/按钮点击都调用** |
| 官方 access/refresh 轮换 | 令牌刷新需 Auth 网络请求，但通常由 SDK 按需安排 | 不新增独立 `/login`、`/refresh` API，不为获取“新鲜 Pro”强制刷新 JWT；刷新失败清理/提示重登，不能放行云端 |
| `check_access` | 访问公共 PostgREST/DB 的**权益 RPC**，不是再次登录也不应另行 `getUser()` | 仅需用户当前 Pro 权限时请求；JWT 在网关验证，DB 查 blocked/产品/成员/有效授权 |
| `admin_check_access` | 当前管理员只读资格 RPC | 登录 `aal2` 后/UI 资格失效后显式调用；普通管理 RLS/管理 RPC **不得依赖 UI 每次额外先查这一 RPC** |

**计量不变量**：Supabase MAU 是当期不同活跃用户概念，**不随同一已计数用户的每次 Pro 权益查询再次新增独立 MAU**；但认证刷新、数据库请求与结果传输会消耗 Auth/DB CPU、连接、数据库/网络流量，Edge 与 R2 各有自己的指标。免费配额、价格、暂停与数据保护规则会变化，不能把某个历史数字编码成业务决定；应以**实际 Project 当前 Usage/Billing 和官方当期计划**为准。AisenCore 公共 DB 的兑换/永久授权事实必须有真实备份与恢复演练，R2 不是公共 DB 的备份替代品。

**外部 BaaS 技术建议安全筛选（2026-10-22）**：Supabase Free 的 Unlimited API Requests 仅指**无固定 Data API 调用次数配额**，不能推论 DB CPU/内存/连接、出站流量及 Edge/R2 免费资源无限；以当前 [官方定价](https://supabase.com/pricing)和真实 Usage 观察。客户端缓存继续**按需 TTL 与 single-flight**，不能因切前台就必发 HTTP，也不能把 `is_pro`/`vip_until` 放进 Custom Access Token Hook 作为**实时权益权威**：JWT 不会随管理员撤权实时更新。对平台动态权益继续调用可信 DB；Admin JWT `aal2` 只证明 MFA 等级、管理名册仍实时校验。详见[原子配额与 JWT/Redis 评审](./aisencore-mvp-baas-quota-security-lessons.md)；其声称“固定节省 80%～85%”未经本项目真实负载验证。

## 3. Aisenlens 权益复核：事件驱动 + 短期快照候选

### 3.1 入口及刷新调度

```text
打开 Aisenlens
   ├─ 匿名 / 仅使用本地 Free → 不调用 Auth / Pro / DB / R2
   └─ 已登录并需要 Pro 或恢复登录状态 → SDK 复用当前 session
          ├─ 进入 Pro 功能/启动时，异步或必要时在线 check_access
          ├─ 快照 fresh 且此次是允许本地缓存的纯本地 Pro → 复用
          ├─ 快照 stale / 关键准入要求当前新鲜度 → single-flight 一次 RPC
          └─ 权益兑换/退出/登录变化/恢复联网/403 等 → invalidate 并合理重新取权威状态
                 └─ 新备份签发/complete/下载 → 产品可信服务端自己实时授权
```

- **按需**：不实现对所有在线/闲置用户固定 `setInterval(15min)` 权益轮询；不做每次按钮/菜单/render 查询；已登录并进入 Pro 时**可先渲染本地 Free/UI 框架**，Pro 控件显示短暂 loading，不因公共请求阻塞整个软件启动。
- **缓存键**：`user_id + product_key + 已签发会话身份/版本`，进程内/本地最小非秘密缓存（实际是否写盘需审查）；包含 `evaluated_at`、`fetched_monotonic_at`、`expires_at`、`allowed/features/limits`、请求是否仍 pending。登出/换账号/退出成员/兑换成功/服务端明确拒绝则失效；不得跨用户共享。
- **时间**：**15 分钟新鲜度仅作为性能候选上限**，不是每 15 分钟必发 HTTP；进入关键操作时先判断快照是否过期。到期本身/产品上游授权终止时间优先于缓存 TTL（不可用本地缓存延长已知 `ends_at`），时钟偏差需评测。
- **去重**：对同一用户/产品/同一代 session 的多个并发 UI/操作，使用 **single-flight**（共享一项进行中的 RPC 请求），避免 AI/导出/备份多个组件同时请求；缓存击穿时可设置轻量 jitter/backoff，**禁止把 401/403/503 伪装成 Pro 无权益**。
- **刷新条件**：新登录/重连、产品身份改变、完成兑换、恢复账号/成员、服务器告知撤销或产品暂停、token/session 变化且身份不明时尽快使旧状态失效。无强制实时推送的前提下，本地缓存时差不可避免，不应承诺即时踢出本地离线计算。
- **无网络**：匿名 Free 始终可用；新需要可信授权的操作且无法验证时不放行。**若 15 分钟窗口中突然离线**，该缓存是否还能允许启动全新的**纯本地** Pro 任务是 U11 遗留边界，**实施前必须明确并测试，当前不默许产生离线许可证**。已启动的纯本地任务按用户已批准方向可以完成；第三方 AI 直连网络不可用不保证任务完成。

### 3.2 单次聚合权益快照：**可选独立只读查询契约，未批准替代原 RPC**

目前唯一的逻辑权威仍是 `check_access(product_key, capability?)`，可信业务拒绝为 `HTTP 200 {"allowed":false,...}`，无效 JWT = `401`，真实验证失败 = `503/5xx`。原 `get_my_products` 亦不等于跨产品授权许可证。

**优化候选**：如果一个 Pro 页面确实需要同时显示 AI 分析、无水印导出、备份是否可用和多个额度，可在**不改变原 RPC**前提下，为“当前本人/指定产品”设计一个**独立**版本化只读聚合权益接口或给原只读方案加受控扩展；输出白名单 capability keys 与 `limits`、`evaluated_at`、最近有效授权终点。候选 JSON：

```json
{
  "product_key": "aisenlens",
  "allowed": true,
  "features": {
    "ai.analysis": true,
    "video.export.no_watermark": true,
    "backup.config": true
  },
  "limits": {},
  "evaluated_at": "2026-10-22T00:00:00Z",
  "valid_until": null
}
```

**示例**不是已批准 feature key/额度或已创建 HTTP 接口；`valid_until=null` 必须谨慎表示“此响应未提供统一自然到期点”而非永久授权。真正具永久/周期两类叠加时正确计算功能有效性与上限，不能凭示例简化。实现决议必须在 D2 接口冻结与真实 SQL/RLS 审核前明确；初期继续使用现有 `check_access` 也能满足 MVP，不将聚合接口强行作为新开发前置条件。

**安全边界**：聚合响应仅限本人、指定产品，包含最少字段，不写成员或业务配额、不能让客户端指定 actor/管理员资格；不能返回兑换码 hash/所有授权历史、R2 对象 key；错误码遵从已定 200/401/503。任何后台资源操作（R2 发 URL、上传 complete、删除、下载、业务写入）**永远独立重新检查实时有效能力、产品对象归属、额度**，不能使用过期客户端快照授权。

## 4. Admin TOTP MFA：纳入 MVP，但在会话有效期间低打扰

### 4.1 MVP 实际功能范围（必须实现且真实验收）

1. **首次管理登录**：React-admin `authProvider.login` 调官方 `signInWithPassword`；`aal1` 不得读取管理员列表、授权或发码；正常认证用户可进入官方 TOTP `enroll` 或 `challenge/verify` 流程。
2. **取得 `aal2` JWT**：完成第二因素后重新读取/取得实际**已验证** `aal2` token，先进行 `admin_check_access()` 极简只读当前资格检查（`platform_admins.active` 且未 blocked），成功才进入管理后台。
3. **会话期间**：当前有效、仍为 `aal2` 的 JWT 通过 SDK 正常刷新/轮换后继续使用；**一般管理读写不应另外请求 MFA 服务、不应反复弹 TOTP**。如果刷新后的实际 token 降级到 `aal1`、因子失效、新登录或会话不再满足要求，则重新引导 TOTP 并 fail closed，而不是推测一定能永久保持 `aal2`。
4. **每次管理数据请求**：React-admin Data Provider 直接携当前 JWT 请求 RLS 保护的最小字段；管理 RPC 在**这一次数据库事务**内同时检查 token `aal2`、当前管理员名册/blocked、对象操作权限与锁/审计；不先为每条普通业务读/写再单独执行 `getUser()`、MFA network verify 或远程 `admin_check_access`。
5. **UI 路由与资格新鲜度**：`authProvider.checkAuth/canAccess` 为导航提示；第一次 `aal2` 后可缓存**短期非权威的 UI 资格**（如 30～60 秒仅是**待测技术候选**），重复导航读取缓存。登出、切换账号、JWT `aal` 变化、401/403、服务端撤销反馈立即失效；高风险 RPC **不能相信 UI 缓存**。不要把 UI 缓存作为 RLS/管理写准入结果。
6. **真实管理员身份与恢复**：U05 已决定由项目所有者本人日常运营，备用人员/恢复身份仍未明确；MVP 必须提供**受控因素注册/因素重置与失去设备的恢复演练流程**，不把“有两名管理员”误写成真实已就位，也不把恢复口令/种子/二维码储存在仓库、日志或公共用户数据库。首位管理员受控 bootstrap，不能用户公开自封。
7. **Auth Admin Edge 是例外**：只读 `admin-user-lookup` 仍必须使用原 JWT 在服务器上核验签名/`aal2`、再调用当前资格 RPC，**然后**才以服务端密钥访问 Supabase Auth Admin。前端可只有一次 Edge HTTP，但 Edge 内部仍需要这项**跨服务**可信资格检查；不能为了省一次服务器调用削弱 F04。

### 4.2 默认不强制普通用户 TOTP MFA

首发公众账号只需邮箱密码、确认邮件及找回；**TOTP MFA 的 MVP 必做范围明确是内部 Admin**。用户后续如要求为所有普通用户提供 MFA，再按独立功能决策，不把当前需求扩大成 50,000 个用户都需设置验证器。

### 4.3 Admin 测试矩阵（全部 NOT RUN）

| Case | 实际应验证 | 通过标准 | 当前状态 |
| --- | --- | --- | --- |
| **AUTH-P01** | 两个 SaaS 及 Aisenlens SDK 登录/刷新、UI 多次读取 session | 同用户同项目身份一致；导航/按钮不反复调用 `getUser()`；Refresh 仅在必要时发生 | NOT RUN |
| **AUTH-P02** | 匿名 Free 无网启动/使用，切换账号及离线后恢复联网 | Free 立即可用/不请求 Auth/RPC，用户快照不串号 | NOT RUN |
| **AUTH-P03** | Aisenlens 进入 Pro/重复点击 3 个功能、重复导航、窗口后台闲置 | 按需触发，single-flight；**不发生固定 15 分钟后台权益轮询**；重复导航不触发 3 次独立 RPC | NOT RUN |
| **AUTH-P04** | 登录/退出/兑换/成员 suspended/blocked/套餐失效、15 分钟候选临界 | 缓存及时失效，新可信准入不被历史快照覆盖；异常 503 不能显示为被禁用 | NOT RUN |
| **AUTH-P05** | 请求新 R2 intent、complete、download，而客户端 Pro 快照显示 allowed | 可信产品服务端仍逐次检查本人/对象/额度/当前权益；失权时无新预签；旧已签 URL 残余 TTL 另实测 | NOT RUN |
| **AUTH-P06** | 未设置 TOTP 的管理员以 `aal1` 进入 Admin | 只能 enroll/challenge/verify，不泄露管理数据/不能发码 | NOT RUN |
| **AUTH-P07** | 完成一次 TOTP 后用新 `aal2` JWT 访问列表/发码/保存套餐并重复导航 | **不重复挑战/不重复 Auth getUser 远程请求**；管理读写单个业务请求内部检查 JWT/RLS/RPC | NOT RUN |
| **AUTH-P08** | `aal2` 刷新、关闭/重开窗口、新设备、因子解除、会话终止 | 实际 SDK 保持/降级 AAL 的行为记录；需要时重新挑战；绝无 UI 缓存绕过后端管理限制 | NOT RUN |
| **AUTH-P09** | 仍有原 JWT 的 admin 被 revoke/block，UI 缓存仍显示 admin | 下一次查询/写操作拒绝；缓存 401/403 即失效；Edge 高权操作零越权请求 | NOT RUN |
| **AUTH-P10** | Auth Admin Edge 查询账号与普通管理列表 | 普通数据列表无需额外 Auth RPC；Edge 必须先验 JWT/`aal2`/实时资格，未授权 Auth Admin 请求 0 次 | NOT RUN |
| **AUTH-P11** | 设备丢失/TOTP factor 无法访问/管理员恢复 | 按批准的受控恢复手册真实演练；恢复不绕过最终管理员保底 M1，秘密不入日志 | NOT RUN |
| **AUTH-P12** | 100、1,000 用户不同登录和 Pro 使用模式/区域与真实免费实例负载 | 汇总独立 MAU、Auth RPC、DB RPC、Edge、流量与 P50/P95；失败/节流受控，不伪报免费可持续承诺 | NOT RUN |

### 4.4 真正的性能/体验验收（**不是已测量数据**）

| 指标 | 设计目标/测法 | 不应误称 |
| --- | --- | --- |
| 普通 Pro 查询 | **候选目标**：真实客户端 end-to-end P50 ≤300ms、P95 ≤800ms；DB 单次 SQL P95 候选 ≤20ms。以实际地区/设备测量并修订 | 不是 Supabase Free 官方保证 |
| Admin 普通列表 | **一次主要业务 HTTP** 取得数据和同请求内权限检查；正常不另行访问 MFA/Auth | 不保证一次 DB 内部 SQL 查询或不做 RLS |
| Admin 管理写 | **一次业务 RPC**完成资格校验、锁、写入、审计；不是“先 checkAuth API 再写”串行两请求 | 高风险 Auth Admin Edge 自身有额外可信查询 |
| Pro 调用消耗 | 比较固定 15 分钟轮询 vs 按需/去重，按 **Auth/DB/Edge/带宽/CPU** 分项计数；与 MAU 独立 | 只按 HTTP 数量推断全部免费资源 |
| MFA 打扰次数 | 会话有效期间普通表格/发码/分页 TOTP challenge/verify **0 次**；新登录/降级/过期按官方策略进行 | 不能预先保证所有设备/无限期不需重新验证 |
| 撤权延迟 | 记录客户端 UI 缓存最坏窗口，证明**服务端管理和 R2 权限不依赖该缓存** | 不能承诺本地离线 Pro 可在毫秒内被立即切断 |
| RLS 成本 | 测 pg 语句执行计划、列/过滤索引，正确适用 `(select auth.uid())` 等不随行变化的 helper 仅评估一次；不跳过授权 | 只有真实数据库查询计划能证明性能 |

**官方预算数据与真实持续运营**：评测时按当前 Supabase Plan Usage 记录 MAU、CPU/DB、带宽与 Edge 额度以及 R2 费用，避免免费实例暂停和无自动 DB 备份等上线风险；**正式公开运营前需要批准公共业务数据库的真实备份/恢复策略**。

## 5. 接口/实现切分与文档变更边界

- **可直接采用的实现要求**：客户端不逐个点击 `getUser`，会话由 SDK 维护、Pro 按需复核、Admin TOTP 属 MVP、Admin 普通请求内 RLS/RPC 复核、R2 严格可信授权、记录真实性能。**这些不需新平台业务表**。
- **需要在 D2 真正 SQL 编码前独立冻结的候选**：是否增加只读聚合权益响应及其名称/字段类型。不能只凭本文 JSON 假定已获得新公共 API 业务批准。
- **不能被此性能设计修改的业务**：M1 最后管理员、M2 套餐冻结、M3 一次性码明文、M4 兑换优先、M5 `check_access` 200/401/503；F01 public INVOKER/private definer，F02 全事务锁序，F03 R2 final 私有对象，F04 Auth Admin 双层授权；普通用户不强制 TOTP。
- **用户仍待决**：U05 管理员账户恢复责任/第二主体、U04 具体 features/limits、U09 白名单 schema、U10 版本留存、U11 **缓存仍新鲜但离线时新本地 Pro 启动策略**，真实公开域名/SMTP 等。
- **后续执行**：MVP 编码阶段加入 AUTH-P01～P12 回归与真实 P50/P95/请求计数、MFA 设备恢复演练；先有用户独立开发授权、真实 SDK/pg/PostgREST/Edge/R2 版本锁与测试环境，再运行取证。没有运行前应保持 **NOT RUN**。
- **性能审查补充**：真正高负载风险优先通过 PostgreSQL 执行计划、过滤索引、RLS 行扫描与当前账户/产品/成员查找优化解决；按需 Pro 快照不能代替服务端现行授权，Redis 不作为 MVP 先决依赖。**未来**如新增可扣次数，必须在可信端验证正数成本、属主、额度预留、请求幂等和回滚，避免直接复制公开 `SECURITY DEFINER` 负数扣余额示例；参见[BAAS-Q01～Q10 专项评审](./aisencore-mvp-baas-quota-security-lessons.md)。

## 6. 官方依据（2026-10-22 公开资料检查，未访问实际项目）

- [Supabase JS getSession](https://supabase.com/docs/reference/javascript/auth-getsession)：会话存储读取、必要时刷新；来自不可信存储的 session 不能代替可信验签。
- [Supabase JS getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims)：非对称 JWT 可用可缓存 JWKS 验签；对称签名方式通常向 Auth 请求。
- [Supabase JS getUser](https://supabase.com/docs/reference/javascript/auth-getuser)：每次调用请求 Auth 用户服务。
- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)：TOTP enroll/challenge/verify 和 `aal1/aal2` JWT，RLS 能直接检查 `aal`。
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)：索引、只对固定身份求值一次的 `(select auth.uid())`/受控函数优化。
- [Supabase Sessions](https://supabase.com/docs/guides/auth/sessions)：刷新和会话撤销窗口；实际 refresh/AAL 行为需按版本验证。
- [Supabase Pricing](https://supabase.com/pricing)：额度可变，以运行时 Project 计划和 usage 为准，不将额度表当成永久产品规则。

**仅设计文档，无已部署认证流程、无性能测量、无真实免费额度使用记录。**
