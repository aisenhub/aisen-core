# D4｜43 项分层测试规格、跨 D0～D3 评审及正式开发就绪结论

> **用户批准 DEC-01～06 A 后增补的运行验收（全部 NOT RUN）**：REV-DEC01-01～08 测左/suspended 先于码探测、跨产品码、旧单参禁用、失败计数/码次数不越界；REV-DEC02-01～08 测 Edge 限体/白名单 JSON、安全 R2 final 条件写、DB pending/ready/孤儿/删除补偿、无客户端写 final；REV-DEC03 测 G0A 四类真实高保真/用户签收、G0B 原型、G3 浏览器多宽度/E2E；REV-DEC04 测 Free v1→v2 指针、现有/新用户下次计算、旧 grant/code 不变、无指针安全默认、回滚审计；REV-DEC05 测双模式互斥/NULL/永久/UTC/同键同参与异参竞争；REV-DEC06 测只读 SQL Auth 最小权限/aal2/分页/UUID 数/性能、失败 Edge 批量回退及缺邮箱降级。**方案批准不是以上任何一项 PASS**，继续遵循[API 验收权威](../../architecture/backend/api-contract-and-mvp-acceptance.md)和[决策记录](../20261022-review-remediation/owner-batch-decisions.md)。

> **阶段性质：设计与静态审查，不是已经执行的测试。** 本文件承接已完成设计阶段的测试规格、风险台账与未验证门槛，执行清单按 Plans 规则清理。本报告中所有案例统一为 **NOT RUN**；本阶段只执行了文档一致性与工作区静态检查。业务预期仅源自 [API 逻辑验收唯一权威](../../architecture/backend/api-contract-and-mvp-acceptance.md)、[现行需求](../../spec/requirements.md) 与已批准[领域/技术架构](../../architecture/README.md)，绝不把候选实现写成已通过。
>
> 设计输入：[D0 范围/用户决策](./aisencore-mvp-d0-scope-and-baseline.md)、[D1 物理数据库/可信事务](./aisencore-mvp-d1-database-implementation-design.md)、[D2 API/Auth/Aisenlens](./aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)、[D3 Admin/环境与 R2](./aisencore-mvp-d3-admin-infrastructure-design.md)。
>
> **后续第三方 BaaS 建议安全审查（2026-10-22）**：已形成 [原子配额/RPC/JWT/Redis 适用性评审](./aisencore-mvp-baas-quota-security-lessons.md)，新增 **BAAS-Q01～Q10 共 10 项未来负向/性能测试候选**（其中消费型额度用例只在业务真实引入时触发），均 **NOT RUN**。严禁把外部 `public SECURITY DEFINER` 的负数扣余额示例部署生产，也不把动态 Pro/blocked 放进 JWT 作当前权威；原 **55 项 I/R/A** 和后续 **12 项 AUTH-P** 均保留 NOT RUN。
>
> **新增 D3-UI 阶段追踪（2026-10-22）**：原 D4 在 D3 Resource/Provider 技术设计之后完成，**当时尚未包含真实 Admin 页面布局/线框/无障碍规格**。用户已批准并形成 [D3-UI 页面详细设计](./aisencore-mvp-d3-ui-admin-uiux-design.md)，列出 **D3-UI-X01～X18 共 18 条新的 UI/安全/可访问性/响应式验收**，全部 **NOT RUN**。该增量不改写已形成的 D4 原 I/R/A **55 项**，也不把历史 D4 误称为已评审后来新增的全部 UI，真实前端 MVP 必须未来另行实现并 E2E 留证。
>
> **UI-G0 新增正式编码前硬关口（2026-10-22）**：根据用户最新决定，已形成 [UI-G0 全局设计系统权威](../../architecture/applications/admin-ui-design-system.md)。必须先统一 MUI 主题/字号/间距/布局/组件，并产出**四类可见的高保真基准页、宽窄屏评估及用户显式视觉签收**，才可把 `UI-G0` 设为 `APPROVED` 释放 Admin 前端正式编码。现仅有设计规范正文，**G01～G12 均 NOT RUN、UI-G0 NOT APPROVED / BLOCKED**；之后仍须执行 D3-UI-X01～X18 的真实浏览器截图/无障碍/权限 E2E。此补订不改变历史 D4 原 55 项、AUTH 12、BAAS 10 的 NOT RUN 状态。
>
> **设计规则迁移与 UI 验收细化（2026-10-22）**：用户提供的临时设计副本中的通用 `rules` 原则现经 [Admin 规则索引](../../development/frontend/admin-design-rules.md)与 [真实页面验证矩阵](../../development/frontend/admin-design-verification.md) 专门适配，**62 条原 ID（其中 3 条条件适用）不是新增 62 项 E2E 测试或已运行的自动化 gate**。其字体混排、列表返回/草稿、一次明文 UNKNOWN、动态视口/局部滚动、焦点/可访问性作为原 D3-UI-X01～X18 和 UI-G0-G01～G12 的**补充判据**，旧用例状态一律 NOT RUN。原项目脚本/CI 和先前运行记录不作为 AisenCore 测试证据。

## 1. 分层模型、风险等级与执行顺序

| 测试层 | 测什么 | 建议工具/可记录证据 | 与上下层依赖 |
| --- | --- | --- | --- |
| L0 — 静态契约/安全检查 | SQL 脚本迁移顺序、函数 EXECUTE、代码/锁文件、秘密扫描、API schemas、JSON schema | SQL lint/迁移审查、静态源检查、类型检查、测试清单 | 真实 SQL/源码尚不存在，因此只能设计检查 |
| L1 — PostgreSQL 物理约束 | PK/FK/UNIQUE/CHECK/NULL、授权冻结和码计数边界 | pgTAP 或等价 SQL 断言，迁移后结构目录快照 | 隔离 PostgreSQL/Supabase 测试库 |
| L2 — RLS/GRANT/真实身份 | `anon`、用户 A/B、`aal1`、`aal2`、已撤管理员、哈希列权限、RPC EXECUTE/函数 owner | 使用**真实签名** JWT/数据库/HTTP 双重负向请求，记录授权矩阵 | L1 和 Auth 测试环境 |
| L3 — 单事务 RPC + 真并发 | 成员事件一致性、撤权、码计数/批次幂等、grant 时段、审计故障注入、事务/锁重入 | 两条独立真实 DB 连接+屏障、事务轨迹/lock wait/SQLSTATE | L1、L2 |
| L4 — PostgREST/Auth/Edge 协议 | 200 可信 deny、401/403/409/503、JWT/MFA、Auth Admin Edge 不泄密、错误 JSON/重试 | HTTP contract tests/SDK 调用，auth event 与 request ID | L1～L3 |
| L5 — React-admin UI | 登录/MFA、Resource/列白名单、分页、只读/管理 RPC、首次明文一次性展示和 UX 错误处理 | 可重放 E2E 与网络日志（脱敏）、存储/console 检查 | L2～L4 |
| L6 — Aisenlens 本地优先/R2 | 匿名 Free 离线、在线权益、R2 私有 intent/PUT/HEAD/complete/list/GET/delete、恢复、容量/孤儿修复 | 隔离桶+假数据；请求/元数据/对象校验，**无真实视频或秘密** | L1～L4，U04/U09～U11 确认后才冻结预期 |
| L7 — 工程/发布/故障恢复 | 构建、Dev/Staging/Prod 严格隔离、回滚、迁移从空库恢复、数据库/R2 配对恢复、告警 | CI 退出码、版本锁、变更审批、恢复演练与审计 | 已完成 L1～L6 最低验收与用户部署批准 |

**先后顺序**：先迁移/约束/权限（L1/L2），随后 RPC 负向与双事务并发（L3），再 Auth/HTTP（L4），最后 UI/R2（L5/L6）与发布恢复（L7）。可在 CI 中并行执行相互隔离的 case，但**不得**用纯 mock 的 PASS 替代真实 JWT/数据库事务或对象存储验证。

**风险优先级**：P0 代表生产安全或核心授权/交易完整性阻断，任何失败都阻断相关开发集成与正式发布；P1 是关键功能/边界行为，不可上线而未覆盖；P2 是体验及非关键扩展。阶段用例按预计风险而非执行进度标记。

## 2. 独立测试环境、造数与证据记录

**隔离测试对象**：三个模拟用户 `A`、`B`、`C`（各独立 Supabase Auth ID 与真实测试 JWT）；两名以上管理员 `M1`、`M2`（TOTP/`aal2`）及仅 `aal1` 与普通用户对照组；至少两个已启用产品 `P`、`Q`（包含本地优先 Aisenlens 的隔离产品 Key），另设 `draft/suspended` 产品；存在 active/left/suspended 的独立成员、基础 Free、周期/永久 plan、未冻结与被 grant/码冻结版本、不同发行/使用/撤销状态的码及批次、测试 R2 私有桶中的允许配置样本。**不能**使用真实邮箱、个人备份、支付或真实客户兑换码；测试 Secret 仅用隔离环境秘密管理。

**可重复造数**：为测试建立命名空间和独立 `request_id`；UTC 可控逻辑时间（冻结时钟/数据库可测试时钟方案须审查是否削弱生产时钟信任），15 分钟限流边缘点涵盖恰好阈值、刚过窗口、同用户并发；两连接用同步屏障保证窗口真正重叠，不以顺序循环代替并发；大量重复请求/故障注入后核对数据库事实与审计。R2 用不同用户/环境的随机 key，必要时测试两个重放的 PUT 与已 ready 内容是否一致。

**数据安全**：测试账号不具备真实生产权限，样本文件严格白名单，不包含视频、项目业务数据、AI 结果/API Key；测试日志记录请求 ID/执行顺序/响应码，但**不记录** JWT、refresh token、验证码、明文码、签名 URL、哈希值、R2 密钥。失败工单和 CI artifacts 均脱敏；完成后清理测试资源，保留匿名化证据及所需最小哈希/计数差异。

**每条未来结果的证据模板**：`case_id`、`run_id`、`commit_sha`、`environment`、`Supabase/PostgreSQL/PostgREST/Edge/SDK/R2 version`、`test_actor_classes`、`precondition_fixture`、`start/stop`、`request_id(s)`、`steps`、`asserted_expected/observed`、`SQLSTATE/HTTP + JSON`、`DB before/after counts`、`lock/trace references`、`status`、`defect_id`、`reviewer`。没有任何真实记录时状态必须 **NOT RUN**，不能把书面预期写进 observed。

**状态字典**：DESIGNED=只定义场景；NOT RUN=未实际执行；PASS=真实结果通过且具备足够证据；FAIL=有真实失败与证据；BLOCKED=测试依赖缺失/政策未定，不能执行；SKIPPED=批准后有明确例外与复验期限。**当前 43/43 测试均只设计，执行状态 NOT RUN**；R2 补充用例也未运行。

## 3. I-01～I-28：身份、成员、管理、准入测试逐案设计

说明：每一行均定义**初始数据/刺激**、**应满足的断言**、最少证据与主要层次。实际脚本实现者需在对应层补充断言 SQL/API 调用，不能更改逻辑权威的原始预期。

| Case | 主测试层 | 前提与步骤/故障刺激 | 必须断言的结果 | 最少执行证据 | 优先级 | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- |
| I-01 | Auth+RLS | 注册/登录账号 A，仅列产品；无成员 | A 无成员行；无 join 事件；公开产品仅 active | Auth 流、成员表快照、事件计数 | P1 | NOT RUN |
| I-02 | API+RPC | 云端业务模拟以 A JWT 首次请求 active 产品 | 确保唯一 active 成员；只产生一次 join；行为需真实业务触发 | RPC 响应、JWT 主体、事务快照 | P1 | NOT RUN |
| I-03 | 桌面 E2E | 无登录、无网络启动 Aisenlens 匿名 Free | 本地 Free 可运行且未发 Auth/公共 API 请求、无成员 | 网络抓包、客户端状态、成员计数 | P0 | NOT RUN |
| I-04 | 桌面+Auth+RPC | 首次 Pro/主动备份时登录 A，需合法触发 | 本人 JWT 加入后按在线准入，不发生额外跨产品成员 | 请求链、JWT 身份、成员记录 | P0 | NOT RUN |
| I-05 | 并发 SQL/RPC | A 两个独立会话同一 product 同时 ensure，屏障放行 | 一条成员、一次 join、另一响应 created=false | 两个事务轨迹、唯一键/事件计数 | P0 | NOT RUN |
| I-06 | RPC+集成 | 已有 left 的 A 再登录、只读、支付模拟或 ensure | 始终 left，无重加事件、无自动权益重置 | 状态前后快照、RPC 返回 | P0 | NOT RUN |
| I-07 | RPC+领域 | A left→本人显式 rejoin | 原成员 id/joined_at 保留，status active；不重置历史 Pro | 成员/授权历史、事件快照 | P1 | NOT RUN |
| I-08 | SQL+RPC | active→admin suspend→restore | 恢复 active；已过期授权不复活 | 成员事件及 grant 时间 | P1 | NOT RUN |
| I-09 | SQL+RPC | left→admin suspend→restore | 恢复 left，不能视为自动 rejoin | pre_suspend_status、事件序列 | P0 | NOT RUN |
| I-10 | 并发 RPC | 重复 suspend 与旧请求和 restore 交错 | 不改写首次 pre_suspend_status，旧请求不得越权解封 | 屏障事务记录、审计/事件 | P0 | NOT RUN |
| I-11 | RPC+产品 | Admin 将 active 产品暂停后调用 ensure/check | 新受保护操作拒绝；成员、grant 历史未批量变动 | 产品状态、成员/grant 差异 | P0 | NOT RUN |
| I-12 | RPC+权益 | 产品从 suspended 恢复，含 left/suspended/到期账户 | 仅恢复产品，不恢复成员或过期权益 | CheckAccess 与历史快照 | P1 | NOT RUN |
| I-13 | RLS+API | 以 A JWT 查 B 成员、授权、管理审计及探测 UUID | 不可读他人/审计；不能通过过滤/排序侧信道泄露 | HTTP/SQLSTATE、负向查询记录 | P0 | NOT RUN |
| I-14 | GRANT+RLS | anon/authenticated 尝试 INSERT/UPDATE/DELETE 敏感表和调用未授权 RPC | 全部拒绝且数据未变；含 role/FUNCTION EXECUTE 检验 | GRANT 快照、HTTP/SQLSTATE | P0 | NOT RUN |
| I-15 | 故障注入 SQL | 关键状态更新后强制成员事件或 admin audit INSERT 失败 | 所有业务变更回滚，没有部分成功 | 事务前后差异/回滚证据 | P0 | NOT RUN |
| I-16 | Auth+RPC | A JWT 未过期但成员已被产品管理员封禁 | 新的受保护操作拒绝，不信 UI 缓存 | 可信 RPC、前端提示记录 | P0 | NOT RUN |
| I-17 | RPC+多产品 | A 在产品 P 被封禁，产品 Q 正常且有权益 | P deny、Q 仍 allowed，权益不跨产品 | 双产品查询快照 | P0 | NOT RUN |
| I-18 | HTTP+RPC | 全局 blocked 用户查询两个产品/ensure/兑换 | CheckAccess 均 200 allowed=false ACCOUNT_RESTRICTED；普通写拒绝；兑换 200 ok=false ACCOUNT_RESTRICTED；解除仍保留原成员状态 | HTTP 状态与 JSON、前后状态 | P0 | NOT RUN |
| I-19 | E2E+Edge | 本地缓存 Pro，但 grant 已到期/撤销，再请求云保护操作 | 服务端拒绝新 Pro/R2 签发；保留正常 Free | 状态与实际服务端判定、签名未发 | P0 | NOT RUN |
| I-20 | 产品 ACL | A 有有效 Pro 却访问 B 的项目或私有文件 | Aisenlens 所有权检查 403；公共 allowed 不替代文件 ACL | 不同 owner 的对象/元数据请求 | P0 | NOT RUN |
| I-21 | 容错集成 | 故障注入公共 CheckAccess 超时/503 | 新云端业务和新签名 fail-closed；提示不可验证非 blocked | 模拟故障、HTTP、无新对象 | P0 | NOT RUN |
| I-22 | 跨系统事务 | 公共 ensure 已提交，产品业务库初始化失败 | 成员保留，产品业务可幂等重试；不假装跨库事务 | 前后两库状态、重试 trace | P1 | NOT RUN |
| I-23 | Auth E2E | 未确认邮件/密码找回/恶意 redirect/错误回调 | 无合格受保护会话；无隐式加入；回调被白名单拒绝 | Auth SDK 事件、回调、成员快照 | P0 | NOT RUN |
| I-24 | Auth 多应用 | 产品 A local logout，同时产品 B 有独立会话 | B 会话仍有效，A 本地会话失效 | 两个隔离客户端状态 | P1 | NOT RUN |
| I-25 | 账户流程 | 用户走人工渠道请求注销，先限制账号 | 只记录可证明已处理的动作；不虚称跨产品数据均删除 | 处理工单、审计、备份清单 | P1 | NOT RUN |
| I-26 | Auth+RLS+UI | 管理员未完成 TOTP/失去 admin/被 blocked | 管理 SELECT 与 RPC 均拒绝；UI 不可代授权 | JWT aal、管理查询与写入状态 | P0 | NOT RUN |
| I-27 | 双事务并发 | 仅剩最后一 admin 自封禁/撤权；两 admin 并发相互操作 | 合格管理员数始终≥1，失败 STATE_CONFLICT 且无状态/管理审计改动 | 并发屏障、资格集合、日志 | P0 | NOT RUN |
| I-28 | HTTP 契约 | 缺成员/left/suspended/产品暂停/权益不足/blocked 与坏 JWT/DB 故障 | 可信 deny = HTTP200 allowed=false reason；坏 JWT=401；不能计算=503；不得伪造允许或拒绝 | HTTP/JSON 全状态组合 | P0 | NOT RUN |

## 4. R-01～R-15：兑换、时段、幂等与冻结测试逐案设计

| Case | 主测试层 | 前提与步骤/故障刺激 | 必须断言的结果 | 最少执行证据 | 优先级 | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | RPC+DB+Admin | aal2 管理员发一批码并截取首响应 | 只存不可逆 hash；首次明文仅当次响应；管理审计同事务 | DB 列投影、流量/日志脱敏 | P0 | NOT RUN |
| R-02 | RPC+SQL | 未入会 A 兑换有效码 | 同一提交出现 active/join、grant、redemption、码计数+1 | 事务快照与事件 | P0 | NOT RUN |
| R-03 | RPC 负向 | left 或 suspended 的 A 兑换可用码 | 拒绝，不创建授权或增码次数/成员恢复 | 前后四表差异、返回码 | P0 | NOT RUN |
| R-04 | 双事务并发 | A/B 同时争抢仅剩一次的码 | 仅一笔 grant/redemption；redeemed_count≤max | 屏障日志、唯一/计数 | P0 | NOT RUN |
| R-05 | RPC 幂等 | A 已兑同一码；码之后过期、用尽或撤销再次提交 | 优先 REDEEM_ALREADY_USED；无重复 grant、无额外失败计数 | 码与兑换历史、限流差异 | P0 | NOT RUN |
| R-06 | RPC 防枚举 | 新用户对不存在/撤销/到期/耗尽码 | 统一 REDEEM_CODE_INVALID、200 ok=false；无副作用但保留失败计数 | HTTP/JSON、一致性查询 | P0 | NOT RUN |
| R-07 | RPC 时段 | 已有未撤销未来周期权益，再兑同套餐周期码 | 新 starts_at 取最新未来 ends_at；无重叠 | 区间对比、数据库时间 | P0 | NOT RUN |
| R-08 | RPC+查询 | 兑永久授权并进行准入及撤销后查询 | ends_at NULL；撤销前可用，撤销后按当前权益算 | grant 与 CheckAccess 响应 | P1 | NOT RUN |
| R-09 | RPC 撤销 | 一码兑成功后撤码，随后单独撤 grant | 撤码不影响历史授权；撤 grant 后相关能力被拒绝 | 码/grant/准入快照 | P0 | NOT RUN |
| R-10 | 跨产品 | 产品 P 的码给 A，查询 Q 的权益 | 仅 P 授权，Q 权益、成员未变 | 复合 FK 与两产品响应 | P0 | NOT RUN |
| R-11 | 限流+时间 | 同 A 于 15 分钟窗口连续输错至少 10 次，窗口推进 | 达到阈值再请求 RATE_LIMITED（HTTP 200 ok=false），计数事务持久；窗口清理后恢复 | 时间控制、rate_limits 状态、HTTP | P0 | NOT RUN |
| R-12 | 幂等+Admin | 创建批次成功丢首响应，重试同 request_id 和改变 config | 原码不变且不回显明文；冲突配置报冲突；撤批+新 id 可重新发码 | 批次数量、哈希数、日志/UI | P0 | NOT RUN |
| R-13 | 双事务并发 | 同 A 同套餐同时兑换两张不同周期码 | 序列化按最新授权末期续期、无重叠，且两笔仅各一次 | 锁等待/时段排序/死锁检测 | P0 | NOT RUN |
| R-14 | 并发+计划冻结 | 已有 grant 或任何已发行 code（未兑/撤销）后改 features/limits；再与发行交错 | 不可原地修改，必须新 plan_key；并发无竞态；状态不部分提交 | plans/grants/codes 快照、锁轨迹 | P0 | NOT RUN |
| R-15 | RPC+计划停用 | 码发行后停用 plan，兑换旧有效码；再尝试新发/直接授予 | 旧码可兑，新码/新直接授予拒绝；显式撤码才阻断旧码 | plan/批次/grant/HTTP 变化 | P0 | NOT RUN |

## 5. Aisenlens 私有 R2 备份追加测试（不改原 43 项）

| 补充 ID | 层级/刺激 | 必须断言 | 未来取证 | 当前状态 |
| --- | --- | --- | --- | --- |
| A-01 | L6 匿名本地 Free、断网/无公共账号启动 | 本地 Free 不依赖登录/任何公共网络，也不产生 AisenCore 成员 | 网络抓包/本地 UI/DB | NOT RUN |
| A-02 | L4/L6 left/suspended/blocked/产品暂停/过期权益或公共准入 503 请求新 PUT/GET | 不发新签名，不能泄露他人资源；503 不报成 blocked | 签发日志（无 URL）、元数据 | NOT RUN |
| A-03 | L4/L6 A 获取 B 的 backup_id/object_key、以不同产品身份重放 | 资源属主/产品检查拒绝，新/已存在的对象不泄露 | 两个 JWT、403、R2/元数据不变 | NOT RUN |
| A-04 | L6 同用户双设备同时申请满额 intent 或绕过估计大小 | 可信端按 ready+reserved 原子核算；不能超额 ready；失败预留释放 | 两连接事务/余额与对象大小 | NOT RUN |
| A-05 | L6 签发 URL 过期、泄漏与重复 PUT、用户被封禁后仍持原短 URL | 过期拒绝，URL 重放窗口有界且**不得覆盖已 ready 内容**；封禁阻止新签发，不能虚称旧 URL 瞬时撤销 | HTTP/R2 对象版本/TTL 时间线 | NOT RUN |
| A-06 | L6 PUT 成功但 DB complete/HEAD 超时、响应丢失、重复 complete | 非 ready 对象不出现在用户备份清单；请求幂等不重复计费；补偿清理最终收敛 | pending/ready 状态与对象清单 | NOT RUN |
| A-07 | L6 上传故意错误格式、禁止的秘密/配置字段 | 服务端确认路径与客户端字段白名单阻止**承认为合规 ready**；HEAD 只看元数据不能证明内容不含秘密 | 合成内容、白名单校验、HEAD/下载校验 | NOT RUN |
| A-08 | L6 故意删除单对象、损坏、R2/DB 只恢复一侧 | 清单不得静默指向不可恢复内容，修复/孤儿流程可诊断并按政策处理 | R2 与元数据对账/恢复演练 | NOT RUN |
| A-09 | L6 恢复覆盖/合并、多设备更新、兼容版本转换 | **U10 决策后**锁定期望；此前不把任何静默覆盖行为视为通过 | 产品选择、快照、UI 确认 | NOT RUN |
| A-10 | L6 本地 Pro 网络中断/切换权益/长任务 | **U11 决策后**固定继续/中止/宽限期预期；新云端签名仍一律在线 | 客户端状态机与授权日志 | NOT RUN |
| A-11 | L6 删除备份、退出产品、账号注销的不同触发 | 退出不自动删，注销按 **U07** 已批准流程；确认元数据/R2 清理/额度回收一致 | 审计、对象/元数据前后差异 | NOT RUN |
| A-12 | L6 浏览器/桌面/Pages 构建/日志注入环境秘密 | 无长期 R2/服务端 Supabase Secret、JWT 或带签名 URL 在静态产物、日志及遥测 | 构建制品脱敏扫描、权限审查 | NOT RUN |

## 6. M1～M5 重点跨阶段威胁模型与故障注入

| 规则 | 对抗性排程/注入 | 需要共同成立的 DB/API/UI 断言 | 开发前必须确认 |
| --- | --- | --- | --- |
| **M1 最后合格管理员** | M1 自撤权；两个 admin 事务同时 `BlockAccount`/`RevokeAdmin`；另从 Edge/Auth Admin 尝试绕过 | 所有入口共用保底事务锁，提交后的 `active且未blocked` 人数≥1；失败 409 `STATE_CONFLICT` 且无错误管理审计；MFA `aal1` 不能读/写 | DB 锁真正串行、Auth 外部禁用不得破坏保底、受控恢复责任 U05 |
| **M2 套餐冻结** | T1 发码/授予并暂停；T2 修改同 plan 权益；先发行后停用/撤码 | 任何历史 grant 或码引用后 features/limits/plan_key 原地更新不可提交；竞争结果串行，停用后旧有效码仍可兑 | 产品行与 plan 行锁是否覆盖全部写入入口；产品内 capability 分类跨版本一致 |
| **M3 明文一次** | T1 DB 已提交但首次 HTTP 响应丢失；相同 request_id 配置相同/不同并发重试；管理员页切换 | 只有首成功响应允许明文，DB 只留 hash；重放空码清单；参数差异冲突；UI 内存清除，日志/浏览器存储不泄密 | 批次唯一键/指纹/事务、服务端日志/网络反向扫描、重放不重新生成 |
| **M4 本人重复兑换优先** | 码已由 A 兑，之后用尽/过期/撤销；A 再兑、B 首次兑；A 同套餐两码并行 | A 在身份/blocked/限流通过后必得 `REDEEM_ALREADY_USED` 且不增加失败计数；B 统一无效；唯一 grant，续期不重叠；业务拒绝 200 提交失败计数 | 码锁与同用户/plan 续期锁顺序、并发真实屏障；业务拒绝不能抛导致回滚的异常 |
| **M5 CheckAccess 三分** | 本人 JWT 有效但 left/blocked/产品暂停/缺权益；JWT 无效；真实 DB/网络故障 | 可信业务拒绝 200 allowed=false + reason；无效 JWT 401；无法计算 503；R2 新签名及 SaaS 高风险操作 fail closed，UI 区分不可验证与被封禁 | PostgREST SQLSTATE/HTTP 对照真实部署版本、Edge JWT 验签、客户端失效路径 |

### 6.1 静态交叉评审发现的问题与风险台账

**以下是实施候选的风险/冲突，不是对现行已批准业务语义的修改；必须在真实编码涉及相应组件前消除。**

| 编号 | 严重性 / 归属 | 设计风险和证据 | 开工前的修复/验证关口 |
| --- | --- | --- | --- |
| **F01** | **P0 / D1+D2 数据库安全负责人** | 原 D1/D2 候选的 exposed `public SECURITY DEFINER` 存在扩权面风险；默认函数 PUBLIC EXECUTE 和所有者 RLS 绕过须防护 | **DESIGN RESOLVED / RUNTIME NOT VERIFIED**：[F01 决议](./aisencore-f01-f04-security-convergence-design.md#2-f01公开普通权限包装层--非暴露的定点扩权内核) 固定 public INVOKER + private 最小 DEFINER；私有 USAGE/EXECUTE 必须授且内核独立鉴权；真实权限、角色/SQLSTATE 仍待隔离测试 |
| **F02** | **P0 / D1+D2 事务负责人** | 原 D1 锁序只有局部描述，redeem 先锁码再取成员可能与其它入口倒序 | **DESIGN RESOLVED / RUNTIME NOT VERIFIED**：[F02 决议](./aisencore-f01-f04-security-convergence-design.md#3-f02唯一事务锁总序与逐操作锁矩阵) 给出 L0～L8 和全入口操作矩阵、LCK-01～07；实际 FK/唯一隐含锁/双连接死锁与时段测试未运行 |
| **F03** | **P0 / D2+D3 R2 实现负责人** | R2 预签 PUT URL 到期前可重用、HEAD 只看元数据，直接拿暂存对象当 ready 会允许覆写 | **DESIGN RESOLVED / RUNTIME NOT VERIFIED**：[F03 双键方案](./aisencore-f01-f04-security-convergence-design.md#4-f03r2-备份对象不可被旧-put-重放改写) 固定 staging PUT → 条件 CopyObject → 可信 final 校验 → ready；R2-01～06/产品字段 U09 的真实证明仍需 |
| **F04** | **P0 / D1+D2 鉴权/API 负责人** | 仅有 MFA 的 UI gate 不保证 Admin Edge 调用 Auth Admin 前用 caller 身份重验真实名单与 blocked | **DESIGN RESOLVED / RUNTIME NOT VERIFIED**：[F04 信任链](./aisencore-f01-f04-security-convergence-design.md#5-f04管理员-totp当前资格与-auth-admin-密钥链) 固定 JWT/`aal2` → 原 JWT 资格 RPC → 最小权限 Auth Admin 查询，ADM-01～06 未运行 |
| **F05** | **P1 / D1+D2 字段契约负责人** | 原 D1/D2 发码有效默认、`request_id` 作用域、直接 grant 参数变更和套餐 NULL/PATCH 未固定 | **DESIGN RESOLVED / RUNTIME NOT VERIFIED**：按 [F05 参数/幂等收敛](./aisencore-f05-f08-contract-compatibility-readiness-design.md#2-f05公共-rpc-精确参数和错误幂等语义) 确定 canonical v1、`(created_by,request_id)`、actor-scoped admin grant `source_ref`+辅助指纹、计划全字段提交；真实 SQL/HTTP/PostgREST 未运行 |
| **F06** | **P1 / D2+D3 产品/运营负责人** | Aisenlens 额度/备份字段/恢复/离线体验需要 U04/U09/U10/U11 的产品政策 | **GATES DEFINED / USER DECISIONS PENDING**：[F06 门槛](./aisencore-f05-f08-contract-compatibility-readiness-design.md#3-f06aisenlens-产品级决策与测试拆分) 已区分固定安全底线和政策后验收；未替用户决定功能键、配额或恢复策略，R2 真实运行仍未验证 |
| **F07** | **P1 / D3 环境与上线负责人** | U03 公众注册、U05 Admin MFA 方向已确认，U06/U07/U08 仍有待定参数，且没有真实 Supabase/Pages/R2 环境、管理员 bootstrap、邮件、回滚与灾备演练 | **GATES DEFINED / USER DECISIONS PENDING**：[F07 环境/运营关口](./aisencore-f05-f08-contract-compatibility-readiness-design.md#4-f07生产环境账号恢复发码运营分段准入) 明确谁决定、何时确认和未来证据；不能视为已可部署 |
| **F08** | **P1 / D1/D2 与 D4 测试负责人** | SQL/ACL、JWT/MFA、PostgREST HTTP、SDK/CLI、R2 的真正服务器和库版本未锁且未测 | **VALIDATION PLAN READY / RUNTIME NOT VERIFIED**：[F08 版本矩阵与 V00～V07](./aisencore-f05-f08-contract-compatibility-readiness-design.md#5-f08实际版本发现兼容矩阵与预执行报告) 已准备；真实版本/依赖锁文件/测试日志未取得，且需验证 Supabase 2026-10-30 显式 GRANT 变更 |

### 6.2 官方参考与未验证边界

本阶段对以下当前官方文档进行了设计风险复核（**不是对用户的 Supabase/Cloudflare 项目进行访问、版本检测或真正测试**）：
- [Supabase 数据库函数及执行权限](https://supabase.com/docs/guides/database/functions)；[Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)：默认 EXECUTE、`SECURITY INVOKER/DEFINER`、固定 search_path、管理员 `aal2` 与 JWT 权限新鲜度。
- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)；[R2 直接上传](https://developers.cloudflare.com/r2/objects/upload-objects/)：GET/PUT 的单对象临时授权、签名 URL 在有效期可被重复使用，权限与配额**不能靠客户端状态**。
- [D1](./aisencore-mvp-d1-database-implementation-design.md)/[D2](./aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)/[D3](./aisencore-mvp-d3-admin-infrastructure-design.md)的候选协议需对照实际 Supabase/PostgREST/CLI/Edge/R2 所用版本再次验证。

**后续安全收敛补记（2026-10-22）**：F01～F04 **设计层**已按 [专题设计](./aisencore-f01-f04-security-convergence-design.md) 收敛并更新 D1/D2/D3 与数据库相关专项，**没有产生真实运行 PASS**。此处保留四项原风险的追踪，但把实现设计的处理结论明确为 DESIGN RESOLVED / RUNTIME NOT VERIFIED；F05～F08 的状态和 U03～U11 决策保持不变。

**F05～F08 进一步收敛（2026-10-22）**：已形成 [F05～F08 契约与验证准备](./aisencore-f05-f08-contract-compatibility-readiness-design.md)，更新 D1/D2/D3 和权益/兑换模型。**F05 仅设计已收敛、F06/F07 用户决定关口已明确但实际政策未决、F08 测试方案已准备但真实版本/运行证据未取得**；F01～F04 原设计收敛状态不变，55 项原测试仍 NOT RUN。

**用户新决议（2026-10-22）**：U03 **公众开放注册已确定**；U04、U06～U11 的产品/运营方向已部分获准，剩余具体额度/字段/邮件/保留、管理员实际备用身份等仍待定。U05 **Admin TOTP MFA 已明确纳入 MVP**，低打扰会话体验仍须实测；始终保留 `aal2` 与实时管理员资格检查，不得降级。详细参见 [U03～U11 当前决议](./aisencore-u03-u11-user-decisions-2026-10-22.md)。本 D4 既有 43+12 场景仍是**设计，全部未实际执行**，完整开发就绪仍 BLOCKED。

**后续用户明确批准 Admin TOTP MFA 纳入 MVP（同日）**：此前的“先不加入频繁 MFA”现转为**会话内低打扰**要求，而不是要取消管理 `aal2`。已形成 [MVP Auth/权益/MFA 低请求量与验收设计](./aisencore-mvp-auth-entitlement-mfa-efficiency-design.md)。新增 AUTH-P01～P12 共 **12 项待执行用例**，用于用户 Auth SDK 网络调用预算、Pro 权益按需复核、R2 实时授权、Admin TOTP 注册登录/刷新/恢复、常规 Data API 单请求内 RLS/资格校验及 P50/P95。**原 I/R 43 项与 A 12 项仍 NOT RUN，新增 12 项亦 NOT RUN，真实可用性/成本/安全并未测试通过**。

## 7. 正式开发就绪检查（设计完整性 ≠ 获准编码/上线）

### 7.1 五种就绪状态

| 工作范围 | 结论 | 原因和下一步 |
| --- | --- | --- |
| **D4 文档测试设计** | **可判 COMPLETED**（以本阶段静态审查通过为条件） | 43 个标准逻辑案例加 R2 追加案例均具有设计条目；不代表任何测试 PASS |
| **产品无关的公共代码工程骨架** | **CONDITIONALLY READY（仅潜在开发准备）** | 设计输入足够起草项目结构/非生产类型定义与测试框架，但**用户尚未授权实际编码**；开发开始前需明确依赖锁定/安全计划，原先的无代码边界持续有效 |
| **D1 数据/RPC 安全核心实现** | **BLOCKED（运行安全尚未验证）** | F01/F02/F04/F05 的**文档合同已收敛**，但真实 PostgreSQL/PostgREST/RLS/OWNER、锁竞态/CLI/SDK 与 F08 测试执行未有证据，仍不可宣称实现安全通过 |
| **Aisenlens + R2 产品端完整功能实现与验收** | **BLOCKED（产品决策和 R2 运行证明不足）** | F03 staging/final 方案及 F06 安全底线已有设计，但 U04/U09/U10/U11 未决，真实 CopyObject/内容校验/配额与不可覆盖仍未实测 |
| **正式上线/环境开放** | **BLOCKED（未达到可部署门槛）** | U03/U05/U06/U07/U08、没有实际实现、环境/迁移/测试/安全恢复演练、没有真实证据和批准 |

**总判定：文档设计可以完成，但 AisenCore MVP“全量正式开发就绪”目前为 `BLOCKED`。** 这不代表不能在未来单独获得授权后先启动产品无关且不受阻断决策影响的工作；只是不能将完整系统或核心安全 RPC 宣称开工/上线条件全部具备。

### 7.2 推荐的解除次序（非自动批准任务）

1. **设计修复先行**：F01～F04 的安全路径和 F05 的字段/幂等候选已分别在 [前四项](./aisencore-f01-f04-security-convergence-design.md)、[后四项专项](./aisencore-f05-f08-contract-compatibility-readiness-design.md) 形成文档方案；F06/F07 产品/上线决定仍待用户确认，F08 真实 RPC owner、锁序、SDK 兼容和 R2 测试未运行。不能把方案冻结当作真实系统安全验收。
2. **以隔离环境取证**：得到实际开发与测试授权后，锁定 SDK/CLI/PostgreSQL/Edge/PostgREST 版本，先实现 D1 SQL/RLS/事务的最小闭环和真实负向/并发验证，随后 D2 JWT/Auth/API，D3 管理端，最后 Aisenlens 私有 R2。
3. **用户逐项确认**：U04、U09、U10、U11 在 Aisenlens 权限/备份开发前；U05、U08 在管理员初始化/发码实装前；U03、U06、U07 在正式对外环境配置/开放前。不要为了填满表格而默认接受任何候选产品方案。
4. **发布/验收前**：全部 P0/P1 正反向与隔离环境 E2E 测试实际运行并归档，实施迁移回滚和 R2/元数据联动恢复演练、密钥泄露预案；确认唯一权威 spec/architecture 与实现无漂移后由用户明确批准进入部署。

## 8. 跨文件范围审查与交接

| 文档/分类 | 检查要点 | 本阶段需否修改 |
| --- | --- | --- |
| [现行 spec](../../spec/requirements.md) | U01/U02、U03 公众注册、U05 MFA/单人运营及 U04/U06～U11 部分方向已确认；具体参数待定，不得自行修改业务范围或额度 | **无需修改** |
| [domains](../../architecture/domains/README.md) | 成员退出与恢复、管理员保底、码和授权业务不变量继续有效 | **无需修改** |
| [backend](../../architecture/backend/README.md) | 43 项标准用例和错误模型保持唯一逻辑权威；D4 提出 F01/F02/F04/F05 候选安全审查 | **无需改逻辑权威**，链接可经总计划找到 D4 |
| [database](../../architecture/database/README.md) | D1 的表/事务设计已明确为候选；必须先解决暴露函数/锁序风险 | **无需直接改规则**，风险在 D4 审查台账 |
| [applications](../../architecture/applications/README.md) | D3 Admin MFA/一次性码与 D2 本地/R2 均有设计且尚未实现 | **无需修改** |
| [infrastructure](../../architecture/infrastructure/README.md) | 技术已选，但真实环境/版本/密钥/测试都不存在 | **无需修改** |
| [development](../../development/README.md) | 后续实施须落实真实 pgTAP/JWT/R2 测试工具/CI；D4 未写代码、未锁工具版本 | **无需修改**（测试详细规格放 D4 文件） |
| [Plans 总计划](./aisencore-mvp-implementation-design-master-plan.md)、[Plans 索引](../README.md)、[docs 总入口](../README.md) | 需要追加 D4 测试/就绪评审入口、阶段状态与风险说明 | **本阶段同步更新** |

## 9. D4 输出状态与局限

**43 个逻辑用例覆盖率：43/43 已有测试**设计**；实际执行：0/43，全部 NOT RUN。** R2 的 A-01～A-12 也是补充设计、无运行证据。M1～M5 列有真实并发、鉴权与故障必须实施的验证排程。原文档阶段有过静态一致性检查；清理后的当前链接/用例核验以本次重新扫描为准，不能当作真实运行 PASS。

**留给实现阶段的明确未关闭项**：F01～F08 与 U03～U11。不存在任何已运行数据库、Supabase Auth、Edge Functions、Cloudflare Pages、R2 Bucket、pgTAP、真实浏览器或 Aisenlens 客户端测试。不能因为这份评审报告把 `NOT RUN` 填成 `PASS`，不能自行启动开发、连接生产、部署或提交 Git。
