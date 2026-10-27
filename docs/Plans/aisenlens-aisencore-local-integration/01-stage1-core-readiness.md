# 第一阶段详细计划｜对接前Core/Admin独立修验与签收

> **状态：DRAFT，待实施；真实本轮修验NOT RUN。** 本文执行[对接总计划](./00-integration-master-plan.md)第一阶段余项，不重做已有基础工程，也不替代[三阶段总则](../aisencore-mvp/three-stage-delivery-gates.md)。对应TODO：GATE-01、UI-01/02、PERF-01、AUTH-01、DB-01、FB-01，以及可独立完成的LENS-02/04后端修正。

## 1. 入口、目标及阶段边界

输入为当前工作区、双仓审查F01～F08、[Core实际清单](../aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md)、现有Admin/性能/反馈专项证据。先读真实代码及测试，核对上次PASS是否仍适用，不按历史测试总数宣布通过。

输出是可独立交付的Core/Admin及第一阶段正式签收。使用明确隔离的Core/Auth/数据库/本地对象和合成QA数据；尚不让Lens真实连接Core开展业务。Lens可以记录离线基线与静态入口，不能提前用双端结果代替本阶段独立验收。全新备份领域按第二阶段D施工，既有Core错误/安全/并发缺陷不能拖到备份或联调之后。

## 2. 执行工作包

| 顺序 | 对应任务 | 操作与实际修改位置 | 交付/检查 |
| --- | --- | --- | --- |
| 1-01 | GATE/LENS-01 | 记录两仓HEAD/dirty、本地实例/工具/端口、权限及既有修改；识别合成fixture/QA对象前缀 | 可复现基线；不启动不明实例、不清库、不覆盖并行工作 |
| 1-02 | LENS-02 | 对照最新覆盖SQL和Edge，核实签名、DTO、业务200、HTTP错误、各自幂等/恢复和无用旧入口；只补真实差距 | 文档与实现差距表，每项有对应负例/影响/责任，禁止测试UI反向定合同 |
| 1-03 | LENS-04 | 在现有兑换SQL/锁顺序内实现有效永久Pro拒兑其他码不耗码；更新API、现有005测试与真实HTTP测试 | R-16先红后绿；不新增通用请求表/兑换request_id，不影响普通周期续期或管理员直授 |
| 1-04 | FB-01/LENS-05 | 修提交/图片签发对Auth/DB故障误映射403；落实图片有界有效性验证、正式入口的隔离对象接线、引用安全对账；清点旧回复写路径 | F05/F07独立负例、0/1/2图/私图/ZIP/同号恢复；无云R2凭据 |
| 1-05 | AUTH-01/DB-01 | 补真实密码恢复、恢复会话区分、MFA丢失/重置与旧会话、管理员撤权/切身份竞态；按现有规模计划测查询与锁 | AUTH-P01～P12适用部分、AAL1/AAL2、跨用户/产品、EXPLAIN与并发证据；未测明确列出 |
| 1-06 | UI-01/FB-01 | Admin现有资源逐操作/表格/详情/状态验收，错误/UNKNOWN、发码首响、Grant/成员/封禁、反馈四队列/私图/ZIP | 真实React-admin/MUI页面与RPC/审计一致，不因本次对接重写导航或引入框架 |
| 1-07 | UI-02/PERF-01 | 完成代表数据下WCAG/全断点/键盘/读屏/缩放及八维视觉；生产构建实测冷/热与交互，按既有专项定位拆包/慢查询 | 固定硬件/版本/数据/限速/指标，原始测量与优化对比；不可只交bundle大小或axe零违规 |
| 1-08 | GATE-01 | 汇总结果、遗留/风险、截图与可复测步骤，供所有者签收 | 日期/版本/验收范围/所有者明确决定可追溯；未签收不进入第二阶段 |

每行是实际施工顺序，不是独立新增交付阶段。1-04/05/06的某项若依赖前项修复先解决依赖；不把全部余项并成一次不可审阅大改。

## 3. 独立后端修正的测试先行

### 有效永久Pro拒兑

依据[计费唯一规则](../../architecture/domains/billing-and-entitlements.md)与API R-16。先构造当前有效永久Pro、未来永久、已撤销永久、仅有限周期、多产品、同码已兑及不同码状态。用真实数据库断言返回、码次数、Grant/成员/核销和审计，不只看按钮。

约束：身份/blocked/限流/声明产品及left/suspended先于查码的规则保留；本人同码历史判重和码有效性规则不被新保护打乱。授权检查在现有可信锁内完成，测试并发兑换/管理员授永久的实际序列；按锁先后定义结果，不给已发生的交易补造历史或假称跨并发总能拒绝全部请求。

### 反馈错误、存储与旧写路径

先注入Auth返回5xx、本人读取RPC5xx、图片鉴权RPC5xx，验证服务故障不会显示“未确认邮箱/无权限”；真实未确认/越权仍拒绝。对截断/畸形图片与大像素输入使用受限成熟校验，不建立图片处理平台。

生产入口的写、签名读、ZIP和删除均能指向同一隔离对象库；协议单测不能代替Edge级链路。已存在条件写/hash key/`feedback_referenced_keys`优先复用，保护期/引用检查/物理清理分开。final结果未知不立即删对象。清理旧reply/admin旧写路径前检索调用者/SQL授权/现有测试，保留有效历史读取，不保留仅为旧操作存在的兼容写入口。

### Auth、RLS和数据库

真实签名JWT、当前blocked/成员/Admin/AAL检查分层验证。普通signOut不等于access JWT立刻失效；测试refresh撤销与当前可信资格分别生效。规模数据只在隔离库创建，记录索引/查询计划和P95，不能因方便操作重置长期数据。

## 4. Admin与非功能验收清单

复用[UI生产级审查](../aisencore-mvp/admin-frontend-ui-production-readiness-audit-and-remediation-plan-2026-10-27.md)、[D3矩阵](../aisencore-mvp/d3-acceptance-matrix.md)、[性能计划](../aisencore-mvp/admin-frontend-performance-optimization-plan-2026-10-26.md)及[性能S1～S6](../aisencore-mvp/admin-performance-phase2-real-load-and-interaction-plan-2026-10-26.md)，本文件只列准出汇总，不复制全部页面问题。

- 全资源正常/空/非空/长UUID/多页、过滤/排序/计数、详情回列表、合法操作和权限拒绝均核验；不为不适用表增加任意写入或敏感导出。
- 401/403/409/429/503、超时/首响丢失/迟到响应、切产品/账号、撤权、有限直授/永久/未来Grant等真实状态可恢复。
- 320/390/768/1024/1440代表视口、200/400%缩放、键盘/焦点、弹窗、IME、中文英文、亮暗主题及实际读屏；axe incomplete人工解释，自动检查不替代WCAG2.2AA人工项。
- Typography、Whitespace、Visual hierarchy、Color、Motion、Micro-interaction、Responsive、Originality按代表页面/错误/数据密度留证，所有者视觉签收；不作无限自评循环。
- 生产构建实测冷/热首屏、切资源、代表数据100/1000/10000的适用查询/交互、LCP/INP/请求量/内存。既有2500ms等候选预算须按专项与实际测量收口，未达到不标PASS；不降低预算掩盖退化。

## 5. 已存在的运行入口与补充测试

| 层级 | 可复用的实际入口 | 执行条件 |
| --- | --- | --- |
| 工程 | Core根 `pnpm typecheck` / `pnpm lint` / `pnpm build` | 对应代码改后执行 |
| 数据库 | `supabase/tests/database/004_*.sql`、`005_*.sql`、`009_*.sql`、`012_*.sql`及现有并发脚本 | 用已核验CLI/隔离实例运行相关测试；安全行为改变时运行全套受影响SQL |
| Auth/HTTP | `scripts/test-d2-auth-api-mfa.mjs`、`test-admin-auth-inflight-race.mjs`、`test-admin-login-isolation.mjs`、`test-feedback-auth-http.py` | 先读真实身份创建/清理约定，不能直指未知库 |
| Edge | `supabase/functions/tests/feedback-upload.test.ts`、`feedback-r2-protocol.test.ts`、`feedback-export.test.ts` | 按测试实际需求授Deno最小权限，缓存按工具独立目录；补Edge handler故障/鉴权用例 |
| 浏览器 | `test-d3-authenticated-pages.mjs`、`test-fb-v3-browser.mjs`、既有性能/秘密扫描 | 固定服务/账号/构建、与重负载测试错开；既有截图不代替本轮结果 |

新R-16、故障分类和引用安全场景应扩现有合适测试；确无载体才新增最小测试文件。不能仅因源文件名仍含v2就删除有效安全/ZIP测试，删除依据是现行行为与调用事实。

## 6. 退出、暂停点与交接

准出必须同时满足：所有本阶段适用功能/安全/异常/视觉/WCAG/性能项有真实结果；已知P0/P1阻塞关闭；QA对象范围明确；相关docs/代码/测试一致；所有者正式签收。个别人工项NOT RUN不因其余自动化PASS被掩盖；如需变更门禁，由所有者对具体证据明确决定，本计划不预授豁免。

签收前下一步仅为关闭本阶段余项和静态/环境准备。签收后交给[第二阶段A](./02-stage2-auth-and-membership.md)：环境表、DTO/错误矩阵、已验证后端版本、R-16/反馈修复证据、残留生产待定项和所有者签收记录。已有代码不能因失败整体回退或删库，修复仅限当前变更。

## 7. 验证记录

| 范围 | 当前状态 | 后续必须记录 |
| --- | --- | --- |
| 1-01～1-08本轮实施、真实JWT/DB/Edge/UI/性能/人工签收 | NOT RUN；仅计划编制 | 命令/退出码、版本/环境、断言与截图、失败复验、清理/未测范围、验收人 |
