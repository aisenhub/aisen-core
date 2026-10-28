# AisenCore｜唯一未完成任务清单（第二阶段联合开发与第一阶段遗留并行）

> **2026-10-28 Stage2 本地三端收口**：[独立实施顺序与实时证据](./aisenlens-aisencore-local-integration/2026-10-28-stage2-local-closure-execution-plan.md)；此处仍为唯一开放任务清单。本轮不把顺延的外部模板云备份算阻塞。

> 核查基准：2026-10-27，Core `main` @ `92e7c03`（未提交修改保留）。项目所有者已明确启动**Core×Lens 第二阶段本地联合开发**并许可整理本地开发库测试数据；第一阶段 UI/WCAG/性能/人工验收遗留仍 OPEN，不得将联合开发启动视为正式签收。云端/推送/公开上线仍未授权。
>
> **本文件只跟踪 OPEN/BLOCKED 工作。** 本轮实施与验收步骤见 [阶段过渡优化执行计划](./aisencore-mvp/phase-transition-optimization-plan-2026-10-27.md)；当前 Core 侧接口核对见 [静态接口与缺口清单](./aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md)，这两份文件不是另一套 TODO。 已完成代码、旧的逐日施工日志和测试成功次数不重复列为任务；历史证据可在 Git 历史、测试脚本、`ui-evidence/`、[D3 验收报告](../development/testing/d3-acceptance-report-2026-10-24.md)和各现行专项合同中查阅。任务按交付阶段归属；同一任务的细项只在其专项合同维护，不在这里再建第二套完整任务账本。

## A. 第一阶段遗留缺口（已授权联合开发，仍须并行修验）

- [ ] **GATE-01｜P0｜第一阶段最终签收及遗留项处置**：所有者确认业务功能、视觉/交互与残留风险，并记录签收日期或书面豁免范围。现有 [三阶段交付门禁](./aisencore-mvp/three-stage-delivery-gates.md)要求全量签收；“基本结束”不能自动将未测项改为 PASS。**准出**：签收/豁免记录可追溯、P0/P1 阻塞逐项有决定。
- [ ] **UI-01｜P1｜Admin 全资源功能与异常矩阵**：按 [UI-01～14 生产级审查](./aisencore-mvp/admin-frontend-ui-production-readiness-audit-and-remediation-plan-2026-10-27.md)及 [D3 矩阵](./aisencore-mvp/d3-acceptance-matrix.md)补齐真实空/非空、多页、401/403/409/429/503、断网/超时、迟到响应、权限撤回、危险操作确认/未知写入恢复、导出范围和反馈图片失败；不得以已有局部 Chrome PASS 代替完整矩阵。**准出**：按路由列有可复测 PASS/NOT RUN 和缺陷处置。
- [ ] **UI-02｜P1｜WCAG 2.2 AA、全断点与人工设计验收**：NVDA/VoiceOver、键盘和焦点、IME、200/400% 缩放、真机、axe incomplete 和 320/390/768/1024/1440 等代表性页面/错误状态、八维视觉签收。**准出**：自动+人工结果、截图及所有者决定；当前仍为 PARTIAL/NOT ACCEPTED。
- [ ] **PERF-01｜P1｜真实性能目标**：完成登录公共 JS 关键链受控 A/B、非空连续操作、100/1000/10000 隔离规模、准确 count/分页、只读请求取消、真实互动及 P75/P95/INP；最近匿名登录慢网 LCP 中位约 **2936ms**，高于候选 **2500ms**，不得记达标。按 [性能优化计划](./aisencore-mvp/admin-frontend-performance-optimization-plan-2026-10-26.md)与 [S1～S6](./aisencore-mvp/admin-performance-phase2-real-load-and-interaction-plan-2026-10-26.md)执行。
- [ ] **AUTH-01｜P1｜Auth/MFA 恢复与异常安全**：真实浏览器邮件恢复回调、失效链接、正常 session 与 PASSWORD_RECOVERY 区分、丢失/撤换 TOTP 因素、旧 AAL2 撤权和多会话/在途竞态；D2 完整 AUTH-P01～P12 与 HTTP 503/超时负例，单人运营 A-04 恢复演练。已通过的 GoTrue/Mailpit 正向部分不等于这些负例已验收。
- [ ] **DB-01｜P1｜数据库/权限规模与安全余项**：DEC-06 在代表性用户规模下的 P95/EXPLAIN、Auth 表精确邮箱索引策略、`multiple_permissive_policies` 查询计划、剩余 RPC 并发/死锁与 I/R/REV 正反例；当前 55322 本地开发库仅按所有者此次明确授权清理测试数据，先做仓库外 pg_dump 备份并保留管理员与真实产品；未来未获授权不得扩大清理范围。
- [ ] **FB-01｜P1｜反馈 V3 缺口**：四队列轻量工作流已编码，本地 AAL2 专项和 462/462 pgTAP 曾 PASS；F05 Auth/数据库错误误报 403 的三处代码分支已有局部修复及 Deno 11/11 PASS；F06 按产品本人恢复已在本地开发库安装，相关 SQL fixture 116/116 pgTAP PASS；F07 已接有界 PNG/JPEG/WebP 真解码、仅限 local-test 的隔离 S3，抽取与正式 Edge 共用的提交/图片签发处理函数，用模拟 Auth/DB ports 进行本机 HTTP+S3 故障回归 Deno 15/15 PASS（含限时只读 S3 枚举/服务角色 RPC 适配层模拟；**不是真实 GoTrue JWT/Edge middleware/DB 验收**）。Docker 恢复后新增 `scripts/test-f07-local-sql-rollback.py` 并实跑 R-16/F06 回滚事务 **209/209 pgTAP PASS**；前次独立 QA 栈因 CLI 镜像下载/GoTrue 初始化受阻而清理；所有者最新指令下本地 55322 已先备份、清除测试数据并安装 R-16/F06，Core 真实 GoTrue JWT→Edge→SQL 零图、429/幂等/拒绝检查已 PASS；真实上游 5xx 注入仍 NOT RUN；仍欠隔离正式入口私有存储一两图上传、缩略图压缩/授权高清预览、含图 ZIP、错误与撤权、孤儿自动清理/安全引用二次核对、性能、人工可访问性/视觉。详见 [V3 剩余工作](./aisencore-mvp/feedback-v3-lightweight-implementation.md)。真实云 R2 验收属于第三阶段。

**2026-10-27 本地数据库统一基线（已执行）**：`supabase_db_Aisencore`/55322 在 `E:\\Projects\\Aisencore-local-backups` 保存并验证完整归档；新增 [`reset-local-joint-dev-data.py`](../../scripts/reset-local-joint-dev-data.py) 先回滚演练再事务提交，删除已确认 demo/QA 账号及会员/权益/核销/反馈数据，保留唯一 `admin@aisencore.test` 授权，保留 `aisenhub`、`aisenlens` 并置 active；复核 Auth **1**、Admin **1**、产品 **2**、业务数据 **0**。随后 `supabase migration up --local` 持久应用 `20261027144000` (R-16) 与 `20261027151000` (F06)，新版 `my_feedback(text,uuid)` 可用、旧 RPC 不存在；[`test-f07-local-sql-rollback.py`](../../scripts/test-f07-local-sql-rollback.py) 调整为已安装迁移后仅事务内重跑 fixture，**209/209 pgTAP PASS**。`scripts/test-fb-edge-zero-image.mjs` 完整真实 GoTrue JWT→Edge→SQL 测试通过（201/200/409/422/403/429/限额后的幂等恢复），finally 清理临时用户/产品/反馈。F07 1～2 图片全链、真实 Lens UI/Auth 仍 NOT RUN；不因 Core 零图成功关闭 LENS-05。

## B. 第二阶段｜AisenLens 本地端实际对接与双端开发

**详细施工入口**：[双仓总计划](./aisenlens-aisencore-local-integration/00-integration-master-plan.md)统一调度；LENS-01～03对应[身份/成员](./aisenlens-aisencore-local-integration/02-stage2-auth-and-membership.md)，LENS-04对应[权益/兑换](./aisenlens-aisencore-local-integration/03-stage2-entitlements-and-redemption.md)，LENS-05对应[反馈](./aisenlens-aisencore-local-integration/04-stage2-feedback.md)，LENS-06对应[模板备份](./aisenlens-aisencore-local-integration/05-stage2-template-backup.md)，LENS-07对应[组合回归](./aisenlens-aisencore-local-integration/06-stage2-integration-acceptance.md)。第一阶段余项按[对接前详细计划](./aisenlens-aisencore-local-integration/01-stage1-core-readiness.md)修验；不在阶段文件另建状态台账。

> 双方仓库/技术栈/入口已静态核对，范围与业务决定已确认；Core 与 Lens 已完成浏览器真实 JWT 登录→反馈零图→Edge→数据库首个跨仓切片（PASS），全量 Auth/反馈 1～2 图/双端验收仍 PARTIAL。见[本地联调方案](./aisencore-mvp/phase2-aisenlens-local-integration-plan.md)和[双仓审查](./aisenlens-aisencore-local-integration/2026-10-27-cross-repository-audit-and-integration-plan.md)。早期双仓静态审查时仅同步文档；已获所有者正式授权第二阶段联合开发，Lens→Core 真实浏览器零图反馈 PASS；成员/资格/带图和 Admin 管理主链已实测通过，但剩余安全负例及综合验收未完全完成；模板云备份按最新授权顺延下一轮。真实双端验收须以客户端操作数据取证，不用 demo seed 替代。

- [ ] **LENS-01｜P0｜隔离运行基线**：Core 现有本地 Auth/REST/DB 及零图 Edge JWT 测试已通过，55321/55322 上仅留真实 `aisenhub`/`aisenlens` 和管理员；Lens 正常浏览器真实 JWT 登录与零图 feedback-submit 已 PASS；隔离对象的 Lens Chrome+Core JWT+S3 测试已 PASS；仍需完整 JWT/刷新/Lens 8443 邮件回调、CORS/多标签、本轮本地安全负例；真实 R2 与上线前配置顺延。**准出**：实际可启动且仅指向明确本地服务，不重置已有数据。
- [ ] **LENS-02｜P0｜实际接口/错误与文档决策落地**：已确认范围及业务规则，仍需将当前 RPC/DTO、错误分类、同码/原号恢复、身份/产品、schema/实际参数与双端代码测试对齐；不新增兼容层。**准出**：单一接口矩阵与真实正负例；不因文档确认将实现记完成。
- [ ] **LENS-03｜P0｜身份、成员与最小生命周期接线**：GoTrue/Mailpit跨浏览器邮件确认/错误hash、找回/无证明重置/重放拒绝PASS；临时GoTrue真2秒TTL两类真实过期邮件链接均PASS且原Auth恢复；Lens真AAL2兑换/会员/反馈、left→显式rejoin保留原ID与Grant、suspended RPC409/Admin恢复PASS；A→B跨标签迟到响应/内存AI Key清理，同账号refresh不误锁、两个独立GoTrue会话的local/global登出隔离PASS。**现有正式8443 Vite已从Git忽略的本机配置接入公开Core变量，真Chrome登录/项目进入及单浏览器断网时本地GoTrue用户UUID、联网后服务端重新验证的UUID不变/本地Free项目ID保持 PASS**，QA前后清洁。见[收口计划](./aisenlens-aisencore-local-integration/2026-10-28-stage2-local-closure-execution-plan.md)。**仍需**物理跨设备及超长离线令牌过期恢复、未启用Pro本地操作、跨产品/AI任务切号与持久化密文保留人工矩阵；本机冷首次离线Vite编辑器未通过，部署环境需要独立注入公开变量。禁止账号状态误归Free、意外清加密凭据。**准出**：两端状态/审计一致；不改AI/Provider/项目算法，不开放未定渠道的注销成功按钮。
- [ ] **LENS-04｜P0｜资格显示与兑换**：check_access + 本人安全列历史、到期/撤销/故障；实施同产品有效永久 Pro 拒兑其他码且不耗码的锁内保护及同码恢复/并发负例。**Core R-16 迁移、93/93 pgTAP、Lens 真AAL2发码兑换与永久保护、LCK-01～08真实PG并发PASS；Lens真Chrome另产品 `aisenhub` 有效码被 `aisenlens` 拒绝，未耗码/跨产品加会员/授权/核销且真实 `check_access` 跨产品不可用，Lens PR#45已合并。限时权益快照及剩余HTTP故障时效负例仍OPEN**。**准出**：真实客户端/RPC/Grant 一致；本轮不启用AI/去水印/第二项目门槛，不宣称全部Pro功能验收。
- [ ] **LENS-05｜P1｜单向反馈及管理闭环**：确认邮箱本人文字与最多两图、原号恢复、Admin V3四队列/私图/ZIP；Lens零图真JWT/Edge/DB及丢201响应同UUID重试200、无S3时503保留草稿、第三张拒绝Chrome PASS。**真Lens双图→正式Core Edge→隔离本地S3→DB、本人60s私图/他人403、Admin AAL1拒绝/AAL2 ZIP两原图字节一致 PASS**。另有**真实GoTrue注册→Mailpit确认→同合成用户登录→真实1/2图Edge反馈→Admin AAL2 ZIP**子链 PASS（注册及反馈以真实HTTP/SQL执行、不是完整同一Chrome旅程）。真正第二图S3 PUT 503→第一对象未引用、同号恢复201/200/已引用；真实双图已提交却客户端收不到201→同号重放200不重复上传，异参409；缺图AAL2导出503无残缺ZIP、在途撤销临时QA Admin后拒绝ZIP，正常恢复后两原图一致，所有F07完整回归退出0且QA清洁，见[独立收口计划](./aisenlens-aisencore-local-integration/2026-10-28-stage2-local-closure-execution-plan.md)。**仍需**Edge→PostgREST真实DB RPC提交后回执未知、长期孤儿安全清理、ZIP传输断连/敏感选项全组合、同用户兑换→两图→撤权→离线完整Chrome及旧回复写路径清点；云R2顺延。**准出**：真实本地请求与故障负例，无客户端回复中心/联系方式/进度页面，严格区分本地S3与云R2。
- [ ] **LENS-06｜原P0、本轮DEFERRED｜完整分析模板云备份**：按[S1](./aisencore-mvp/s1-aisenlens-r2-backup.md)固化全层白名单并测 5 MiB；实现每账号/产品20份原子预留、同号/条件写/对账/删除；create需Pro，到期可取回/删除但仍查Core准入；手动完整差异后整体替换个人模板，不分类、不改项目、不按年龄删ready。**准出**：客户端及对象/配额故障可恢复；真实云 R2 第三阶段授权后验收。
- [ ] **LENS-07｜P0｜第二阶段退出验收**：逐项执行适用的 I-01～28、R-01～16、REV-DEC02/04/06、反馈与 UI 负例；记录 AisenLens 真正交互的数据出处、日志、截图、QA 清理、失败复验和所有者签收。**准出**：两端功能、权限、故障恢复均有真实证据；R-16 的 Core SQL 已应用本地库并通过 pgTAP，Core 真实 JWT/HTTP、Lens Chrome 零图/两图与本机私有 S3/AAL2 ZIP 已有阶段性 PASS；LCK-01～08真实数据库并发与 Admin D3 五切片已 PASS；新增同一用户 Lens 兑换→零图反馈→Admin AAL2 修改→Lens 撤授的综合子链已 PASS。完整邮件/两图/撤权/切号失联组合与所有者签收仍 OPEN；真实云 R2 按已确认范围顺延。

## C. 第三阶段｜实际部署与上线（不得提前执行）

- [ ] **DEPLOY-01｜P0｜独立配置与安全审查**：Admin/Cloudflare Pages、Supabase Auth/DB/API/Edge、AisenLens、域名/HTTPS、SMTP/邮件回调、R2 私有对象桶与最小凭据、密钥轮换、备份/回滚和监控告警。开发固定管理员、演示数据和密钥不得进线上。
- [ ] **DEPLOY-02｜P0｜云端完整回归**：真实 R2 含图、ZIP、备份读写与对账/删除、账号注销/匿名化和法定留存、并发/吞吐/性能、生产权限/邮件恢复、跨端安全负例；Mock/local PASS 不替代真实环境 PASS。
- [ ] **DEPLOY-03｜P0｜单独部署及公开上线授权**：提交风险、测试与回滚报告；取得明确许可后才能迁移或部署云环境、推送/公开上线。

## D. 待项目所有者/产品端冻结的决策（不是默认开发许可）

- [ ] **DEC-OPS｜P1（正式发行/上线前）**：主管理员/备用 TOTP 恢复责任、正式发码批量上限/有效期/永久码发行权限、人工注销渠道与留存/通知政策。先沿用隔离本地测试参数；注销具体渠道明确留待上线前，不阻塞本地账号接入，不假报受理。
- [ ] **DEC-CLOUD｜P2**：域名/回调、SMTP 服务、反滥用政策、用户反馈大小/速率/留存、R2 回收、法定数据保留与隐私响应。

## 维护规则

- 完成任务必须附 **可复测证据、环境（SQL 模拟/真实 JWT HTTP/Chrome/隔离 S3/真实 R2）、退出码、验收人** 后才从此文件移除或关闭；不因分支合并或代码存在自动标 PASS。
- 专项明细只维护于对应文件；这里按 ID 保留唯一开放入口，新增工作先校验是否重复。
- 不删除任何迁移、测试脚本、现行架构合同和唯一原始证据。本次清理记录见 [文档深审报告](../development/testing/document-governance-audit-2026-10-27.md)。
