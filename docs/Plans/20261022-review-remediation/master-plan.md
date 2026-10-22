# AisenCore｜2026-10-22 审查问题整改总计划

> 状态：**DRAFT / NOT STARTED**（计划编制完成，整改未开始）  
> 编制日期：2026-10-22  
> 计划路径：docs/Plans/20261022-review-remediation/master-plan.md  
> 依据：[审查报告](../../review/20261022.md) · [现行需求](../../spec/requirements.md) · [架构索引](../../architecture/README.md) · [MVP 现有总计划](../aisencore-mvp/aisencore-mvp-implementation-design-master-plan.md) · [TODO](../TODO.md) · [U03～U11 决议](../aisencore-mvp/aisencore-u03-u11-user-decisions-2026-10-22.md)

**执行边界**：本次用户仅要求整理并保存总计划，不构成编写代码、安装依赖、创建数据库/云资源、调用生产接口、提交/推送或部署的授权。未来每一阶段启动实施时均需单独确认权限及必要的业务/架构决策。本计划不代替 spec 和 architecture 的权威规定。

## 1. 目标、范围、基线和原则

### 1.1 目标与交付物

在不扩大 MVP 范围的前提下，按照“安全与事实 → 权威规则及数据合同 → 基础设施/性能 → Admin/UI/工程 → 全量验证与清理”的顺序，解决审查报告 G-01～G-04（4 项）、B-01～B-03（3 项）、M-01～M-03（3 项）、A-01～A-04（4 项），共 **14 项**，并对 X-01～X-04 四项横切问题收敛；额外 MCP-01 明确延期，不计入当前修复验收。

最终应交付：
- 唯一现行需求与长期架构，不因临时 Plan 删除而丢失关键业务或安全规则；U 项状态与 MFA 结论一致。
- 兑换码、锁序、续期、Free 默认方案、请求幂等、Admin 权限和配置备份具有**明确且可测试**的契约。
- 可复用的 React-admin DataProvider 与低请求量管理员身份查询方案，不引入无谓的独立框架。
- 对 R2/数据库/Auth 的非原子跨系统步骤定义故障补偿，不仅减少代码，也要保持安全与可恢复性。
- 每个问题拥有对应的文件、实施步骤、验收用例、决策门禁与完成证据；实际没有运行的测试保持 NOT RUN。

### 1.2 初始现状校正

- 审查原文称审阅 docs/mvp-design-and-admin-ux-20261022 分支；本计划起草时 mycodex 项目位于 main。git status 显示审查报告为未跟踪文件，**没有** 47 个跟踪文件的换行符大 diff。每个任务施工前须再次核对当前 branch/HEAD/worktree。
- G-04 的 .gitattributes 缺失属预防性工程问题 P2，而非本地工作区已经证实出现 7,273 行污染。
- B-01 的现行安全设计要求高熵随机码，且已要求存在的码业务拒绝也计入限流；“无限暴力枚举”未被证实。但先按 code hash 探测产品和成员状态仍存在值得修订的泄露边界。先列 P1 设计安全问题，若代码实测存在真正限流绕过再升级 P0。
- A-01 所说 UI-G0 是“死锁”属于审查判断；**编码前视觉门禁是当前已确认需求**，未获项目所有者批准前不得自行解除。
- A-04 虽然缺席报告问题速览表，却在报告正文明确出现；它是正式公开运营前的 P0 恢复门禁。
- 仓库文件说明主要仍处设计阶段，不能把推导风险、候选 2ms 响应或文档方案当作已运行缺陷/通过证据。

### 1.3 资料的唯一权威和变更原则

| 目录 | 长期职责 | 允许本计划改变的部分 |
| --- | --- | --- |
| docs/spec | 唯一现行需求及用户已确认策略 | 删除被新结论覆盖的旧表述；新策略须批准 |
| docs/architecture | 分领域持久业务规则、RPC/安全/拓扑合同 | 内联已收敛的长期不变量、解决冲突 |
| docs/development | 实施参考、前端及测试规范 | 将可操作工程规则精简、复用成熟能力 |
| docs/Plans | 未实施候选、施工导航、TODO 与验收 | 记录步骤、依赖、执行证据；不长期保留完结冗余草案 |
| docs/review | 审查来源 | 保留历史报告，不作为现行权威 |

**每个任务统一工作法**：先读取当前源文件和差异 → 建立失败用例/静态矛盾证据 → 标记是否需要批准 → 修改唯一权威文件及全部依赖方 → 实测或记录 NOT RUN → 对照验收 → 更新 TODO、索引和报告闭环。禁止未获批准就改变原架构铁律；不得以文档整改暗中实现业务代码。

## 2. 阶段顺序与依赖关系

| 阶段 | 执行顺序与范围 | 关键交付 | 阻塞/先决 |
| --- | --- | --- | --- |
| **S0 基线** | BASE-01：仓库、文档及证据核对 | 问题/文件/现状核对表 | 先行 |
| **S1 安全优先** | G-02、B-01、B-02、A-04、X-01 | MFA 一致、兑换准入/锁/限流、恢复预案、统一错误矩阵 | 不能放宽现有 aal2/RLS |
| **S2 数据与权威** | G-01、M-01、B-03、M-02、X-04 | 唯一权威、状态同步、Free/续期/幂等合同 | B-03/M-02 的新 API 或业务模型需批准 |
| **S3 备份与查询** | G-03、M-03、A-02、X-02 | R2 可信组件归属与补偿、批量身份查询 | 备份是否经 Edge 需先决定 |
| **S4 Admin/工程** | A-01、A-03、G-04 | 有证据的 UI 门禁、Provider 合同、Git 行尾规范 | UI-G0 变更未经批准不得执行 |
| **S5 验证/收尾** | X-03、CLOSE-01 | 实测报告、问题闭环、剩余 TODO | 依实际授权和环境分批完成 |
| **S6 延期** | MCP-01 | 独立未来候选，不阻塞 MVP | 有具体使用场景后另立计划 |

**关键依赖**：B-01 ↔ X-01（错误/成员优先级）、B-01 ↔ B-02（redeem 锁序）；B-03 ↔ M-02（服务器续期计算/幂等）；G-03 ↔ M-03 ↔ X-02（R2 路线及补偿）；A-02 ↔ A-03（用户虚拟 Resource）；A-01 的正式主题/业务页面开发仍受已批准 UI-G0 阻断。G-04 可并行，但换行符规范化必须独立提交。

## 3. S0 基线校验

### BASE-01｜建立事实、风险类型与证据索引

目标：docs/review/20261022.md、docs/Plans/TODO.md、本计划及涉事文件。

- [ ] 记录当前 branch、HEAD、git status、文件 hash、已有改动；不得覆盖用户未提交工作。
- [ ] 根据报告每项编号找到现行文件的实际内容，不盲信报告的固定行号或原分支状态。
- [ ] 标记每项：**已证实的文档冲突 / 静态设计隐患 / 运行缺陷 / 无法复现**；记下变更前行为和证据。
- [ ] 引用现有测试编号：D4 I/R/A、LCK-01～07、F05-C01～12、V00～07、AUTH-P01～12、D3-UI-X01～18；新增场景采用 REV-* 前缀，不能把已编写测试说明当作测试已通过。
- [ ] 每阶段实施前再次核对文件是否已被其他工作修复；允许记录“无须再修改+证据”。

**验收**：14 项及 4 项横切任务各有事实依据、优先级、对应文件和验证入口。

## 4. S1 安全与身份：第一批

### G-02｜MFA 当前需求矛盾（P1，建议直接采纳）

**相关文件**：docs/spec/requirements.md；docs/architecture/applications/admin-console.md；docs/architecture/domains/platform-admin-and-account-lifecycle.md；docs/Plans/aisencore-mvp/aisencore-u03-u11-user-decisions-2026-10-22.md；D3/F04/Auth 性能设计。

**方案及步骤**：
- [ ] 将 requirements §11“暂缓 MFA 诉求冲突”替换为当前事实：Admin TOTP MFA **MVP 必做**；备用恢复身份/责任与演练待落实。
- [ ] 确认 §6、管理员领域、D3/F04、低请求量 Auth 专项均是“登录 → 官方 TOTP enroll/challenge/verify → aal2 → 当前管理员资格”，并区分普通用户不强制 MFA。
- [ ] 已验证 aal2 会话中日常读写不额外发 MFA challenge/getUser；JWT 降级、失效或新登录仍执行官方挑战。
- [ ] 清理现行需求中“2026-10-22 最新决定”式补丁，历史由 Git/决议记录追溯。

**验收 REV-G02**：全文没有“Admin 是否启用 MFA 尚存冲突”；管理员 aal1 无法读写敏感管理 API；不因前端导航重复挑战 TOTP。

### B-01｜兑换码侧信道和先后校验（P1）

**相关文件**：docs/architecture/database/entitlements-and-redemption-constraints.md；domains/billing-and-entitlements.md；backend/api-contract-and-mvp-acceptance.md；database/database-access-and-transactions.md；D1、D2、F01～F04、F05～F08 实施设计。

**建议契约（需 DEC-01 批准）**：将 redeem_code(code) 调整为 redeem_code(product_key, code)，客户端显式声明目标产品；产品标识不可信，必须与真实 code 归属再核对。执行顺序：JWT/blocked → 用户限流状态 → 产品存在/active 与成员 none/active/left/suspended → 码存在与跨产品/撤销/用尽/到期/历史已兑 → 按共同锁序重验并成功核销。未入会 none 可在有效兑换成功后创建 active，失败绝不自动入会。

- [ ] 制定成员状态 × 码有效性 × 是否已兑矩阵；对 left/suspended 在**不查码**的情况下独立拒绝，不能让错误消息取决于真实 code 是否存在。
- [ ] 对新兑换者：未知、跨产品、撤销、过期、用尽统一不可用错误并按既定窗口统计失败；历史已兑的 REDEEM_ALREADY_USED 应保留已确认优先级，但不绕过 blocked/限流及已定成员限制。
- [ ] 原型签名变化需逐一更新调用方和错误文档，明确旧版本兼容或迁移窗口，禁止突然破坏已上线客户端。
- [ ] 调整 L1/L2/L3/L5/L6/L7 取锁与重验语义；hash 初次定位只作非锁定线索，成功时才创建成员、grant、redemption、码次数和审计。
- [ ] 保留至少 128 bit 有效熵及外层滥用防护；不得将码有效性差异、码 hash 或明文写入日志。

**验收 REV-B01-01～08**：针对 none/active/left/suspended、有效/未知/跨产品/已撤/过期/用尽/已兑组合检查 HTTP/业务错误、限流次数和副作用；失败仅可写预期限流，不能产生会员/grant/码次数；并发不超兑、不重复授权、不错误自动入会。

### B-02｜失败事务、L0 锁粒度和 Advisory Lock 命名空间（P1）

**相关文件**：docs/architecture/database/database-access-and-transactions.md、entitlements-and-redemption-constraints.md；docs/Plans/aisencore-mvp/aisencore-f01-f04-security-convergence-design.md、aisencore-mvp-d1-database-implementation-design.md、aisencore-mvp-d4-test-and-readiness-review.md。

- [ ] 默认采用**业务拒绝在核销写入前判定，技术异常使整笔事务回滚**；仅将失败限流放在允许正常返回的明确路径。不要过早用宽泛 EXCEPTION 子事务吞掉未知异常；如真实存在不得不先写后拒绝的情况，再用窄范围子事务显式回滚。
- [ ] 评估 L0 共享/排他：普通管理写持共享事务锁，授予/撤销管理员与影响有效管理员人数的全局封禁持排他锁；每个管理入口取锁后重新核验 aal2、active、blocked。锁序不变，M1“至少一名合格管理员”不变。
- [ ] 统一 L0/L1/L7 lock 编码：固定 namespace/class_id、UUID/用户+套餐映射、字节序、哈希算法、锁序和范围；如果采用双 int4 版本，**同域 32-bit hash 仍可能碰撞**，应评估吞吐和概率，而不是声称绝对零碰撞。
- [ ] 记录 FK/UNIQUE/行锁的隐含锁影响、多对象按 UUID 固定排序、超时/死锁处理、有界重试规则。
- [ ] 真实隔离数据库双连接执行 LCK-01～07 和新增并发：普通发码/改套餐、撤权/管理写、封禁/redeem、两个同套餐 grant、码最后一次/撤销、失败计数保留但其他写全回滚。
- [ ] 性能优化只有在安全测试与等待时间实测均通过后才上线；否则允许保留现有全局排他 L0 作为较慢但可证明的 MVP 安全实现。

**验收 REV-B02**：不存在管理撤权后仍新写受保护数据、最后合格管理员被清零、码超兑、grant 交叠/重复或失败半提交；P50/P95 与死锁证据真实记录。

### A-04｜单人管理员 TOTP 丢设备恢复（生产前 P0）

**相关文件**：docs/architecture/domains/platform-admin-and-account-lifecycle.md；applications/admin-console.md；docs/Plans/aisencore-mvp/aisencore-mvp-d3-admin-infrastructure-design.md、aisencore-u03-u11-user-decisions-2026-10-22.md、TODO.md。

- [ ] 文档明确“数据库保留一名管理员”不等于“至少一名管理员持有可用 MFA 设备/会话”。
- [ ] 推荐两个独立、分别已验证的 TOTP 因子/设备；备用凭据离线隔离保管，不能进 Git、CI 或日志。实际恢复责任由本人确定。
- [ ] 规定主设备丢失、会话失效、第二因子不可用的身份核验/升级/回滚步骤；优先依托 Supabase Auth 官方支持的管理 MFA API，而不是直接把修改 auth.mfa_factors 当日常恢复方式。
- [ ] 恢复旧因子撤销、受影响会话失效、重新 enroll/verify、获得新 aal2 后再核资格，过程留必要审计。
- [ ] 在独立安全环境真实演练一次，包含恢复失败、无应急设备与旧会话被拒绝。未经演练不批准公众上线。

**验收 REV-A04**：恢复主体、步骤、密钥保管、审计、撤销及演练证据齐全；无未授权降级至 aal1 的应急后门。

### X-01｜唯一业务状态和错误优先级矩阵

**权威文件**：docs/architecture/backend/api-contract-and-mvp-acceptance.md（其他领域架构引用）。

- [ ] 为 CheckAccess/RedeemCode/EnsureMembership/Rejoin/管理 RPC 定义认证、blocked、产品状态、none/left/suspended、无权益、码无效/重复、限流、状态冲突、技术故障的固定优先级。
- [ ] 区分 HTTP 200+allowed=false、200+redeem ok=false、401、403、409、429、503；不把技术故障称为被封禁。
- [ ] 对他人邮箱、管理员资格、code 真伪的差异错误收敛，禁止泄露秘密和有效性探针。
- [ ] 明确每个拒绝分支允许持久化的唯一变更（如失败次数）与绝不允许的副作用；形成 B-01/B-02/A-02/A-03 共享验收表。

**验收 REV-X01**：相同条件不会在不同计划给出冲突错误码或不同写入副作用。

## 5. S2 权威文档、Free 和幂等：第二批

### G-01｜核心规则从 Plans 回归架构（P1）

**相关文件**：docs/spec/requirements.md；docs/architecture/database/database-access-and-transactions.md、entitlements-and-redemption-constraints.md；architecture/backend/api-contract-and-mvp-acceptance.md；architecture/applications/admin-console.md、admin-ui-design-system.md；各目录 README；对应 F01/F05/D1/D2/D3 计划。

- [ ] 清点 spec/architecture → Plans 引用，区分导航链接与实际规范独占；不机械删除全部双向链接。
- [ ] 将 F01 public SECURITY INVOKER/private SECURITY DEFINER 的角色权限边界、F02 锁序与命名空间、F03 对象不变量、F05 幂等/null 合同和 D3-UI 必要的稳定页面原则写入所属长期架构专题。
- [ ] 将临时施工步骤、真实 SDK 试验、兼容性检查留在 Plans；主架构只保留逻辑层次和专项入口，避免全文复制。
- [ ] 逐一修复失效相对链接/锚点、删除重复权威段落。坚持一处详细规范，多处引用。
- [ ] 模拟删除已完成 Plans：仅凭 spec+architecture+development 是否足以实施 API、权限、锁序和审计。

**验收 REV-G01**：删除过期执行计划不导致核心安全/幂等规则丢失；双向导航可以存在，但不能有反向规范依赖。

### M-01｜U03～U11 已确认状态同步（P1）

**相关文件**：docs/Plans/aisencore-mvp/aisencore-u03-u11-user-decisions-2026-10-22.md、aisencore-mvp-d0-scope-and-baseline.md、D1/D2/D3/F01/F05、TODO.md；docs/spec/requirements.md。

- [ ] U03 公众注册、U05 单人运营且 Admin MFA 必做为已确认事项；U04/U06～U11 按“行为已确认/具体参数待定/运行待验收”拆分。
- [ ] D0 标注为历史基线；D1/D2/D3/F01/F05 开头和结尾过期“U03～U11 均未确认”等声明删除，改为链接唯一的最新决议与 TODO。
- [ ] 100 张/批、最近校验 15 分钟、10 个备份版本、具体备份字段和费用等均不当作已批准生产值。
- [ ] spec 和架构保留**当前有效业务真相**，决策记录保留背景，TODO 只写未完成事项；不在六份计划中维护六套状态表。

**验收 REV-M01**：所有 U 项状态交叉阅读无矛盾；不存在已经确认又同时写成“未关闭政策冲突”的条目。

### B-03｜Free 默认版本与累计续期展示（P1）

**相关文件**：docs/architecture/domains/billing-and-entitlements.md；architecture/database/entitlements-and-redemption-constraints.md；architecture/backend/api-contract-and-mvp-acceptance.md；D1、D2、Auth/权益性能设计。

**候选（需 DEC-04）**：优先推荐区分“逻辑 Free”与“不可变的具体 Free 版本”，以产品 current/default_free_plan_id（或同等受控映射）切换 v1→v2；历史被引用的 grant/code 所绑定版本不变。成本更小的替代方案是禁止任何 free grant/code 使其可原地修改；仅作为备选，不能同时写为现行决定。

- [ ] 决定“已入会/未入会用户何时采用新版 Free”和“无 Free 配置”的明确语义；不静默修改任何已引用权益。
- [ ] 在 D1 设计版本引用、复合外键、冻结判定、修改默认指针时的锁及历史追踪。
- [ ] CheckAccess/GetMyProducts 区分 current_period_ends_at（当前阶段截止）、effective_ends_at（已经确认的同套餐连续授权最远截止）与 is_lifetime；评估保留旧 ends_at 的兼容关系。
- [ ] 同一套餐周期续期的 starts_at 在锁内取 max(可信当前时间, 最新未撤销周期 ends_at)，按固定天数计算；永久授权不伪装成无限续期。
- [ ] 未来 grant 尚未 starts_at 生效时不能提前开放未来套餐的 features/limits；不同套餐不错误叠加时长，额度同名最大值不相加。

**验收 REV-B03**：Free v1→v2 时历史授权不可变；用户剩余 3 天又取得 365 天连续授权，界面能展示累计最远到期日；续期前的实际能力仍正确。

### M-02｜指纹冗余、列权限和直授合同（P1）

**相关文件**：docs/architecture/database/entitlements-and-redemption-constraints.md；domains/billing-and-entitlements.md；backend/api-contract-and-mvp-acceptance.md；D1/D3/F05。

- [ ] 罗列 batch 与 admin grant 已持久化字段、请求身份、默认值、NULL 三态、UTC 微秒精度和 reason 规范化；确定同 key 等价输入如何比较。
- [ ] 对 redemption_code_batches 的 config_fingerprint 优先选择“直接比较强类型实际字段 + IS NOT DISTINCT FROM”，去除不必要的 canonical JSON 摘要版本维护。仍必须在唯一键竞争后再次检查参数一致。
- [ ] 对 entitlement_grants 的 admin_request_fingerprint 评估同法删除，**或**把必需的额外请求元数据放入受保护 private 幂等表；不能无条件删除后破坏不同请求同键冲突检测。
- [ ] 解决列级 GRANT 与 select=* 风险：用户本人/管理员/普通用户读取只允许安全列，验证隐藏技术列不影响合法查询，管理发码码 hash 永不暴露。
- [ ] 直授区分“duration_days 自动顺延”（时段由 DB L7 锁内计算）和“显式 starts_at/ends_at 绝对授权”（包括 NULL 永久），规定非法组合与重试如何复用**首次已计算结果**，避免每次根据 now() 产生新指纹。
- [ ] source_ref 使用 actor/request_id 命名空间，同键同参数仅返回原 grant 或批次非秘密摘要、无新审计；不同参数 STATE_CONFLICT；发码明文只首次创建成功返回，任何重放不再显示。

**验收 REV-M02**：F05-C01～12 及新用例验证空/NULL/时区/幂等/并发；无多余哈希成本、无权限 42501（合法 select=* 仅在允许的视图/表上）、无重复 grant/发码与明文重显。

### X-04｜重大设计选择先批准，再作为正式架构写入

- [ ] 本文第 9 节 DEC-01～06 统一记录原约束、建议、替代方案、收益、风险、批准者与受影响文件。
- [ ] 未批准时按已有需求约束保持不变，先执行不依赖决定的分析与测试设计。
- [ ] 获批后才同时更新 spec/architecture、D/F 计划与客户端合同；不把“审查者偏好”直接写为用户决策。
- [ ] 拒绝方案也要写明保持旧方案的验收条件，避免以后审查反复提出同一未批准变更。

**验收 REV-X04**：每个重大边界调整都有明确的用户确认/记录，而非“默认同意”。

## 6. S3 R2 和成员邮箱查询：第三批

### G-03｜R2 验证组件归属（P1）

**相关文件**：docs/architecture/current-main-architecture.md；architecture/infrastructure/tech-stack.md；architecture/database/product-data-and-files.md；architecture/applications/local-first.md；F03/D2。

- [ ] 依 DEC-02 选择：**A** 少量非敏感 JSON 经受保护 Edge 接收、Schema 白名单校验后直写 R2；**B** 继续客户端直传 R2，正式加入可信 Cloudflare Worker/窄产品验证层，写清 Edge→Worker 鉴权与 R2 最小权限。
- [ ] 若 A：明确修改“所有对象字节不经过 Supabase”的例外边界，限定为非敏感、小体积配置；仍禁止视频、用户 AI Key、整个拉片项目经公共 AisenCore 中转。
- [ ] 若 B：补主架构图、技术栈、密钥/网络调用、权限与配额成本，不保留计划里有组件而主架构里没组件的状态。
- [ ] 两方案均必须服务端限制大小/白名单/摘要、生成唯一 final key、禁止客户端 final PUT、短期签发并于下载时重新鉴权。

**验收 REV-G03**：主架构、基础设施和 F03/D2 采用同一实际路径，没有“幽灵 Worker”或互相矛盾的字节流规则。

### M-03｜配置备份瘦身、预留释放及非原子补偿（P1）

**相关文件**：D2、F03、docs/architecture/database/product-data-and-files.md；backend/api-contract-and-mvp-acceptance.md；D4。

**推荐方案（待 DEC-02）**：对 JSON 字段白名单和大小上限（256 KiB 仅为建议，**未批准**）清晰固定后，受保护 Edge 接收 JSON → 校验 JWT/产品/成员/权益/属主 → 原子检查配额和 request_id → 对 R2 条件创建唯一 final 对象 → DB 标 ready、存字节数与 SHA-256。若选择直传，则保留必要的 staging/final 和条件复制验证组件，不能将不同方案混写。

- [ ] 冻结一个可实现时序与必须的状态（pending、ready、failed、deleting/deleted；verifying 仅有真实需要时才留），去掉无价值的中间环节。
- [ ] ready 用量 + 未过期 pending/verifying 预留才参与当前可用额度；expired reservation 在查询逻辑中即时失效，避免断网导致永久配额占用。
- [ ] 针对两设备同传、重放 request_id、URL 仍有效时重复 PUT、R2 成功 DB 失败、DB 成功响应丢失、重复 complete/删除、孤儿 final、定时清理不可用等写失败矩阵。
- [ ] 逻辑预留过期**不代表 R2 实际对象已删**；仍要有清理执行者、过期策略、可重试对账及空间成本监控。
- [ ] 对 R2 ETag 与条件写/条件 CopyObject 的 SDK 当前能力实际测试；不能把 HEAD/ETag 当可信 JSON 校验或强原子跨系统事务。
- [ ] 坚持 U09/U10 现行产品边界：非敏感字段明确白名单、用户手动选版本、预览差异、确认后替换选定类别；版本上限/保留期还待用户决定。

**验收 REV-M03-01～08**：断网 pending 不永久锁住额度；失败后不会产生可公开下载的未 ready 数据；旧签名不覆盖 final；重试不双计费、不丢属主、不泄露他人备份；孤儿对象能定位/安全清理。

### A-02｜成员等 Admin 列表批量补邮箱（P1）

**相关文件**：docs/architecture/applications/admin-console.md；database/database-access-and-transactions.md；backend/api-contract-and-mvp-acceptance.md；D3/D3-UI。

- [ ] 首选评估受保护 PostgreSQL 只读 RPC：public invoker 外壳 → private 限权 definer 内核，真实 JWT 且 aal2、platform_admins.active、非 blocked 方可读取 auth.users 的**最小字段**。
- [ ] 参数允许有限 UUID[]（例如最多 50 个）、受约束精确 email、分页 limit/offset；禁止任意 SQL、搜索越权和批量导出完整用户表。
- [ ] 先验证在真实 Supabase PostgreSQL 权限/RLS/PostgREST 中能否安全访问 auth schema、实际索引与数据库负载；不能未经测量承诺 2ms。
- [ ] 不能通过时保留受保护 Edge 用户查询或受控管理员身份投影；单页邮箱补全仍应统一为**批量**调用而非 25～50 次逐个 getUserById。
- [ ] 同步用户/成员/授权/兑换/审计页面的字段白名单与加载/失败降级；合理时候显示 UUID，不因邮箱查询失败阻塞管理主列表。
- [ ] 身份读取与高权限 Auth Admin 账号修改是两类操作；不得为消除 N+1 误删真正需要 Auth Admin API 的功能。

**验收 REV-A02**：50 行成员邮箱补全没有 50 次 Auth Admin 网络请求；普通用户、被撤管理员、aal1 不能获取邮箱；准确性、分页与 P50/P95 均有真实证据。

### X-02｜跨系统故障与幂等恢复矩阵

- [ ] 给 R2 上传/删除/签发/清理、Auth 因子恢复及未来支付回调建立“用户操作—DB 状态—外部服务状态—request_id—不确定结果—重试/补偿—人工处理”矩阵。
- [ ] 任何独立 HTTP/SDK/R2 操作不得假装与 PG 同事务；明确最终一致与短期 URL 已签发后的撤权时差。
- [ ] 定义孤儿对象/过期预留的回收时效与可观察指标、错误上报、人工恢复的最小权限。

**验收 REV-X02**：每种单边成功/另一边失败都有不越权、可重复执行的恢复路径；未知状态不能盲目重发兑换码或 grant。

## 7. S4 Admin 体验与工程：第四批

### A-01｜UI-G0 可执行化，而非无审批取消（P1）

**相关文件**：docs/spec/requirements.md；architecture/applications/admin-ui-design-system.md、admin-console.md；D3-UI；docs/development/frontend/admin-design-rules.json 与指南；TODO.md。

**提案（需 DEC-03）**：把 UI-G0 区分为 G0A **视觉 Token、代表性高保真和用户签收** → G0B **获准后的 React-admin + MUI Theme/Mock 真实代码原型** → UI-G3 **全部核心页面浏览器交互/安全/响应式/无障碍验收**。这不是将“无需视觉审批”作为新规则。

- [ ] 将 62 条规则分为安全/可访问性硬要求、共用视觉 Token 与建议性参考，减少重复画板与机械逐屏签收。
- [ ] 保留四类典型交互：登录/MFA、发码及一次性明文、套餐冻结、用户/成员；利用共用 Shell/表格/表单/对话框抽取可复用样式，而非每个资源独立建系统。
- [ ] 桌面为主要工作场景，窄屏仍需支持登录/MFA、必要应急操作、可阅读错误态，不能忽略基本键盘/对比度/溢出检查；具体覆盖宽度按批准的 DEC-03 执行。
- [ ] **用户批准更改之前**，现有 UI-G0 = BLOCKED，禁止 apps/admin 正式 Theme/Layout/业务页面代码；可继续独立且已授权的后端规划。
- [ ] 获准后在真实浏览器用 MUI/React-admin 官方组件制作少量原型、记录可见截图/版号/明确签收；UI-G3 不能因原型签收而自动 PASS。

**验收 REV-A01**：减少不必要设计劳动但保留单一 Theme、真实视觉质量、危险操作确认、明文安全与无障碍，不依赖“没反对即批准”。

### A-03｜将标准 DataProvider 与管理专用命令相结合（P2）

**相关文件**：docs/architecture/applications/admin-console.md；D3/D3-UI；docs/development/frontend/。

- [ ] 完整列出 Resource→读字段/视图→操作 RPC→响应 record→缓存失效表。
- [ ] 正常创建产品/套餐等资源性操作优先在标准 dataProvider.create/update 内转调**受保护的单个 RPC**，复用 React-admin 表单、通知、数据刷新；不是直接 PATCH 受保护表。
- [ ] 撤销、封禁、批量发码、第一次明文显示等不可逆/特殊操作使用显式自定义 DataProvider 方法或 Mutation，成功后刷新关联查询；不能把所有命令强行伪装为 CRUD。
- [ ] redemption_codes 读取考虑无 code_hash 安全投影视图，并验证真正的 GRANT/RLS、security_invoker 和 SELECT 列白名单；不能仅靠 UI 不显示哈希。
- [ ] 401/403/409/429/503、UNKNOWN 超时与 request_id 重试规则统一；首次明文仅组件易失状态，禁止写 Query Cache、URL、localStorage、日志或遥测。
- [ ] 核对使用的 React-admin/ra-supabase 版本与官方自定义方法/缓存机制，避免叠加第二套 UI、路由、表单、状态框架。

**验收 REV-A03**：原生表单/查询体验可用，特殊管理操作安全确认和审计不削弱，缓存失效明确、无明文泄漏和任意 CRUD 越权。

### G-04｜行尾规范化（P2）

**相关文件**：仓库根目录 .gitattributes，必要的工程指南。

- [ ] 先根据 git status/diff/attributes 核验真实现状；当前 main 不存在报告所述已产生的 47 文件翻转。
- [ ] 为 md/json/ts/tsx/sql/yaml 等文本设置稳定 LF；确需 CRLF 的 Windows .bat/.cmd 单独指定；二进制不做文本换行归一。
- [ ] 规范化单独变更，执行有界 git add --renormalize/diff --check 和语义对照；不可与业务规则编辑混为一组。
- [ ] 未获 Git 提交授权时仅提交建议/本地可检查的更改，不自动 commit、push。

**验收 REV-G04**：Windows/其他平台切换无全文件伪 diff，规范化未改业务文本。

## 8. S5 统一验证和收尾

### X-03｜证据优先的验收体系

必须区分 **文档完成** 与 **运行验证完成**：
- [ ] **静态**：需求与架构无相互冲突、Plans 不独占核心真相、相对链接/锚点有效、G/B/M/A 每项有准确结论。
- [ ] **数据库**（未来获准后）：GRANT/RLS/owner/SECURITY DEFINER 权限拒绝；LCK-01～07 双连接；兑换码枚举/限流/事务、Free 切版、授权幂等/续期与管理封禁竞争。
- [ ] **RPC 合同**：F05-C01～12、V00～07 及 REV 用例检验参数默认/null/时区/重复请求、码仅一次返回明文、接口响应兼容。
- [ ] **Auth/MFA**：AUTH-P01～12，aal1 与被撤权管理员拒绝、aal2 低打扰、两个 TOTP 因子及应急恢复演练。
- [ ] **R2/产品**：属主、短期签发、最终对象不可重复写、大小/Schema、过期 pending 释放、R2/DB 单侧故障和真实用量。
- [ ] **Admin/UI**：D3-UI-X01～18、UI-G0 真正获准、UI-G3 浏览器截图/键盘/响应式/错误、Query 缓存与账号查询 P50/P95。
- [ ] 对所有不能执行的场景标记 NOT RUN / BLOCKED，写明缺少的环境/权限及下一触发条件，**绝不推测 PASS**。

### CLOSE-01｜逐项闭环

执行每一项后登记以下五项：问题 ID、当前状态（NOT STARTED / IN PROGRESS / BLOCKED / VERIFIED / DEFERRED）、变更目标与证据、对应批准的 DEC、待验证/后续 TODO。

专项关闭条件：
1. [ ] 14 项全部具有已证明的解决结论、无需修改的现状证据或明确获批的延期；安全/正式公开运营硬门槛不得因 DEFERRED 就被视为通过。
2. [ ] X-01～X-04 与主架构、D1/D2/D3/F 计划的结果一致。
3. [ ] 需要运行验证的项目保留真实证据与失败记录；未运行项目继续 TODO，不写“系统 READY”。
4. [ ] 完成的长期规则归入 spec/architecture/development；过期重复计划依 Plans/README 的完成与删除规则清理，避免第二套永久真相。
5. [ ] 代码/数据库/发布状态不因文档计划完成而改变。

## 9. 必须单独批准的六项决策

| ID | 决策 | 推荐 | 未批准前必须保持 |
| --- | --- | --- | --- |
| **DEC-01** | redeem_code 增加 product_key 及旧接口过渡 | 显式产品，码归属二次检查 | 现行签名/业务按旧合同，先做安全测试与设计 |
| **DEC-02** | 备份非敏感小 JSON 是否允许经 Edge 中转、限制大小 | 经批准时首选简化 Edge；256 KiB 只是候选 | 当前客户端 R2 直传和可信 final 约束，不能偷删 Worker |
| **DEC-03** | UI-G0 G0A/G0B 分级、宽度与画板数量优化 | 保留真实视觉签收，最小原型辅助 | 现行 UI-G0 = BLOCKED，禁止正式 Admin 编码 |
| **DEC-04** | Free 基础套餐版本演化 | 推荐当前 Free 版本指针 + 不可变历史 | 现行冻结语义；不修改已发行权益 |
| **DEC-05** | 直授“按时长顺延/绝对时段”与幂等指纹替代 | 两种明确操作 + 已存强类型列比较优先 | 不无条件删除技术列/破坏重试 |
| **DEC-06** | Admin 用户邮箱批量查询采用 SQL RPC/Edge/受限投影 | 有条件优先受限 SQL RPC，真实权限验证 | 不向普通 Data API 暴露 auth.users |

**已经确认无需重新提问**：Admin TOTP MFA 包含在 MVP；单人运营；Aisenlens Free 离线基础能力；云备份只含经允许的非敏感配置/模板；首批 AI Key 由用户本地自持；公众开放是**未来运营目标**，不代表已准许发布。

## 10. 风险与回退

| 风险 | 守住的底线 | 不通过时回退/处理 |
| --- | --- | --- |
| B-01 新签名破坏旧客户端 | 兑换可用性和错误语义 | 阻止发布、先维护兼容入口 |
| B-02 L0 共享锁竞态或死锁 | M1、封禁/管理资格实时核验 | 保留全局排他 L0 |
| B-03 Free 切版改历史权益 | 历史 grant/code 不可变 | 暂不切换 Free 默认指针 |
| M-02 去指纹后重复授权 | 同 request_id 幂等及不同参数冲突 | 保留原摘要/私有幂等账，直到替代验证 |
| M-03 Edge 简化后双写失败 | 最终对象不被客户端覆盖、额度正确 | 保留经验证 staging/final 方案 |
| A-02 私有 auth.users 查询泄露 | aal2+当前资格+字段白名单 | 仍用可信 Edge 或受控投影 |
| A-01 原门禁被误解除 | 所有者真实视觉批准与安全交互 | 维持原 UI-G0 |
| 改动与用户本地文件冲突 | 不覆盖其他人未提交修改 | 停止该文件更改并重新核对 |

## 11. MCP-01｜延期评估，不属于本轮修复

审查报告附加的两项 MCP 构想：Aisenlens 本机 MCP Server（项目、时间轴、模板/切片资源）与 AisenCore 单人 Admin 本机 MCP Server（受保护管理 RPC）。**当前不加入 MVP、不建设托管多租户 MCP Server**。

未来仅在用户提出明确 AI 工具对接场景且独立批准后，再评估：本地 stdio/localhost 暴露、项目目录沙箱、读/写权限隔离、危险命令逐次确认、提示注入、隐私和用户自带 API Key 保护。Admin MCP 如实施，必须复用可信 JWT/aal2/管理员资格、幂等、审计与人工确认，不能让自然语言直接绕过高风险控制。另建计划，不把它当作 14 项已确认缺陷。

## 12. 计划初始记录

| 日期 | 内容 | 状态 | 说明 |
| --- | --- | --- | --- |
| 2026-10-22 | 审查报告与当前文档交叉评议，编制本修复计划 | 文档编制 | 无代码/DB/Edge/R2/UI 实测 |
| 待执行 | S0 基线与需要批准的 DEC 确认 | NOT STARTED | 每阶段施工前再次核验分支 |
| 待执行 | S1～S4 规范与实现修复 | NOT STARTED | 需独立实施许可 |
| 待执行 | S5 真实运行验收 | NOT RUN | 不以测试设计代替测试通过 |
| 待条件触发 | MCP-01 | DEFERRED | 未来产品需求单独立项 |

> **项目约束**：优先复用 React-admin 与 Supabase Auth 的成熟能力；UI 避免无必要次级标签/说明，不额外造并行框架；不会仅因修复计划建立就自动授权开始开发。
