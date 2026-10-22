# AisenCore 架构独立复审报告（2026-10-21）

> **审查类型**：静态架构文档复审（不是实现安全审计、代码审计或已部署系统验收）\
> **项目工作区**：`E:\Projects\Aisencore`\
> **审查基线**：`main`，HEAD `2552d19d5f62ad8bb13717a426b42880f86eea45`，开始时工作区干净\
> **约束**：仅阅读与出具本报告；不修改任何既有文档、源代码、数据库、配置、部署资源或 Git 提交\
> **结论**：**有条件建议进入 MVP 实施设计阶段**，但在执行数据库迁移、RPC/管理端开发前，应关闭本报告 M1—M5 所列的局部业务/安全契约缺口。**不建议为此重构五层文档体系或扩展产品范围。**

## 0. 范围、证据与判定口径

- **完整阅读范围**：`docs/spec/requirements.md` 和 `docs/architecture/` 的 **21 份 Markdown 文档**：根目录（索引与主架构）2，`domains/` 5，`backend/` 3，`database/` 5，`applications/` 4，`infrastructure/` 2；其中包含最新 `applications/admin-console.md`。
- 辅助参考：`AGENTS.md`、已有 `docs/review/architecture-review.md` 与 `architecture-remediation-status.md`（只用于确认旧问题是否已在现行文档修订，不以历史结论替代本次独立判断）。
- **自动静态检查**：检查上述 22 份 Markdown 中 **183 条指向本地的相对链接**，目标路径缺失 **0 条**；未对链接中的标题锚点进行独立验证。未运行 SQL、pgTAP、业务接口、UI 或网络部署测试。
- **依据优先序**：现行需求 > 当前领域规则与相应专项的权威决定 > API/数据库/应用实现契约 > 历史审查材料。尊重“已确认的逻辑架构，尚未实施”的声明，**缺少最终 DDL、具体页面组件或实际环境不自动构成问题**。
- 严重度：**P1**=真实风险或不变式缺口，应在相关 MVP 实现前修复；**P2**=接口/业务语义冲突，应在实施设计中明确；**P3**=维护与体验改进；**延期**=非当前 MVP 范围。
- 本报告中“必须修复”表示**必须修正文档所表达的逻辑规则或在实施设计中补明契约**，不是要求本次直接修改项目文件，也不暗示这些缺陷已经在运行系统发生。

## 1. 总体评估

| 审查维度 | 结论 | 判断依据 |
| --- | --- | --- |
| 文档分类与责任 | **合理，保留** | `domains` 定业务真相；`backend` 定接口和调用序；`database` 定约束/RLS/事务；`applications` 定 Admin 与客户端；`infrastructure` 定承载/部署。五类是**文档分类**，不意味着五个部署服务。 |
| 主架构与需求 | **高度一致** | 共用身份、独立成员/权益、产品业务数据自主拥有、阶段化支付、Cloudflare R2 与 PostgreSQL 并列、本地优先特例均保留需求边界。 |
| 统一 Auth / 多 SaaS | **可实施** | Supabase Auth 负责身份；JWT 验签与跨 Project RLS 不互认说明充分；未假定跨域无感 SSO。需要清楚呈现用户级 Bearer Token 的信任边界（S1）。 |
| 成员与平台限制 | **良好，但管理员封锁边界需补** | 三态加“无记录”、封禁前状态、幂等加入、全局 block 与产品级封禁分离；发现一个可导致管理员集体锁死的边缘路径（M1）。 |
| 权益、兑换与计费 | **主链路可落地，少量不一致** | grant/plan/code/redemption、同事务核销、幂等、熵/哈希、失败限流已具备；码发布后套餐变更、重复兑换分支和明文政策需收口（M2—M4）。 |
| API 与数据库 | **技术路线稳健** | PostgREST+RLS 读、定点 Security Definer RPC 写且审计同事务、Edge Functions 限需秘密场景；API 中“查询性拒绝”的 HTTP 语义需明确（M5）。 |
| React-admin | **模块与职责合理** | Resource/Data Provider/Auth Provider + MUI/TanStack Query；普通管理读按 RLS，写按管理 RPC，Auth Admin 查询走可信 Edge；没有第二套 CRUD 后台。 |
| 安全与可测试性 | **架构设计较好，尚未得到运行时证明** | 现有矩阵和 I-01—26、R-01—14 包含关键正反向断言。正式通过仍依赖 SQL/GRANT/RLS、并发、Admin MFA 与端到端测试。 |
| 复杂度控制 | **总体优秀** | 未新增分布式事务、事件溯源、Redis 撤权总线、统一 SSO/OAuth、通用按量账本、企业 RBAC、支付插件平台。 |

### 文档归类和权威性

`domains/billing-and-entitlements.md` 是权益和兑换码业务规则的主权威；`domains/membership-lifecycle.md` 是成员状态真相；`backend/api-contract-and-mvp-acceptance.md` 定接口、错误码和验收；`database/entitlements-and-redemption-constraints.md` 定关系约束/核销事务；`applications/admin-console.md` 放在应用层**归类正确**。`database/product-data-and-files.md` 虽谈 R2，但重点是文件字节和元数据的**数据归属**，归于 database 有充分理由。尚不需要合并/移动文件。

旧报告指出的“没有兑换码模型”“Admin 读 API 无安全出口”“事务执行方式未定”“无非成员审计载体”等 **M1—M6 级缺口在现行文档中已被实质性补足**，不应重复列为当前未修复项。`requirements.md` 重申少量不可违反的结果约束，专项引用业务规则，属于适当冗余；维护上只需修复下面识别的特定冲突，避免为了形式上的无重复而损失可读性。

---

## 2. 必须修复（按严重度排序）

### M1 · P1 · 平台封禁可能绕过“不能撤销最后管理员”的保护，锁死管理入口

- **涉及**：`docs/architecture/domains/platform-admin-and-account-lifecycle.md:7-13,37-42`；`docs/architecture/database/database-constraints-and-audit.md:66-84`；`docs/architecture/database/database-access-and-transactions.md:18,27-31`；`docs/architecture/backend/api-contract-and-mvp-acceptance.md:20-21`。
- **原因**：已规定 `RevokeAdmin` 不得撤销最后一名 `active` 管理员，但 `private.is_platform_admin()` 同时排除 `platform_account_restrictions` 中被 `blocked` 的用户。`BlockAccount` 却没有等效“最后一个**实际可登录管理的人**”的保护。若只有一位管理员，管理员操作误将自己 block，资格行虽仍 `active`，所有正常管理 RPC/RLS 都将拒绝其访问；多位管理员被逐个 block 亦然。
- **影响**：Admin 管理不可用，兑换码创建、成员解除限制、产品状态管理等全部依赖临时受控 SQL 救援；并发封锁可使简单“先查人数”失效。
- **最小建议**：将“至少保留一位 `active=true` 且**未 blocked** 的管理员”作为 `BlockAccount` 与 `RevokeAdmin` 的共同数据库事务不变量；限制 self-block 或要求经可靠确认后仍有其他合格管理员；对影响管理员的这两类写入采用相同串行化锁/约束检查。保留受控的 MFA 丢失/无人可用时的 SQL 恢复方案。增补“唯一管理员自封禁”和“两管理员并发封锁/撤销”负向验收。**不用新增角色系统**。

### M2 · P1 · 已发行但尚未兑换的码引用的套餐仍可变，亦可能被套餐停用整体意外失效

- **涉及**：`docs/architecture/database/entitlements-and-redemption-constraints.md:13-21,48-55,83,88`；`docs/architecture/domains/billing-and-entitlements.md:38-40,54-59`；`docs/architecture/applications/admin-console.md:28-29,69-76`。
- **原因**：套餐能力的不可变门槛是“已有 `entitlement_grants`”，管理 Upsert 同样只检查 grant 引用。但 **`redemption_codes` 先于用户兑换产生并引用计划**。管理员已经生成且人工发出码、尚无人兑换时，原计划 `features/limits` 仍可被改写，导致码所承诺的权益静默变化。另据 `is_active=false`“不可用于新授权”和兑换时检查“套餐可发放”，停用旧套餐也可能使**已分发但未使用**的码一次性不可兑现；这与“撤销单张码是独立管理动作”的用途边界尚未统一。
- **影响**：MVP 主功能“发码—人工分发—兑换”存在承诺不确定/批次不可预期失效的风险；历史审计难解释为何同批次兑换所得能力不同。
- **最小建议**：套餐版本**一旦被任何授权或兑换码引用，即冻结影响授权权益的字段**；改变能力只能另建 `pro_v2` 等版本。明确 `is_active` 仅阻止创建新的码/管理授权，还是也阻止旧码兑换；推荐将“阻止已发行码兑现”作为**明确撤销码/批次**而非无声套餐停用的副作用。补“先发码、修改套餐、再兑换”和“停用后旧码”验收，不建新套餐引擎。

### M3 · P2 · “兑换码明文仅创建当次可见”与“以后能否再次导出明文待定”互相矛盾

- **涉及**：`docs/architecture/domains/billing-and-entitlements.md:64-67,111-113`；`docs/architecture/database/entitlements-and-redemption-constraints.md:47,84`；`docs/architecture/applications/admin-console.md:71-76`。
- **原因**：既定设计仅保存 SHA-256 高熵码哈希，且同 `request_id` 重试不再返回明文；但计费专项“待确认”仍写有“是否需要**再次导出明文**”。在仅保留不可逆哈希的前提下，后续明文无法恢复。
- **影响**：开发者可能错误地追加明文存储、导出后台或产生用户无法兑现的运营预期；与已确定的安全要求正面冲突。
- **最小建议**：删去“事后再次导出明文”待定项；明确可在**首次创建成功响应**中即时复制/下载明文，响应丢失只能撤销原批次再创建新批次。该项只需修文案和 Admin 接口约定，不增加持久化秘密。

### M4 · P2 · 重复兑换与“码已用尽”检查优先级未统一

- **涉及**：`docs/architecture/database/entitlements-and-redemption-constraints.md:67,79-83`；`docs/architecture/backend/api-contract-and-mvp-acceptance.md:44,68-69,125-128`。
- **原因**：事务步骤先验证 `redeemed_count < max_redemptions`，之后才计算来源键/尝试创建 redemption；然而 R-05 明确要求用户同一码重复提交返回 `REDEEM_ALREADY_USED`。对于单次码，首位用户成功后立即用尽，其重试很容易被先前的“已用尽”分支归为 `REDEEM_CODE_INVALID`，与验收矛盾。统一模糊返回应保护**其他用户**对码状态的探测，不需要把本人已成功兑换事实隐瞒给本人。
- **影响**：网络超时恢复与重复请求处理不稳定；用户已兑现的码被误报“无效”，客户端难以区分成功补查和真正失败。
- **最小建议**：明确并测试拒绝优先级：在可信识别码且取得必要锁之后，先查 `(code_id, auth.uid())` 已兑换事实并返回 `REDEEM_ALREADY_USED`，再对未兑换者执行撤销/过期/用尽统一无效分支；或决定统一返回无效并**同时修改 API 契约、R-05 及客户端补查流程**。推荐前一方案。

### M5 · P2 · `CheckAccess` 的业务拒绝响应与 HTTP 错误映射需要一个确定契约

- **涉及**：`docs/architecture/backend/api-contract-and-mvp-acceptance.md:27-44,49-74`；`docs/architecture/backend/public-api-and-saas-integration.md:46-51`；`docs/architecture/applications/admin-console.md:53-57`。
- **原因**：`CheckAccess` 被定义为无副作用查询并返回 `allowed=false`、`reason`；同一契约又把 `MEMBERSHIP_LEFT/SUSPENDED`、`ENTITLEMENT_REQUIRED` 等列为 HTTP 403，同时说明普通 RPC 的业务异常映射 HTTP 错误。读查询究竟在正常身份下返回 **HTTP 200 + allowed=false**，还是 **HTTP 403 + code**，尚未指明优先适用规则。
- **影响**：独立 SaaS 接入方可能将正常“无 Pro/未加入”当成接口失败进行重试或触发登出；React-admin/SDK 错误处理不一致。
- **最小建议**：在 API 专项增加一个**按操作类别区分的简短映射**：建议 `CheckAccess` 对已认证的产品准入/权益拒绝统一返回 200 + `allowed=false,reason`，真正无效认证、无权调用及服务故障才使用相应 401/403/5xx；具有副作用的用户/管理 RPC 则返回其稳定业务错误。若选择 403 路线，也可以，但必须明确并落实验收。这是**契约确认**，不是要求另建 API 框架。

---

## 3. 建议优化（按预期收益排序）

### S1 · P2 · 将统一用户 JWT 的跨产品委托风险明确为“受信任 SaaS”边界

- **涉及**：`backend/public-api-and-saas-integration.md:7-17,53-56`、`applications/auth-and-multi-saas-sessions.md:39-47`、`backend/api-contract-and-mvp-acceptance.md:27-33`。
- **现状/原因**：现有文档清楚承认 JWT 只证明**用户**而不证明**哪个 SaaS 后端**，开放产品允许用户直接加入。相应地，任何实际持有同一用户 Bearer JWT 的产品服务器，在令牌有效期内理论上可用其代该用户调用允许的跨产品本人查询和自助 RPC；`product_key` 不是调用方凭据。这不等于当前设计缺少授权：行为仍受该用户原有权限约束，但不构成**产品调用方强隔离**。
- **影响**：当多产品由同一运营方、后端受信任时可接受；若未来引入第三方产品团队或不可信 SaaS，凭一个产品的用户 JWT 获得对其他产品公共自助操作的代理能力，会超出其信任假设。
- **最小建议**：将“MVP 仅面向统一受信任运营方/后端；SaaS 不记录、不长期持有 JWT，不下发 service_role；业务级授权仍在 SaaS 端复核”写成接入安全前提。**不**为了假设中的第三方平台立即造 OAuth 代理、产品专用 Token 或机器密钥；只有信任域发生变化时再设计产品受限委托。

### S2 · P2 · 周期码续期后，当前权益摘要不应仍只展示旧到期日

- **涉及**：`domains/billing-and-entitlements.md:38,42`、`backend/api-contract-and-mvp-acceptance.md:37-43,129`。
- **原因**：同套餐续期产生一条**未来才生效**的 grant，`CheckAccess` 的当前权益又只合并 `starts_at<=now()` 的授权；`GetMyProducts` 展示“当前有效授权的 `ends_at`”。成功续期后，服务端实际已有未来授权，但当前摘要可能仍只返回本期结束时间。
- **影响**：用户刚兑换续期码却看不到新到期日，容易误以为未充值；对真实当前功能授权判定本身无影响。
- **最小建议**：区分“此刻有效权益/截止时间”与“已预定连续续期到期时间”，增加一个可选 `scheduled_until` 或在本人授权历史显示未来 grant；**不**把未来权益提前判为生效。

### S3 · P3 · 管理员码列表选用明确的非哈希只读投影，避免 SELECT * 的适配失败

- **涉及**：`database/entitlements-and-redemption-constraints.md:94-102`、`applications/admin-console.md:46-55`。
- **原因**：Admin 被允许读兑换码**非哈希**列，而真实表 `code_hash` 必须拒绝 Data API SELECT。React-admin Data Provider 的默认列查询若直接 `select=*` 可能整体失败，而不是自动过滤列。
- **影响**：在具体 Data Provider/Schema 对接阶段，兑换码列表可能显示权限异常。当前文档已给出“列级 GRANT 或安全只读投影”两种正确方向，故**不是现阶段架构缺失**。
- **最小建议**：实施设计时选一个固定的 RLS 受保护只读投影/View 或明确的白名单 SELECT 字段；保持管理 UI `getList/getOne` 返回结构一致，字段和分页按 React-admin 原生契约适配。对视图的 `security_invoker` 行为做实际版本测试。

### S4 · P3 · 受限制账号、产品暂停时哪些“本人安全操作”仍可执行应列最小例外

- **涉及**：`domains/platform-admin-and-account-lifecycle.md:39-53`、`domains/membership-lifecycle.md:30-38`、`database/database-access-and-transactions.md:25-31`、`backend/api-contract-and-mvp-acceptance.md:27-34`。
- **原因**：公共“准入/加入/重加/兑换”需受全局阻断是正确的；但 `leave_product`、本人历史查阅、注销/数据请求（人工渠道）是否受相同阻断存在表达空间。用户“被阻止访问产品”不必等于不能退出或申请处理个人数据。
- **影响**：若把“全局阻断”不加区分地复用到全部用户 RPC，可能让退出和必要自助安全操作被不合理阻断。
- **最小建议**：在 API 检查矩阵中单列“受保护使用操作”和“非使用性本人账号操作”，逐一说明 `leave`、历史查询、人工删除请求入口的允许条件；无需扩展新的状态机或自助注销系统。

### S5 · P3 · 维护索引的验收数量并减少易失效的计数文本

- **涉及**：`docs/architecture/backend/README.md:5-6`、`docs/architecture/backend/api-contract-and-mvp-acceptance.md:86-138`。
- **原因**：后端索引写“26 项验收用例”，但契约包含 I-01—26 **以及** R-01—14，合计 40 项。属于文档索引数字未同步，不影响实际架构。
- **影响**：审查者误认为兑换测试未计入，全量 MVP 验收清单统计失真。
- **最小建议**：写成“身份/成员 26 + 权益/兑换 14”或直接改为“不写固定数字的验收用例”。其它层级索引保持当前分工，不为此再拆目录。

### S6 · P3 · 套餐逻辑标识与版本标识的简单约定可降低管理端歧义

- **涉及**：`database/entitlements-and-redemption-constraints.md:13-21,88`、`domains/billing-and-entitlements.md:33,40`、`applications/admin-console.md:28`。
- **原因**：产品内 `UNIQUE(product_id,plan_key)` 同时推荐用 `pro_v2` 代表新版本，实际隐含 `plan_key` 是**不可变套餐版本键**，而 UI 展示的“Pro”可能是面向用户的商品名称。尚未明确两者不能混作稳定跨版本购买入口。
- **影响**：开发者可能在套餐管理和授权历史 UI 中把同名不同版本误当成单个可覆盖的 Plan。
- **最小建议**：文档说明 `plan.id/plan_key` 作为不可变版本引用，`name` 是展示名；本阶段直接采用 `pro_v1/pro_v2` 命名就够了，不必新建套餐版本引擎或跨渠道商品目录。

### S7 · P3 · 将上述关键反例纳入已存在的最小测试矩阵

- **涉及**：`backend/api-contract-and-mvp-acceptance.md:86-142`、`applications/admin-console.md:86-97`、`infrastructure/tech-stack.md:115-121`。
- **原因**：已有并发、鉴权、审计、邮箱、角色撤权与兑换测试充分，但尚未显式覆盖 M1、M2 与续期响应。
- **影响**：未来实现可能满足已有测试但仍绕过边界条件。
- **最小建议**：增加**少量**断言：最后合格管理员不能被全局封锁；已发行码引用的套餐冻结；重复兑换错误优先级；续期展示真实待生效授权；CheckAccess HTTP 语义。复用已有 pgTAP/集成测试结构，勿新建独立测试平台。

---

## 4. 暂不处理：保留清晰的触发条件（非当前架构缺陷）

| 项目 | 现有文件与原因 | 现阶段最小处理及触发条件 |
| --- | --- | --- |
| D1 · 爱发电订单查询、Webhook 防伪与漏单补查 | `domains/billing-and-entitlements.md:16-27,111-113`。当前优先建设自有码，支付仅暂定第二阶段；提前做需猜测渠道条款。 | 保留 `source_type/source_ref` 与可信交易幂等原则；**真正接入爱发电时**确认用户/商品对应、回查、漏单与退款。 |
| D2 · 支付宝/Stripe 与复杂订阅、升级、财务后台 | `domains/billing-and-entitlements.md:16-25,98-109`、`applications/admin-console.md:31`。现无这些渠道与高级计费的首版要求。 | 不做支付插件引擎或综合财务模块；商户资质与实际场景确定后再设计。 |
| D3 · 产品调用方机器凭据、邀请制与真正跨信任域 OAuth/SSO | `backend/public-api-and-saas-integration.md:15,53-56`、`applications/auth-and-multi-saas-sessions.md:7-10,39-46`。当前仅自营开放产品/user JWT。 | 保留 S1 的已知信任边界；出现无用户上下文调用或外部不可信运营者时再增最小认证，不预建双 Token 网关。 |
| D4 · R2 预签名细节、备份元数据、对象删除及强撤权策略 | `database/product-data-and-files.md:18-43`、`applications/local-first.md:22-27`。不同产品的文件需要尚未选定；不能把选定 R2 当成已接通。 | 维持“私有、先验证、短期授权、直传、元数据属产品”；**首个实际使用备份/上传的产品上线前**完成签名与配额设计及安全测试。 |
| D5 · 公共额度核销账本、Redis/事件总线、分布式事务 | `domains/billing-and-entitlements.md:38-45,98-105`、`database/database-access-and-transactions.md:62-78`。按产品计量且最终在产品数据库核算，公共账本现无跨产品一致性需求。 | 保留能力上限 + 产品侧原子计数，出现跨产品强一致扣量需求再评估。 |
| D6 · 全自动跨 SaaS 注销编排、长期归档系统 | `domains/platform-admin-and-account-lifecycle.md:44-59`、`domains/membership-lifecycle.md:30-38`。MVP 已确定人工受理。 | 不建通用删除工作流；但**正式开放注册/涉及存储个人数据的产品上线前**必须明确实际人工处理、可达入口、各数据保留/删除及合规政策，不能无限期推迟政策本身。 |
| D7 · 复杂管理 RBAC、多组织控制台、BI、统一 AI 代理、通用离线 Pro 授权、自托管 | `current-main-architecture.md:75-79`、`infrastructure/tech-stack.md:96-121`、`applications/admin-console.md:78-84`。这些均缺少现行需求支持。 | 保留 React-admin + 简单平台管理员、标准 PostgreSQL 版本化迁移；仅真实运营规模/产品诉求触发时再扩展。 |

---

## 5. MVP 关键流程的实施设计审查

| 流程 | 现行文档是否形成逻辑闭环 | 进入开发前必要验证 |
| --- | --- | --- |
| A. 邮箱注册/确认/找回 → 多产品身份 | **是**：一个 Supabase Auth，跨应用不强求 SSO，用户 ID 稳定 | 生产 SMTP、回调白名单、会话策略、JWT/JWKS 验签；真实账号 E2E |
| B. SaaS 首次合法接入 → 创建公共成员 | **是**：本人 JWT、开放产品、唯一记录、同事务 join 事件；SaaS 工作区失败可重试 | SQL 锁/唯一键、产品暂停竞争、旧请求不得覆盖封禁 |
| C. 产品使用/Pro 权益准入 | **是，API 返回细节待澄清**：产品/成员/权益为公共权威，资源与用量由各 SaaS 检查 | M5 的 HTTP/allowed 契约；过期/撤权与服务器 fail-closed；跨 Project JWT 核验 |
| D. Admin 发码 → 人工分发 → 用户兑换 → grant | **基本闭环，但必须修 M2—M4**：码高熵/哈希/限流、原子 grant、redeem、join、并发续期已经具备 | 不可变引用、码停用语义、明文一次性、重复核销优先级、并发 |
| E. Admin 登录/MFA → 管理列表/可信写入 | **基本闭环，但必须修 M1**：`aal2` RLS/管理 RPC，非 Auth 用户查询只走 Edge | 最后合格管理员保护；管理 RLS 正反测试；`ra-supabase` 适配 |
| F. 本地 Free/Pro 和 R2 配置备份 | **架构边界清晰**：本地 Free 可离线、Pro 启动在线与关键复核，私有配置按授权直传 | 产品对接时决定失败/撤权时点；实际使用 R2 前完成签名/元数据/额度实现 |
| G. 账号退出、封禁、人工注销 | **主要状态闭环**：退出≠注销≠取消续费≠删除，封禁可恢复先前状态 | S4 自助安全操作例外；上线前确定人工注销清单和数据保留政策 |

### React-admin 专项判断

- **模块**：产品、公共用户查询、产品成员、套餐/权益、兑换码五个资源集合符合 MVP；支付订单/退款管理仅随渠道出现。无需加入跨 SaaS 业务项目、统一普通用户门户或复杂仪表盘。
- **Auth Provider**：使用 Supabase Auth 的登录/会话恢复、TOTP MFA；通过安全的管理员资格查询控制导航，并由后端每次复核当前资格和 `aal2`，正确。不把前端角色缓存当作鉴权。
- **Data Provider**：PostgREST Data API + RLS 读、单独管理 RPC 写，保持 React-admin 默认 List/Show/Form/Query 工作流，优于重造 CRUD 后端。选择 `ra-supabase` 前需要实际版本验证；用户列表/按 ID 邮箱数据必须来自有权限边界的只读 Edge，不能以 `auth.users` 公开视图捷径绕过。
- **邮箱检索的已知折中**：Auth Admin `listUsers` 只支持分页列举，不天然支持服务端按邮箱过滤；受控分页扫描加 `search_incomplete` 是明确披露的 MVP 折中，不应误判为“已有真正全量邮箱索引”。数据规模超过扫描范围时，应以精确 UUID 查询为可靠途径，直到有确切需求建立受限身份投影。
- **管理动作**：批量发码、封禁恢复、权益修改等待可信 RPC 完成并写审计；未知结果先查状态，不盲目重试。敏感明文不持久化。实现时防止默认 `select=*` 触及 `code_hash`（S3）。
- **不需要额外框架**：无必要使用第二套路由、状态库、REST 后端、独立管理员用户库或自研 MFA。

### 前后端、数据与基础设施解耦判断

逻辑依赖方向正确：**应用**呈现及请求 → **后端/数据库受保护接口**判权和落库 → **公共 PostgreSQL** 保持共同业务事实；Supabase Auth 管认证，R2 管文件字节，独立 SaaS 管业务对象与实际用量。Cloudflare Pages 仅托管静态 Admin，并非后端认证权威。产品业务库可共用部署也可隔离，**业务责任解耦不必强制物理拆库**。后端与数据库 RPC 在同一 PostgreSQL 部署中是有意复用成熟事务能力，不是违反解耦。

---

## 6. 推荐的最小实施设计路径（不表示授权开始开发）

1. **封闭文档契约**：先定 M1—M5；同步改很少量对应权威文档并增边界测试，避免在实现代码中分别猜测。
2. **公共核心 DDL/RLS/RPC 设计**：先产品/成员/平台管理员与 block、权益/码/核销、审计及用户/管理员读策略；函数身份来源、GRANT、固定 search_path、跨表锁序都按现有专项落地。
3. **最短纵向业务切片**：开发环境验证“Admin aal2 → 发码一次性明文 → 用户 redeem → 当前/未来 grant → `CheckAccess` → 产品 A/产品 B 隔离”；跑 pgTAP 与并发/重试负向用例，不能只做 Happy Path。
4. **管理 UI 接入**：依次验证 Auth Provider、RLS 只读列表分页、非哈希码投影、管理 RPC 适配与错误提示；不提前美化重型后台。
5. **真实 SaaS 集成**：挑选一个本地优先与一个云端边界场景验证 JWT、按需加入与 fail-closed；分别确认产品侧业务授权/实际配额。文件直传、外部支付留到对应首个真实产品阶段。
6. **上线门槛**：独立开发/生产环境、迁移文件/回滚方案、发信/回调、管理员初始种子及 MFA 恢复、密钥保管、数据保留与人工注销入口、基本日志和备份。它们是实施/发布验收，不要求现在搭建复杂 DevOps 体系。

## 7. 最终裁定

**是否能支撑多个独立 SaaS 共用用户、成员及权益系统？** **能，在已明确的 MVP 信任假设下能。** 共用身份与按产品隔离的成员/权益是完整且必要的最小公共核心；真实资源权限与额度执行留给各 SaaS，职责一致且不会绑死业务数据库部署。

**是否存在阻断 MVP 的架构方向错误？** **未发现必须推翻技术栈、五层目录或重做身份/成员模型的系统性错误。** 存在 M1—M5 这组应在实施前关闭的局部不变量与响应契约缺口，主要围绕“管理员可恢复性”和“发行兑换码后的承诺稳定性”，其修复代价预计是有限规则和测试，不需新增服务或复杂框架。

**是否建议进入 MVP 实施设计阶段？** **建议，有条件通过。** 可立即开展 DDL、RLS/RPC 签名、具体 Provider 适配与测试用例的设计讨论；但在用户另行明确授权前**不得执行实现动作**。真正开始编写核心业务代码/迁移之前，应先在架构上把 M1—M5 定稿；R2/支付/离线授权等非 MVP 阶段事项按触发条件延期。

> **附注**：本结论基于完整的现行文档和只读静态检查，不宣称已有应用、表、RPC、RLS、云服务已创建，也不构成渗透测试结果。当前文档的架构成熟度高于旧版审查报告反映的状态；应以本次所列的**具体未决缺口**而非历史已修复问题作为下一阶段工作的重点。
