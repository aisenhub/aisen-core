# AisenCore｜唯一未完成任务清单（第一阶段收尾 → 第二阶段本地联调）

> 核查基准：2026-10-27，Git `main` @ `7735052e`。项目所有者宣布**第一阶段基本结束**，本轮进入第二阶段准备；该决定**不等于**已经取得完整 UI/WCAG/性能和第一阶段正式签收。第二阶段真实双端联调尚未执行，第三阶段云端部署尚未获授权。
>
> **本文件只跟踪 OPEN/BLOCKED 工作。** 本轮实施与验收步骤见 [阶段过渡优化执行计划](./aisencore-mvp/phase-transition-optimization-plan-2026-10-27.md)；当前 Core 侧接口核对见 [静态接口与缺口清单](./aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md)，这两份文件不是另一套 TODO。 已完成代码、旧的逐日施工日志和测试成功次数不重复列为任务；历史证据可在 Git 历史、测试脚本、`ui-evidence/`、[D3 验收报告](../development/testing/d3-acceptance-report-2026-10-24.md)和各现行专项合同中查阅。任务按交付阶段归属；同一任务的细项只在其专项合同维护，不在这里再建第二套完整任务账本。

## A. 第二阶段正式联调之前必须说明或补齐的缺口

- [ ] **GATE-01｜P0｜第一阶段最终签收及遗留项处置**：所有者确认业务功能、视觉/交互与残留风险，并记录签收日期或书面豁免范围。现有 [三阶段交付门禁](./aisencore-mvp/three-stage-delivery-gates.md)要求全量签收；“基本结束”不能自动将未测项改为 PASS。**准出**：签收/豁免记录可追溯、P0/P1 阻塞逐项有决定。
- [ ] **UI-01｜P1｜Admin 全资源功能与异常矩阵**：按 [UI-01～14 生产级审查](./aisencore-mvp/admin-frontend-ui-production-readiness-audit-and-remediation-plan-2026-10-27.md)及 [D3 矩阵](./aisencore-mvp/d3-acceptance-matrix.md)补齐真实空/非空、多页、401/403/409/429/503、断网/超时、迟到响应、权限撤回、危险操作确认/未知写入恢复、导出范围和反馈图片失败；不得以已有局部 Chrome PASS 代替完整矩阵。**准出**：按路由列有可复测 PASS/NOT RUN 和缺陷处置。
- [ ] **UI-02｜P1｜WCAG 2.2 AA、全断点与人工设计验收**：NVDA/VoiceOver、键盘和焦点、IME、200/400% 缩放、真机、axe incomplete 和 320/390/768/1024/1440 等代表性页面/错误状态、八维视觉签收。**准出**：自动+人工结果、截图及所有者决定；当前仍为 PARTIAL/NOT ACCEPTED。
- [ ] **PERF-01｜P1｜真实性能目标**：完成登录公共 JS 关键链受控 A/B、非空连续操作、100/1000/10000 隔离规模、准确 count/分页、只读请求取消、真实互动及 P75/P95/INP；最近匿名登录慢网 LCP 中位约 **2936ms**，高于候选 **2500ms**，不得记达标。按 [性能优化计划](./aisencore-mvp/admin-frontend-performance-optimization-plan-2026-10-26.md)与 [S1～S6](./aisencore-mvp/admin-performance-phase2-real-load-and-interaction-plan-2026-10-26.md)执行。
- [ ] **AUTH-01｜P1｜Auth/MFA 恢复与异常安全**：真实浏览器邮件恢复回调、失效链接、正常 session 与 PASSWORD_RECOVERY 区分、丢失/撤换 TOTP 因素、旧 AAL2 撤权和多会话/在途竞态；D2 完整 AUTH-P01～P12 与 HTTP 503/超时负例，单人运营 A-04 恢复演练。已通过的 GoTrue/Mailpit 正向部分不等于这些负例已验收。
- [ ] **DB-01｜P1｜数据库/权限规模与安全余项**：DEC-06 在代表性用户规模下的 P95/EXPLAIN、Auth 表精确邮箱索引策略、`multiple_permissive_policies` 查询计划、剩余 RPC 并发/死锁与 I/R/REV 正反例；任何本地库操作只作用于确认隔离的测试实例，不重置长期数据。
- [ ] **FB-01｜P1｜反馈 V3 缺口**：四队列轻量工作流已编码，本地 AAL2 专项和 462/462 pgTAP 曾 PASS；仍欠真实/隔离私有 R2 一两图上传、缩略图压缩/授权高清预览、含图 ZIP、错误与撤权、孤儿回收策略、性能、人工可访问性/视觉。详见 [V3 剩余工作](./aisencore-mvp/feedback-v3-lightweight-implementation.md)。真实云 R2 验收属于第三阶段。

## B. 第二阶段｜AisenLens 本地端实际对接与双端开发

> 详见 [AisenLens 本地联调准备与验收方案](./aisencore-mvp/phase2-aisenlens-local-integration-plan.md)。必须使用 **AisenLens 客户端实际操作产生的数据**，不得以 `seed:admin-demo` 冒充联调。尚未核验 AisenLens 本地仓库和客户端现状，下面属于待做事项，不是已确认的兼容事实。

- [ ] **LENS-01｜P0｜双端代码/运行环境摸底**：确认 AisenLens 本地端目录、分支、启动方法、数据库及身份配置；对照 AisenCore 现有端口、JWT/URL、产品 key、CORS/回调和隔离策略。**准出**：双方可启动、均指向明确隔离的本地服务，未使用开发秘密上传公网。
- [ ] **LENS-02｜P0｜冻结最小跨端接口合同**：Core 侧源码静态接口清单已整理（参见上面的链接），但 AisenLens 客户端接口、实际 JWT/HTTP 兼容与双端字段/状态/错误、身份和产品范围**仍未验证**；不得创造旧接口兼容层。**准出**：两端同一份接口矩阵，正/负例与责任边界明确。
- [ ] **LENS-03｜P0｜统一身份、产品成员与跨 SaaS 隔离**：真实客户端注册/登录、邮件确认、会话刷新/登出、首次合法加入 `aisenlens`、退出/暂停/blocked、同一账号多产品隔离、离线 Free 零非必要请求及旧 token 拒绝。**准出**：端到端真实请求与服务端状态/审计一致。
- [ ] **LENS-04｜P0｜Pro 资格与兑换闭环**：本地 AisenLens 权益显示/准入、到期/撤销即时复核、免费离线行为、真实兑换码输入/重复/过期/限流/UNKNOWN 恢复和产品级 Grant。**准出**：成功、无权和故障均可复现，业务授权绝不由前端自行认定。
- [ ] **LENS-05｜P1｜反馈客户端与后台往返**：AisenLens 提交文字及 0/1/2 图、本人查看受限进度（当前 V3 不新增交互式回复）、Admin 四队列分诊/工作台/归档/回收站、受限附件/ZIP；跨产品、撤权、503、幂等、重试和异常清理。**准出**：真实本地客户端请求贯通，隔离对象/真实云对象证据分开。
- [ ] **LENS-06｜P0｜本地配置备份/恢复专项**：按 [S1 方案](./aisencore-mvp/s1-aisenlens-r2-backup.md)实现配额预留、JWT/Pro/白名单小 JSON 校验、Edge 唯一条件写、pending/ready 与失败对账；客户端可选版本、分类差异预览、按类替换恢复，断网/重放不泄密。真实云 R2/正式密钥仅在授权的第三阶段验收。
- [ ] **LENS-07｜P0｜第二阶段退出验收**：逐项执行适用的 I-01～28、R-01～15、REV-DEC02/04/06、反馈与 UI 负例；记录 AisenLens 真正交互的数据出处、日志、截图、QA 清理、失败复验和所有者签收。**准出**：两端功能、权限、故障恢复均有真实证据。

## C. 第三阶段｜实际部署与上线（不得提前执行）

- [ ] **DEPLOY-01｜P0｜独立配置与安全审查**：Admin/Cloudflare Pages、Supabase Auth/DB/API/Edge、AisenLens、域名/HTTPS、SMTP/邮件回调、R2 私有对象桶与最小凭据、密钥轮换、备份/回滚和监控告警。开发固定管理员、演示数据和密钥不得进线上。
- [ ] **DEPLOY-02｜P0｜云端完整回归**：真实 R2 含图、ZIP、备份读写与对账/删除、账号注销/匿名化和法定留存、并发/吞吐/性能、生产权限/邮件恢复、跨端安全负例；Mock/local PASS 不替代真实环境 PASS。
- [ ] **DEPLOY-03｜P0｜单独部署及公开上线授权**：提交风险、测试与回滚报告；取得明确许可后才能迁移或部署云环境、推送/公开上线。

## D. 待项目所有者/产品端冻结的决策（不是默认开发许可）

- [ ] **DEC-OPS｜P1**：主管理员/备用 TOTP 恢复责任、批量发码上限和有效期、管理员与账号注销操作流程。
- [ ] **DEC-LENS｜P0（开始备份前）**：备份 JSON 字段白名单、字节限额（256 KiB 仅候选）、版本数（10 仅候选）/保留期、Pro 离线新任务策略（U11）与 15 分钟新鲜度窗口。
- [ ] **DEC-CLOUD｜P2**：域名/回调、SMTP 服务、反滥用政策、用户反馈大小/速率/留存、R2 回收、法定数据保留与隐私响应。

## 维护规则

- 完成任务必须附 **可复测证据、环境（SQL 模拟/真实 JWT HTTP/Chrome/隔离 S3/真实 R2）、退出码、验收人** 后才从此文件移除或关闭；不因分支合并或代码存在自动标 PASS。
- 专项明细只维护于对应文件；这里按 ID 保留唯一开放入口，新增工作先校验是否重复。
- 不删除任何迁移、测试脚本、现行架构合同和唯一原始证据。本次清理记录见 [文档深审报告](../development/testing/document-governance-audit-2026-10-27.md)。
