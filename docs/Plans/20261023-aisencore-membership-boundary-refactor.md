# AisenCore 轻量会员认证边界收敛实施计划

> 日期：2026-10-23 | 状态：**架构收敛和 UI-G0A 候选执行中；真实数据库/API/部署不在本轮授权范围** | 审计依据：用户对“导出限制应归属哪个后端”的明确判断及前序 Free/Pro、成员导航、反馈、UNKNOWN 决定。

## 0. 根因和唯一目标

原项目总架构要求“AisenCore 作为多个 SaaS 共用的轻量公共底座，业务数据/资源权限留在 SaaS”，但早期需求另写“公共套餐可配置功能开关/额度”。权益领域由此引入 `plans.features/limits`、`products.free_features/free_limits`、`CheckAccess(product_key,capability)` 和并集/max 规则，再衍生冻结、克隆 Pro 功能版本、Free 版本/指针，最后 Admin 出现 AI 分析/导出/备份等业务编辑器。

**本次唯一现行边界**：

- **AisenCore Core**：公共身份；每产品运行状态和成员关系；Pro 资格及来源、授予/兑换/撤销、可信起止时点、周期叠加/永久处理；管理身份/MFA、必要操作审计。在线会员认证必须可区分明确拒绝、无 Pro 与服务不可用。
- **SaaS 自有策略和执行**：AisenLens/AisenNote 负责 Free/Pro 对哪些功能可用、导出规格、次数与使用量、存储/计费类资源额度及其配置发布和执行。**业务在自己可控的执行端强制检查**：桌面离线功能受本地完整性限制；服务端生成/云端操作由产品可信服务端校验公共会员资格和资源所有权。
- **同项目可有隔离服务**：已明确确认的 R2 私有配置备份属于 AisenLens 专项存储流程（身份/RPC/Edge 可复用基础设施，但不得把限额、文件业务策略写进 Core 的会员功能矩阵）。反馈收件箱仍是 Admin 合成原型候选；正式提交/可见性/RLS/通知和存储范围待另行批准。
- **Free/Pro 语义**：默认 Free 只是 SaaS 的业务级默认功能，不在 Core 保存 `free_features/free_limits`，不发行 Free 码/Grant；Pro 是按 `product_id` 独立的显式资格。仅有效 Pro Grant 构成当前 Pro；最后一个有效 Pro 失效便动态回落为“没有有效 Pro”，不写降级、不删除历史，不因此放宽账号/成员/平台限制。AisenLens 无登录本地 Free 不依赖公共在线调用。
- **期限不是功能版本**：Pro 30 天、365 天、永久是发码/直授的**期限预设或参数**，不是需要随功能演化而克隆的 `pro_v2`。未来新增等级、功能包、定价/订阅时先重新立项，不预置 Feature Policy 引擎。

## 1. 目标合同与信息架构

- 公共等级：MVP `free`（派生表示：无有效 Pro）、`pro`（有对应产品有效 Pro）。保留历史 Grant、来源和可信时段，不引入持久 `users.is_pro`。
- 公共验权：`GetMyProducts` / `CheckAccess(product_key)` 等返回**会员资格结果**：产品 key、用户/成员/平台访问状态、`tier`、`pro_active`、`starts_at` / 当前资格有效期或截止日/永久、评估时间及必要拒绝原因。未来待生效授权不得提前生效；多份 Pro 要按现有可信规则聚合，不可只看任一过期记录。不得返回 `capability`、`features`、`limits`、剩余额度、AI/导出策略。网络或服务失败不得伪装为 `tier=free`。
- Core 受保护写入：只接收本产品 `pro` + 正确期限模式/起止/原因/actor-scoped `request_id`；发码、核销、直授、撤权遵守之前的双参数/精确时间锁/UNKNOWN 一次性明文、AAL2/角色鉴权审计。删除功能/额度版本冻结规则，保留不可篡改已兑现的**Grant 期限、授权来源和发码事实**及幂等。停用一个 Pro 发行预设不得抹掉历史发码或 Grant。
- DB 最小化目标：产品、身份/成员、管理员、Pro grants、Code batches/codes/redemptions、audit/rate limits；不为默认 Free 建 `plan`；不再需要 Pro feature/limit 快照、Free 指针或统一业务 feature/limit JSON。若保留发行“授权方案”参考表，也仅允许运营名称、Pro 等级及建议时长，不包含产品业务功能；默认优先用 30/365/永久表单预设而非 Pro 版本表。
- Admin 信息架构继续“工作台 / 用户管理（直达列表、详情内成员操作） / 产品管理 / 反馈管理”以及全局平台/系统管理。**产品管理只保留“Pro 授权规则/发行配置”、“兑换码运营”、“权益授权”**，不出现“编辑免费能力”“AI 分析”等 Features/Limits 编辑器、“Pro 功能版本克隆”、Free 指针。

## 2. 执行步骤与不可退让条件

| 阶段 | 工作 | 完成判据 |
| --- | --- | --- |
| P0 | 记录总架构矛盾与新的唯一边界 | 总架构/需求和独立决定文档互相一致；旧结论保留历史并注明被替代 |
| P1 | 领域/数据库/API/安全合同收敛 | 拆除业务 feature/limit/额度合并职责；公共接口只有 Pro 资格和有效期；会员准入与 SaaS 自有权限分开，错误不能误回 Free |
| P2 | D1/D2、RPC/验收/F05/F08/计划逐项核对 | 发码 UNKNOWN/旧码撤销/重新发行/Pro 时段/跨产品/最后管理员/MFA 不变；不再要求 Free/Pro feature/limit 编辑/版本克隆及相关 FK |
| P3 | Admin 原型与 D3/UI 文档改造 | 不再展示任何产品功能开关/额度编辑；30/365/永久被视为 Pro 授权期限参数；用户 360° 派生会员状态，反馈仍可交互 |
| P4 | 测试与留痕 | JS 静态语法、真实 Chrome Pro 发码/明文销毁/UNKNOWN/直授/用户/成员/反馈、作用域与四主题宽度；搜索现行规范冲突，列出真实 DB/RPC 等未验证项 |

## 3. 防止未来再次越界的验收问句

1. 新增“4K 导出限额”的需求，**不应要求修改 AisenCore 数据库、RPC、Admin 套餐表单**；只调整 AisenLens 业务规则和可信执行端。
2. Pro 用户是否有备份权限：AisenCore **只回答 Pro 资格是否有效**；AisenLens 的 Edge/服务端再次确认产品资源所有权与自身备份策略/配额。单机导出无法由 Core 保证抗本地破解。
3. Pro 30 天码、365 天码或永久直授：Core 正确计算时段和续期，不应派发功能列表；过期/撤销后返回无有效 Pro，并保留历史且不隐性发 Free Grant。
4. 各产品隔离；被封禁/已退出/成员 suspended、产品暂停应阻断对应的在线受保护能力，即使 tier 为 Free。服务故障不得当成 Free。
5. R2 备份和反馈不在本轮被删除，但不得被借口包装成一个多产品业务能力策略引擎。
6. UI-G0A 仍 NOT APPROVED；本轮原型行为验证不等于真实安全 E2E 或上线批准。

## 4. 出范围与安全说明

本轮只修改项目文件及可交互原型，不变更正式 Supabase schema，不部署 Edge、不发送消息、不提交 Git，不覆盖 Gemini 参考。尊重已有未提交工作区内容；历史文件中的过时决定标为“已被 2026-10-23 轻量认证边界修订替代”，不假称旧测试已完成。

## 5. 本轮实施与本地测试结果（2026-10-23）

| 阶段 | 结果 | 证据与边界 |
| --- | --- | --- |
| P0 | 已写入目标边界 | 新增 `docs/architecture/domains/membership-qualification-boundary.md`，需求/总架构和旧 DEC-04 历史计划明确以最新职责决定为准 |
| P1 | 设计合同已修订 | 权益领域/数据库/API 只描述按产品身份/成员/Pro Grant/可信时间，不要求 Core 的 Features/Limits、业务 quota、功能并集或 `CheckAccess` capability |
| P2 | D1/D2/D3/D4/F05/锁计划/UI/TODO 收敛 | 原套餐功能版本/Free 能力编辑/克隆改为 Pro 发行固定期限、Grant 历史和真实安全验收；R2 属 AisenLens 专项服务、反馈仍未批准正式后端 |
| P3 | Demo 已修改 | `docs/interaction-benchmarks/admin-codes-unknown/MVP-codex.html` 只提供 Pro 资格与 30/365/永久期限，保留发码/直授/撤销、用户360°、成员与反馈；**不出现产品 Features/Limits/免费能力编辑器** |
| P4 | 本地 Chrome JS 原型测试 | Pro 页面与发码/明文/直授、用户/反馈 **10/10**；UNKNOWN 原请求核查 **3/3**；成员暂停/恢复及反馈 **5/5**；四主题、四宽度、双作用域、九页面 **288/288** 根容器无横向溢出（另 320px 通过）；内存 termPresets 重构后 Pro 365天发码/首响/列表 **5/5** |

**第三轮修订**：原型已进一步移除 `termPresets`、`plan`、`S.selectedPlan` 和模拟 Pro 功能版本依赖。Code/批次明确保存 `tier='pro'` 和首次确定的 `grantDurationDays`；Grant 保存产品、Pro、原始起止与来源。按**同用户、同产品、同等级 Pro**串行推导周期续期，而非原来的同套餐键。模拟字段仍不是生产 DDL；正式 RPC/DB 以 D1/D2 的 `product_id + tier=pro + grant_duration_days` 与强类型请求幂等合同为准。

**尚未完成**：正式 Supabase 迁移、真实 JWT/RLS/RPC、M1–M5 并发锁序、权限侧信道、R2 实际业务执行、完整 WCAG 和视觉签收均未实施；D4 真测试保持 NOT RUN，`UI-G0A NOT APPROVED`。未提交 Git、未部署、未改 Gemini 对照文件。

## 6. 第三轮补漏和交互复核（2026-10-23）

### P5 — 清除“有页面没套餐表却依旧按套餐顺延”的不一致

1. **Demo 状态**：删除 `termPresets`、`plan()`、`proPlanMatches()`、`validProTarget()`、`selectedPlan` 和关联的 Mock `plan` 字段。种子和新增 Grants 使用 `product+tier=pro`；批次和 Code 使用 `product+tier=pro+grantDurationDays`。发码表单现有 30/365 天快捷按钮，同时可输入合法正整数天数；永久目前只通过人工显式授权。
2. **实际行为**：周期续期合并同用户同产品所有未撤销的 Pro 未来周期，不分 30/365 天来源；跨产品互不叠加；永久需明确确认，撤销不删除历史。直授应用入口自身校验理由、模式、时间窗和永久确认，不能只依赖预览 UI。
3. **UNKNOWN**：码请求丢结果后保持原 request_id 的安全查询、明文不能重显、逐码撤旧后才独立新发。直授 `lost-created` 模拟在首次提交时保存原始可信授予时段，之后核查原请求使用这份**固定时段**，不以新的 `now()` 重新顺延，且同请求不重复生成 Grant。
4. **文档补漏**：身份领域实体表、D1 RLS 权限矩阵、F02 锁序、U03–U11 决定、Admin 数据列展示已清除现行 `plans/plan_id`、L4 套餐行锁和 Pro 功能版本。被移除实体的 L4 只保留兼容锁序编号（空位）；L7 对应 `user+product+pro` 期限并发锁。真实 SQL 落地要执行双连接测试。

### 本轮 Chrome/Node 回归

| 场景 | 本地证据 |
| --- | --- |
| 同产品 365 天后追加 30 天、精确相加 | **2/2 PASS**，以同一笔已存在 Grant 截止时点为输入，不使用两次相对现在时刻作毫秒相等判定 |
| 非法永久/零天拒绝、永久 UI 复核/落地、多 Pro 聚合/撤销回落、跨产品隔离 | **9/9 PASS**，与上一行合计 **11/11** |
| Pro 码 UNKNOWN 原 request_id、创建批次固定 Pro/时长、成员 left→suspended→left、反馈 | **7/7 PASS** |
| 四主题 × 四视口 × 双作用域 × 九页面 | **288/288 PASS**；320px 补充不溢出 |
| 模拟 MFA 门禁、AAL2 管理员范围与 M1 最后管理员保护 | **5/5 PASS**；仅表示 Mock UI/状态机可交互，不构成真 MFA 或安全 DB 测试 |
| 真 DB/HTTP/安全验证 | **NOT RUN**，不能代表 PostgreSQL 锁/RLS、Supabase MFA、R2、WCAG 或 UI-G0A 签收 |

**正式实施待办**：数据库 migration 无旧 plans/FK；公开 RPC 新签名及错误顺序；actor+request_id 首次语义持久化；L7 的用户产品 Pro 可信并发锁；SaaS 云端资源所有权和业务限额/R2 的真实端到端检查。保持 `UI-G0A NOT APPROVED`、D4 实环境测试 `NOT RUN`，不提交、不部署、不修改只读 Gemini 对照。
