# S1～S4｜候选架构细化、故障补偿与验收矩阵

> **DEC-01～06 RECOMMENDED A APPROVED / RUNTIME NOT RUN** · 2026-10-22。六项的 A 路线已获项目所有者明确批准并写入 [spec](../../spec/requirements.md) 和 [architecture](../../architecture/README.md)；本文件保留**候选比较、历史风险、故障注入与测试输入**，不是已编译的 SQL、云配置或实际接口。**UI-G0A 四类可见高保真与用户视觉签收仍未发生**，不代表可启动前端编码。

## 1. 决策依赖与最小变更集

| 决策 | 已批准 A（仍待实现） | 未采用的替代 | 实施联动对象 |
| --- | --- | --- | --- |
| **DEC-01** | 增加目标 product_key，先按产品/成员判再读取 code | 继续单码参数，但必须通过隔离测试证实不泄露成员状态/码有效性，否则禁止公开兑换 | API/权益/数据库/锁序、Aisenlens 和其他调用方、兼容策略 |
| **DEC-02** | 已限制字段的小 JSON 走受保护 Edge → R2，不做公众中转 | 客户端 staging 直传、可信 Worker 验证和条件 final 复制 | spec 字节流铁律例外（仅采用 Edge 时）、主架构/基础设施、R2 元数据与 D2/F03 |
| **DEC-03** | G0A 视觉 Token/高保真签收 → G0B 获准 React-admin 原型 → G3 实际 E2E | 保留现行全部视觉签收门禁 | requirements/UI 设计系统、Admin、D3-UI、TODO |
| **DEC-04** | 产品的“当前 Free 版本指针”，历史 grant/code 引用不可变 plan_id | 禁止 Free 作为 grant/code 发行对象，才允许按确认规则更新逻辑 Free | 计费领域/DB/CheckAccess/Free 切换流程与迁移 |
| **DEC-05** | 强类型参数与首次已计算结果比较；不必要的批次指纹精简 | 保留私有不可读指纹或将必要差异元数据置于受控幂等表 | grant/batch 数据模型、admin RPC、列级 SELECT 和 F05 |
| **DEC-06** | 先验证受限 SQL RPC 批量读取 auth.users 必要字段 | 受保护 Edge 聚合查询或受控管理员身份投影 | 数据库访问、API、Admin 查询资源、隐私审计与缓存 |

审批记录至少必须包括：决定 ID、批准人/日期、最终选择、兼容窗口、允许的安全折衷、替代被否决原因、要变更的文件、回滚触发。本次已将六项 A 路线写入权威，具体批准和无需再次选择的回退规则见[owner 记录](./owner-batch-decisions.md)，真实测试与兼容版本仍未验证。

## 2. B-01 / X-01：兑换错误隔离与状态矩阵（DEC-01）

候选新请求为 `redeem_code(product_key, code)`。客户端 product_key 是**不可信的用户意图声明**，不能代替服务器从 code 表取得的真实 product_id；核销时必须核对两者一致。

**已批准的判定顺序（待 SQL 实施）**：JWT → 全局 blocked → 用户限流 → 声明产品存在/active → 声明产品的成员状态（left/suspended 在查码前一致拒绝）→ code hash/跨产品/当前状态 → 同一 L1～L7 锁序内重新验证 → L8 才写成功变更。仅不需要检验的层级可以跳过，不得为补取先前锁而逆序加锁。当前锁序采用全局 L0 排他处理 Admin 变更，不因新签名而自动优化共享锁。

| 状态与输入 | 候选对外结果 | 限流 / 存储副作用 |
| --- | --- | --- |
| JWT 无效或 blocked | 认证/限制错误，优先于任何 code 线索 | 不读码、不创建成员/grant；具体拒绝映射以 API 权威为准 |
| 声明产品下 left / suspended，输入有效、随机、跨产品、撤销、过期或用尽码 | 每种码内容给**相同**成员拒绝；响应时序不得构成明显码有效性探针 | 不读码，不创建成员/授权；是否计入“失败次数”须确认既定限流口径并一致执行，避免无限廉价探测 |
| 声明产品下 none / active，输入未知、跨产品、撤销、过期或用尽码 | 统一 `REDEEM_CODE_INVALID` | 按同一个失败限流窗口计数，**没有**成员、grant、redemption、码次数变化 |
| none / active，已成功兑过本码 | 在 blocked/限流及成员规则之后按现有 `REDEEM_ALREADY_USED` 语义处理 | 不重复授予、不重显秘密、不重复计数；left/suspended 优先级必须通过 DEC-01 同步明确 |
| none / active，目标产品与真实 code 一致、可核销 | 原子成功；none 才创建 active 成员 | L8 创建成员/事件（如需）、grant、redemption、次数和正确审计，一并提交或全部回滚 |
| SQL、锁超时或审计技术故障 | 真实 5xx/503/未知结果，不伪装业务拒绝 | DB 事务回滚；调用方先按本人记录查询确定结果后有界重试 |

**反枚举验收**：REV-B01-01～08 应组合不同 membership 状态 × valid/invalid/cross-product/revoked/expired/exhausted/used、匿名与 blocked，检查业务码、是否触码表、失败计数、耗时分布与并发超兑。现有“不低于 128 bit 有效熵 + per-user 限流 + 外层反滥用”保留，避免把设计风险虚构成已证明的无限暴力枚举。

**兼容性要求**：不能原地替换仍可能被旧客户端调用的公开 RPC。决定后先为新签名设计明确版本切换/兼容入口/错误文档迁移和客户端发布顺序；若旧签名继续允许侧信道访问，则新签名本身不构成完整修复。

## 3. B-03 / M-02：Free、续期与幂等的同一时间合同（DEC-04、DEC-05）

**已批准的 Free 版本设计**：产品具有一个服务端受控的 current/default Free plan 指针；历史被 grant/code 引用的具体 plan.id 保留原 features/limits。旧版本可以不再作为默认，但不可原地改变已承诺的权益。必须决定：现有成员/新成员/匿名本地 Free 是否立即采用新默认、无 Free 指针的能力语义、Free 版本切换审计及受控回滚。不要默认所有 Free 权益记录可自动迁移。

**周期时间契约**：`starts_at`、`ends_at` 以可信 DB UTC 时间存储；续期时在 L7 锁内计算 `starts_at=max(可信时刻, 同用户同套餐最新未撤销的周期 ends_at)`，再加明确的固定天数，且只读取与该套餐有关的连续周期。区分：
- `current_period_ends_at`：**当前已生效**授权的截止，不能把未来 grant 提前激活。
- `effective_ends_at`：在**未撤销、已确认、可连续衔接**的同套餐未来授权链上最远的截止，仅供展示及续期解释。
- `is_lifetime`：单独布尔语义，`ends_at IS NULL` 永久授权不伪装为某个巨大日期；不同套餐时段不累计、同名 limits 取最大而非相加。

**直授输入互斥（已批准）**：`duration_days` 自动顺延模式与显式 `starts_at/ends_at` 绝对授权模式二选一；显式永久与未指定结束时间必须被请求 schema 明确区分（不能把“字段缺失”默认为无限授权）。客户端提交 actor-scoped `request_id`，服务端在首次请求锁内**先持久化原始规范化语义与已计算的时间结果**。同键重放返回首个 grant 的非秘密摘要；相同键+不同有效参数给 `STATE_CONFLICT`，不能用新的 `now()` 重算后误判请求不同。

**去指纹的限定条件**：批次 `config_fingerprint` 可以在已有强类型字段完整表达输入时用 `IS NOT DISTINCT FROM` 语义比较替代，前提是竞争条件下也能比较一致；admin grant 指纹若包含 reason、字段是否缺省、时区/时间模式等无法从当前公开列恢复的信息，必须保留受限技术列或受控 private 幂等行，不可“一删了之”。合法的普通 `select=*` 仅应发生在有列级安全保障的视图/表，不能为修补 42501 重新公开 hash/敏感元数据。

**验收边界**：Free v1→v2 不更改历史购买/发码；剩余 3 天再兑换 365 天只修改展示最远期，不提前赋予未来权益；永久 Pro 独立；两台设备同套餐续期不重叠；重复请求/不同参数冲突；NULL/缺省/UTC 微秒与 RLS SELECT 均有实测。

## 4. G-03 / M-03 / X-02：R2 可信提交与非原子补偿（DEC-02）

两条路线共有的**安全不变量**：客户端永远无 final 对象覆盖权限；R2 final key 应每次唯一，只有可信受限组件在白名单 JSON 验证、大小/摘要校验之后创建；所有下载/列举通过当前 JWT、产品、成员、权益与属主重新授权；任何 signed URL 存在短期撤权窗口；DB 存储私有对象 key、owner、size、sha256、状态和幂等 request_id，不把 ETag 当作 JSON 安全校验。

**路线 A（已批准，待实现）**：客户端仅上传实际允许的非敏感配置 JSON 至受保护 Edge，Edge 按白名单 schema + 受限 body 大小检查，取得幂等 DB 配额预留，再以可信身份条件创建唯一 final R2 对象，然后更新 DB 为 ready。不得承接视频、项目文件、AI Key/Token 或任意未批准 JSON；即使 Edge 中转，DB/R2 也不构成同事务。

**路线 B（未采用：仅供历史方案对照）**：DB 申请短期 staging 上传许可 → 客户端只能写 staging → 可信 Worker 或等价的**已正式收编**组件解析/校验 JSON、摘要及权限 → 条件复制/创建**不可被客户端 PUT 的唯一 final key** → DB ready；清理 staging 和孤儿。必须实际核验当前 R2 SDK 条件请求/CopyObject/ETag 限制，不能把 HEAD 当成内容验证。

**统一状态与配额候选**：`pending`（有限时预留）→ `ready` 或 `failed`；删除使用明确 `deleting`→`deleted`（仅当业务真的需要）。不要引入不受控的永久 `verifying`。配额占用 = ready 的实际字节 + **尚未过期** pending/真实 verifying 预留；逻辑过期即时释放可用额度，**但不表示 R2 已删除对象**。

| 故障注入 | DB/R2 可能状态 | 重试、补偿和判定（不允许的动作） |
| --- | --- | --- |
| intent 成功后客户端断网 | DB pending、无 R2 或残余 staging | pending 超时后**查询立即不占有效额度**；reconciler 有界清除元数据/临时对象，不允许永久锁额度 |
| Edge/Worker R2 创建成功、DB ready 提交失败 | pending + 孤儿 final | 以稳定 request_id/对象 key 对账，确认 owner/hash/大小后幂等完成或隔离删除；**不向客户端签发未 ready 对象** |
| DB ready 成功、HTTP 响应丢失 | ready + final 已存在 | 同 request_id 查询稳定结果，**不重新上传或双重计费** |
| 旧短 URL 在撤权后仍有效 | 旧 URL 可请求 staging；不应拥有 final 写权 | 缩短 TTL、禁止 final PUT、可信提交前重验；不能声称旧 URL 瞬时失效 |
| 多设备同 request_id 或两个不同请求同时上传 | 竞争 reservation/final | DB 唯一约束和锁内配额、条件创建；重复相同语义返回原结果，不同参数 `STATE_CONFLICT` |
| 删除 DB 先成功、R2 删除失败，或反之 | deleting + 对象存在，或对象已无但 DB 未关账 | 删除任务幂等，持续安全重试和对账；不得因某一边成功就隐瞒对象仍留存 |
| 定时清理不可用、过期预留/孤儿堆积 | 逻辑额度可用但有物理存储成本 | 按对象状态/创建时间进行有界扫描、告警、人工最小权限介入；明确运维责任/恢复目标后才上线 |
| R2 对象 ETag 与声明 hash 不一致 | 不可信对象 | 不提升 ready，隔离并触发技术错误/对账，不用 ETag 代替可信 SHA-256 |

**验证门槛**：REV-M03-01～08 记录每种故障的请求 ID、DB/R2 双边状态、允许下载与否、可重试时效、对象账实、恢复证据。U09 的白名单字段、单对象大小、U10 的版本数量/保留期及回滚交互仍是产品实现前待批准输入，不将 256KiB / 10 版自动视为生产阈值。

## 5. A-02 / A-03：Admin 读/写复用与缓存边界（DEC-06）

**标准资源读取**复用 React-admin DataProvider 的 `getList/getOne/getMany` 与 PostgREST + RLS，仅取最小安全列。产品、套餐等常规资源表单的 `create/update` 适配**对应单次受保护 RPC**，不要浏览器 PATCH 受控写表；封禁、撤销、批量发码、直授等风险命令使用显式自定义 Mutation/DataProvider 方法。**不能用一个孤立 rpcAdapter 覆盖所有标准 Provider 工作流**，也不应为每个资源自建完整 UI/路由/表单/缓存系统。

| Resource / 场景 | 读取 | 写入/刷新 |
| --- | --- | --- |
| 产品、套餐 | RLS 安全投影的分页/详情 | 标准 DataProvider create/update → 单 RPC；刷新该资源及产品相关权益 |
| 成员 | RLS 列表分页、必要邮箱批量只读补全 | suspend/restore 用危险操作 Mutation；刷新成员及相关授权详情 |
| 兑换码和批次 | **无 code_hash、无明文**的安全视图 | createCodes/revokeCode 自定义高风险方法；刷新批次/码列表 |
| 授权 | 本人/管理员受控安全列视图 | grant/revoke 受控 RPC；刷新授权、CheckAccess 相关视图 |
| 账号 / 管理员资格 | Auth Admin 必需字段经可信查询；管理员资格不依赖 UI 缓存 | Auth Admin 高权限操作仍经 Edge + DB 权限门禁；管理资格变更刷新授权与 Admin 登录状态 |
| 审计 | 只读限权、脱密分页 | 不允许浏览器创建/修改审计 |

**邮箱查询**：当前按 25～50 个 UUID 调用 Auth Admin getUserById 是可测量的 N+1 风险，不得臆称存在 SDK 原生批量 ID API。DEC-06 已批准优先受限只读 SQL RPC（不可安全实施则回退 Edge）（private 限权内核，真实 JWT + aal2 + 当前管理员资格，限制 UUID 数量/精确邮箱/返回字段/分页）或已有可信 Edge 的限并发聚合/受控身份投影。先在真实 Supabase RLS/GRANT/PostgREST 验证访问 auth.users 与性能，**不能承诺固定 2ms**。补邮箱失败应允许主列表显示 UUID，不能因为跨服务失败误报业务对象不存在。

**一次性码明文**只保存在**当次结果组件的易失内存**中，严禁 TanStack Query cache、localStorage、URL、审计、日志及遥测。操作超时或不确定结果先按 request_id 查询实际状态，绝不能重放后重显明文。权限错误按 X-01 处理；保留 UI-G0 视觉签收前正式编码禁令。

## 6. 实施工单与验收证据格式

每个问题必须能填写：`issue_id`、事实等级 DOC/RISK/RUNTIME、初始 branch/HEAD/文件版本、批准的 `DEC`（如需要）、权威文件和受影响调用方、原失败场景、修复差异、静态检查、隔离环境运行命令与执行时间、测试失败/通过证据、回滚路径、剩余风险/负责人。**无实际运行日志则填 NOT RUN，不能填 PASS**。

推荐执行批次：**S0 文档事实** → **S1 身份/兑换/失败事务** → **S2 套餐版本/直授幂等** → **S3 R2 与 Admin 查询故障补偿** → **S4 DataProvider/视觉获批实现** → **S5 全量验证**。G-04 行尾配置须独立 diff/变更集。正式公开运营另受 A-04 恢复演练与 U03/U06/U07 合规/邮件/注销/公开安全门禁阻断。
