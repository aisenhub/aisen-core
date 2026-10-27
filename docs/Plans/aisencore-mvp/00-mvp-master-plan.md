# AisenCore MVP｜正式开发总计划

> 状态：**项目所有者宣布第一阶段基本结束，正在第二阶段准备；完整交付签收仍待补齐**；更新 2026-10-24。本文件是**唯一 MVP 总计划入口**。项目所有者确定的交付顺序及质量门槛以 **[三阶段开发与交付验收总则](./three-stage-delivery-gates.md)** 为准：第一阶段 Admin 和可独立完成的 Core 高标准交付（合成测试数据）；第二阶段 AisenLens 本地真实业务数据与双端联调；第三阶段 Admin/Supabase/AisenLens 部署端上线验收。**D1/D2/D3/S1/D4 仅为技术工作流编号，不能代替这三道交付门禁。** 业务和安全权威优先级：[当前需求](../../spec/requirements.md) → [长期架构](../../architecture/README.md) → [AGENTS](../../../AGENTS.md) → 本执行计划；真实代码/测试决定进度，当前剩余工作见 [TODO](../TODO.md)。

**阶段过渡（2026-10-27）**：项目所有者宣布第一阶段基本结束，当前正在汇总验收残余及第二阶段本地对接准备。交付门槛仍由[三阶段总则](./three-stage-delivery-gates.md)约束，所有 OPEN/BLOCKED 项以[唯一未完成任务](../TODO.md)为准。AisenLens 双端还未实际联调。

**双仓对接子计划**：[本地对接总执行计划](../aisenlens-aisencore-local-integration/00-integration-master-plan.md)与[分阶段详细索引](../aisenlens-aisencore-local-integration/README.md)承接本次Core主导的实际顺序、修改边界、测试矩阵和准出。本文件仍是平台唯一MVP总计划，TODO仍是唯一开放任务入口；新计划不构成代码/云端实施或阶段签收许可。

**当前专项**：[Admin UI 质量审查](./admin-frontend-ui-production-readiness-audit-and-remediation-plan-2026-10-27.md)、[性能优化计划](./admin-frontend-performance-optimization-plan-2026-10-26.md)、[反馈 V3 四队列](./feedback-v3-lightweight-implementation.md)、[AisenLens 小 JSON 备份 S1](./s1-aisenlens-r2-backup.md)与[第二阶段本地联调方案](./phase2-aisenlens-local-integration-plan.md)。旧 FB-V1/V2 已结束的五态/回复 UI 方案不再是施工依据；[FB-V2 记录](./fb-v2-inbox-workbench.md)只保存 ZIP 与旧安全测试背景，早期一次性过程计划从活动目录移除并通过 Git 历史恢复。

## 1. 当前事实、目标与阶段边界

- **已实现/验证**：本地 PostgreSQL 17.11 从零重建[基础表](../../../supabase/migrations/20261024011528_core_foundation.sql)、[Pro/兑换码结构](../../../supabase/migrations/20261024025852_entitlements_and_redemption_schema.sql)、[成员/管理 RPC](../../../supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql)、[兑换/Pro RPC](../../../supabase/migrations/20261024033040_redemption_and_grant_rpcs.sql)共四份迁移（11 张 public 表）；[001](../../../supabase/tests/database/001_core_foundation.test.sql) 25、[002](../../../supabase/tests/database/002_membership_rls.test.sql) 10、[003](../../../supabase/tests/database/003_entitlements_and_redemption_schema.test.sql) 57、[004](../../../supabase/tests/database/004_membership_and_admin_rpcs.test.sql) 70、[005](../../../supabase/tests/database/005_redemption_and_grant_rpcs.test.sql) 77 项，**239 PASS / 0 FAIL**；[双连接脚本](../../../scripts/test-d1-concurrency.py) `LCK-01`～`07` 7/7 PASS，观察到真实数据库锁等待。SQL 合成身份不等于签名 JWT/MFA。
- **D2 已验证部分**：[DEC-06 受限 Auth 身份 SQL RPC](../../../supabase/migrations/20261024045105_admin_user_lookup.sql) 已在本地应用、[006](../../../supabase/tests/database/006_admin_user_lookup.test.sql) 47/47 PASS（数据库累计 **286/286 pgTAP PASS**）。[真实 Auth/HTTP/MFA 自动化](../../../scripts/test-d2-auth-api-mfa.mjs) 在本地 GoTrue/Kong/PostgREST/Mailpit 测试通过，包括 ES256 JWKS 验签、邮件确认、TOTP `aal2`、M1 管理撤权/blocked 旧 JWT 拒绝、HTTP 401/403/409/422/业务 200，以及真实密码找回邮件、签名恢复 JWT、更改密码/旧密码失效。
- **D3 已验证部分**：正式 React-admin/Vite/MUI 位于 [`apps/admin/`](../../../apps/admin/README.md)，已有全业务列表与详情、主要写入 RPC、真实 Chrome 密码→TOTP→AAL2、429/503 故障注入、生产构建预览 E2E；`pnpm typecheck/build/lint`、锁文件、审计与前端安全扫描通过。**这些局部 PASS 绝不等于第一阶段交付签收**：全部模块与表格/流程的边界、完整无障碍/WCAG、八维视觉逐页评审、前端真实性能与代码拆分优化基线、所有者签收仍有缺口；详见 [逐项矩阵](./d3-acceptance-matrix.md)。
- **尚未完成**：第一阶段所有模块的完整交付级异常/业务/无障碍/视觉/性能签收、完整 AUTH-P01～P12 与失设备恢复及数据库 Lint；第二阶段 AisenLens 本地实际业务通信、双端开发、备份/Edge/R2 模块；第三阶段线上 Supabase/Admin/AisenLens、真实 SMTP/R2/发布安全与灾备验收。任何局部 JWT/浏览器 PASS **不能冒充前一阶段完成，更不能视作生产发布许可**。
- **MVP 目标**：可信 Core 身份/成员/Pro 资格、兑换与管理；统一 Auth 与受保护 HTTP API；独立 Admin；跨 SaaS 按产品的用户反馈（文字 + 最多两图、当前 V3 四队列轻量处理、受控 ZIP，已本地编码但仍有真实图片及客户端验收缺口）；首发 AisenLens 的本地优先准入与非敏感小型私有配置备份；分环境验收与明确的发布审批。
- **不做**：公共 `plans`、SaaS 功能/额度配置、`check_access(...,capability)`、第二套 JWT/Node API、AI 代理、Redis/通用插件、独立客服工单平台与复杂自动派单/邮件通知。反馈具体边界以[用户反馈长期架构](../../architecture/domains/user-feedback.md)为准，绝不把 V6 模拟结果算成上线能力。

## 2. 三阶段交付门禁与技术工作流映射

**交付阶段必须按顺序验收**：

1. **第一阶段 · 对接前交付**：AisenCore/正式 Admin 用**合成测试数据**完成全部独立可实现功能、业务流程/表格操作、错误与权限状态、全站 WCAG 2.2 AA、响应式、八维高品质原创视觉与性能/路由懒加载/代码拆分。要求生产构建性能真实测量、全模块浏览器验收及**所有者视觉签收**，不得留到 AisenLens 对接后补做。
2. **第二阶段 · AisenLens 本地联调**：停止将合成 seed/demo 数据作为验收依据；使用**真正经 AisenLens 本地客户端操作产生的业务数据**，同步完成 Core 后端剩余功能与 AisenLens 对应前端，联调 Auth/成员/Pro/兑换与适用备份 Edge/存储的端到端通信和异常，完成后再准入部署。
3. **第三阶段 · 部署与线上验收**：配置并部署线上 Admin、Supabase、AisenLens 及适用 R2/SMTP/域名，进行所有跨部署功能、安全、性能、灾备和真实环境联调。**任何真实云连接、推送或部署仍须所有者单独明确授权**，第三阶段进入不自动等于公开上线。

详尽完成定义、数据隔离、验收矩阵和旧 D1/D2/D3/S1/D4 对应关系，以 [三阶段交付验收总则](./three-stage-delivery-gates.md) 为唯一口径。下表保留旧技术工作流的细化任务编号，**它们并非五个连续的交付阶段**。


| 阶段 | 唯一详细计划 | 可以开始的条件 | 阶段完成/发布门禁 |
| --- | --- | --- | --- |
| **D1 数据库/RPC（以第一阶段为主）** | [D1](./d1-database-and-trusted-rpc.md) | 本地隔离 PG 和首迁移/35 测试可复现 | 目标结构/RLS/GRANT/RPC、pgTAP 正反例与 LCK-01～07 双连接断言 PASS；SQL 失败原子回滚/限流持久化 |
| **D2 Auth/API/MFA（第一阶段基础，第二阶段联调）** | [D2](./d2-auth-public-api-and-mfa.md) | 可并行准备完整本地 Auth；受保护接口的联调要等各自 D1 安全合同稳定 | 完整 GoTrue JWT、真实 HTTP、`aal1/aal2` 管理门禁、Auth 会话与用户查询正负例 PASS |
| **D3 React-admin（第一阶段必须交付）** | [D3](./d3-admin-console.md)（[前端高标准完备化专项](./d3-admin-experience-upgrade.md)） | 前端脚手架、Theme 可在 D2 后端联调期间准备；正式写操作必须等待对应后端安全验证 | `apps/admin/` 完整工程、可长期使用的本地合成场景、全资源功能闭环、构建/类型检查、真实浏览器 E2E、首响明文/UNKNOWN、无障碍与所有者 UI 评审 PASS |
| **S1 AisenLens/R2（第二阶段开发，第三阶段云端验收）** | [S1](./s1-aisenlens-r2-backup.md) | 第一阶段签收；相关 Core JWT/资格安全验证；完整模板白名单固化、5 MiB 实测准备，20 份/到期取回已确认 | 专属 Edge/原子配额/对象失败对账、owner ACL 与真实 Lens；本轮不实现 AI/去水印/第二项目门槛 |
| **D4 发布准入（跨阶段验收，第三阶段完成上线验收）** | [D4](./d4-release-acceptance.md) | 对声明的发布范围，其相关阶段均已验收；可在开发过程中逐项积累证据 | 全链路 I/R/REV、恢复/注销、性能和生产配置核查，发布审批独立于测试 PASS |

**阶段归属和发布范围明确化**：即使暂未对接 AisenLens，第一阶段也要把 Admin 功能/表格/无障碍/性能/视觉做到可交付并签收；第二阶段才改用真实本地业务路径产生的数据、补齐双端联调；第三阶段才实际配置在线环境。若首发承诺 AisenLens 私有备份，S1 不能跳过。所有者未明确批准前不连接生产/云环境、不推送 Git、不创建云资源。

**当前所有者决定**：Core 主导的 WebApp 后端接入；本轮文档同步，不改代码/数据库。20 份/完整模板整体个人恢复、有效永久 Pro 拒兑不耗码、登录确认后文字及最多两图反馈、Auth 显示昵称和最小凭据生命周期接线已确认；AI/去水印/第二项目门槛及支付不在本次实施范围，注销渠道上线前确定。决定与实现差距见[双仓审查](../aisenlens-aisencore-local-integration/2026-10-27-cross-repository-audit-and-integration-plan.md)，不降低第一阶段门禁。

## 3. 执行子里程碑（每项需独立证据）

1. **D1-M1（本地完成）**：Pro/兑换码表、安全读投影及 CHECK/RLS/GRANT 负向测试已落地。
2. **D1-M2/M3（本地完成）**：`public SECURITY INVOKER` + `private SECURITY DEFINER`、成员/管理状态转换、Pro 续期、兑换、首响发码、幂等/UNKNOWN 与撤销均实现；SQL 模拟身份和技术异常回滚通过。
3. **D1-M4（本地完成）**：空数据隔离库重建、239/239 pgTAP 与双连接 LCK-01～07 实测 PASS，出现真实锁等待但未观察到死锁；**真实 JWT/HTTP/TOTP 仍属 D2**。
4. **D2-M1～M3**：按真实服务签名方式验证 GoTrue、邮箱、会话、JWT/HTTP 错误映射、管理员 `aal2`、撤权、DEC-06 受限用户查询；只有 SQL 安全和性能不满足才采用受保护 Edge 条件回退。
5. **D3-M1～M4**：仅在 `apps/admin/` 初始化 pnpm≥12 workspace + Vite/React-admin/MUI/TypeScript，提交真实 `pnpm-lock.yaml`；逐 Resource 完成 UI、敏感发码与 UNKNOWN；按真实浏览器用例验收。
6. **S1-M1～M3**：按[项目目录规范](../../architecture/infrastructure/repository-structure.md)建立 AisenLens 专属元数据/可信 RPC/`supabase/functions/aisenlens-config-backup/`；与产品独立客户端协作，记录 Mock 与真实 R2 分开的故障恢复证据。
7. **D4-M1～M3**：整合全阶段测试、账号删除/留存矩阵、MFA 失设备/旧 JWT 应急撤权、数据库恢复、请求次数和性能阈值，形成范围明确的发布准入报告。

## 4. 需由项目所有者确定的参数

| 进入阶段前 | 待确认内容 | 当前可做的工作 |
| --- | --- | --- |
| D1 发码生产规则 / D3 操作界面 | 单批数量上限、码自身到期、永久码发行权限、真实管理员/备用 MFA 管理责任 | 可写最小正确数据库约束与合成安全用例；**100/批等候选值不是最终运营合同** |
| S1 实际私有备份 | 20 份、完整个人恢复、到期取回/删除及正常服务无年龄删除已定；5 MiB 为已采纳待实测上限 | 后续固化嵌套白名单/类型长度并测接口、配额与恢复；当前仅改文档，专属代码仍未完成 |
| AisenLens 本地 Pro 接入 | 短时断网新纯本地任务可复用有效快照，暂按最多 15 分钟测试，新 AI/云请求在线核验 | 实测时效与撤权；业务入口本轮不改，昵称/Auth 资料和必要登出/切号凭据接线按范围实施 |
| D4 公开运营 | 生产域名/回调、SMTP/发件身份、反滥用、人工账号注销渠道/合法留存、密钥/备份/恢复责任 | 可准备本地演练与配置清单，不连接生产 |

## 5. 交付规则、验证记录与计划生命周期

- 每次只派发**一个独立可验收子任务**。AI 开工前读取 `AGENTS.md`、目标阶段计划、真实代码/迁移、相关权威架构和当前 Git 状态。调度模板在[阶段 Agent 指令](../../prompt/mvp-stage-dispatch.md)。
- 每次完成代码/迁移时同步更新所属阶段**验证记录**、[TODO](../TODO.md)、实际受影响的架构与 README；禁止把候选设计当作执行结果。阶段计划必须区分 `SQL ROLE PASS`、`JWT HTTP PASS`、`BROWSER PASS`、`MOCK R2 PASS`、`REAL R2 PASS`、`NOT RUN`。
- `supabase migration new` 创建新文件，不编造时间戳、不重排已经应用的迁移；重置数据库只针对已经检查过的本地隔离实例。不得在规划期新建空 `apps/`、`packages/` 或 Node 服务。
- 按`AGENTS.md` 文档治理规则：阶段完成后将仍有长期价值的安全契约、测试与剩余事项迁入当前权威文件，再移除完成计划与交接过程；Git 历史提供已跟踪文件的追溯。
- **默认不执行** Git 提交、推送、Cloudflare/Supabase/R2 生产变更，除非所有者在当前任务明确要求。计划本身不构成外部操作授权。
