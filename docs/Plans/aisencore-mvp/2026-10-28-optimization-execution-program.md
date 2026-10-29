# AisenCore｜2026-10-28 优化专项统筹实施计划

> **定位**：本文件是 [MVP 唯一总计划](./00-mvp-master-plan.md) 下的优化任务调度，不另起 MVP 权威。唯一 OPEN 入口是 [TODO](../TODO.md)。本地已安装正式信用账本和用户权益摘要迁移并通过真实 GoTrue/AAL2 HTTP 验收，既有非 QA 数据保留，所有新增 QA 身份已清理；没有推送、部署云端或重置数据库。代码通过测试不等于人工签收。

## 1. 优先级与依赖

| 顺序 | 优化项与既有详细方案 | 具体交付 | 关闭门禁 |
| --- | --- | --- | --- |
| **A / P0** | [CORE-ADMIN-UI-001](./2026-10-28-admin-user-search-id-copy-and-grant-ux-plan.md) | 邮箱精确找用户、用户编号贴近复制、成员/授权按邮箱过滤、授权/治理选择经核实身份 | CA-01～14，AAL2/角色/失败/窄屏；不得枚举 Auth |
| **B / P0-P1** | [CORE-ADMIN-UI-002：Pro 表单](./2026-10-28-pro-entitlement-immediate-accrual-renewal-admin-ux-plan.md#7-core-admin-ui-002新增-pro-授权交互规格) | 顶部产品范围约束、7/30/90/365 快选、已确认邮箱/身份/产品/原因、UNKNOWN 恢复 | GE-06/19～21 + 真实受控浏览器；不得用前端预计时间冒充服务端 |
| **C / P0 决策门禁** | [CORE-ENTITLEMENT-001](./2026-10-28-pro-entitlement-immediate-accrual-renewal-admin-ux-plan.md) | 立即入账信用、撤销不留洞、永久冻结/恢复、统一人工/兑换写读合同及 Lens | DEC-E01～E08 冻结、GE-01～24、事务并发/迁移/跨端 |
| **D / P1** | [UI-G0～G7](./admin-frontend-ui-production-readiness-audit-and-remediation-plan-2026-10-27.md)、[PERF O0～O3](./admin-frontend-performance-optimization-plan-2026-10-26.md)、[S1～S6](./admin-performance-phase2-real-load-and-interaction-plan-2026-10-26.md) | 本轮页面局部 UI、全站 UI/WCAG/性能的剩余证据 | 真实 AAL2 Chrome、负例、读屏/缩放、非空 SPA、负载、P75/P95、人工签收 |
| **E / P1** | [B0～B4 阶段过渡](./phase-transition-optimization-plan-2026-10-27.md)及[双仓总计划](../aisenlens-aisencore-local-integration/00-integration-master-plan.md) | Core/Lens 真实授权显示和错误一致性；保留既有 B0 证据 | 实际 Lens 客户端→Core JWT/HTTP；QA 清洁及独立阶段签收 |

**施工顺序**：A1～A4 → B1～B3 → C0～C3 → D/E。C0 已依所有者的继续实施授权按推荐默认构建本地信用账本；其正式跨环境数据分类、用户体验/人工签收依然是独立门禁。D/E 在原有专项继续，B0/O0 已完成的内容不重复计功。

## 2. A 的详细施工单（无需数据库迁移）

- **A1 用户页**：`WorkspaceLists.tsx` 在“用户编号”字段**同一单元格**显示全值/省略可复制+唯一按钮，移除该行右端的歧义复制；`UserShow.tsx` 邮箱为标题、用户编号旁放可键盘触发的复制按钮，准确提示成功/失败。只保留完整邮箱精确检索和 DEC-06 安全权限。验收 CA-01/02/03/12。
- **A2 业务详情**：`WorkspaceDetails.tsx` 的主键依实体名区分成员关系编号/授权编号/产品编号，复制贴近值；`user_id` 必须作为独立“用户编号”复制，不可把 `membership.id` 冒充 `user_id`。验收 CA-04。
- **A3 列表邮箱检索**：成员/授权页用受保护 `admin_lookup_users` 精确邮箱映射唯一用户编号，再使用现有 `user_id`/产品过滤；URL 中 `?user_id=UUID` 仍仅服务内部深链。找不到/权限拒绝/网络故障/不同产品不可 fallback 全量；保留正常列表浏览。验收 CA-05/06/11/13。
- **A4 授权及高风险操作**：最小共用 `UserIdentityPicker`，完整邮箱查询后操作人员**显式选定**唯一身份；URL 预填必须经受限 `getOne('users')` 核实，切换邮箱立即清除旧 UUID。Grant 继续走 `admin_grant_entitlement`、保留 `grantPending` 精确请求和原号恢复；AccountActions 仍另做账号状态与资格复核、二次确认、最后管理员保护。验收 CA-07～10/14。

## 3. B 的详细施工单（不得先行承诺新权益引擎）

- **B1** 顶部产品选定时绑定真实 `products.id` 且只读显示；全局视角必须显式选择 `ProductPicker`；读失败/非 active 不可提交，切产品后目标核对重新计算，pending 保留原产品/参数。
- **B2** **本地实现**：只有固定天数（7/30/90/365、默认30、自定义1～36500）和永久 Pro；不再手动输入日期，实际起点以服务端锁内可信时刻为准。Admin 将永久映射成 `explicit_window`+`is_lifetime=true`+空起止时间，提交前读取受限服务器综合权益，阻止不在成员关系、受限/永久或读取失败的写操作；预计到期仅供快照核对。
- **B3** 写前展示真实邮箱、编号、产品、模式/天数及理由；保留 HTTP 结果未知先查证再同号同参重试，收到 401/403/409/429/503 不乱发新请求；Chrome 安全和可访问性另验。

## 4. C 的详细数据与测试门禁

- **C0 规则决策**：已在本地按 DEC-E01～E07 推荐规则实施：立即入账、24h、FIFO、撤销未用余额、永久冻结/恢复、已有永久拒发拒兑、人工授予不隐式加入、停服/暂停不停止有限余额时钟。DEC-E08 采用保守迁移：若发现显式窗口、撤销旧账、跨天异常则完整事务拒绝；本地仅有两条正常 duration 后才迁移。其他环境逐一盘点，不能假定与本地相同。
- **C1 规则模型**：先在隔离测试层覆盖 GE-01～24，验证两次 30 天不是重叠损耗，撤销旧授权只取消剩余且后续连续，永久撤销后余额可证明，事务时间/DST、跨产品与幂等正确。对比方案 A（时间段重排）和 B（不可变信用+消费投影），明确选型而非实现两套生产逻辑。
- **C2 数据与写路径**：审批后才追加可信迁移、共用锁内结算与管理受限摘要；SQL/RLS、双连接并发、真实 GoTrue AAL2/JWT、UNKNOWN、历史影子差异、迁移/回滚和 QA 清洁必须独立记录。
- **C3 Lens**：只消费服务端权威综合到期日/资格/未知态；实际客户端发起兑换与 Admin 授予后同一账号展示一致才记 PASS。

## 5. D/E 具体后续步骤

- **D1** 在 A/B 相关页执行空/非空、权限拒绝、失败态、复制失败、窄屏/键盘/焦点的 Chrome 脚本；其他 UI-01～14 原矩阵继续，NVDA/VoiceOver 与 200/400% 缩放、人工审美签收不能只靠构建。
- **D2** S1 冷登录依赖瀑布受控交织 A/B；S2 标签跨身份/产品及 TTL 负例；S3 非空 SPA 快速切页、筛选与过时响应；S4 100/1000/10000 隔离量级的准确 count/SQL/HTTP；S5 安全只读取消；S6 P75/P95/INP、长会话及人工检查。缺隔离环境则 NOT RUN，不宣称性能收益。
- **E** 沿用双仓总计划已批准本地测试流程，对齐新的账号/权益读取合同，使用 Lens 真客户端写数据，Core 查证、Admin 受限操作、QA 清洁和撤权负例；第三阶段部署和 R2 云测试须另行授权。

## 5.1 逐项收尾矩阵（细化到实施、证据和准出门）

| 子任务 | 本地实施与针对性测试 | 余下准出 |
| --- | --- | --- |
| A1 用户编号查找复制 | `WorkspaceLists/UserShow` 已完成；受保护 Chrome CA01～03 正向、390px CA12 PASS | 剪贴板拒绝、键盘与读屏 |
| A2 成员/授权详情主键区分 | `WorkspaceDetails` 已明确实体编号、用户编号与就近复制 | CA04 详情准确性与撤权后刷新 |
| A3 成员/授权精确邮箱 | `UserIdentityPicker/WorkspaceLists` 受限用户查找；CA05/06 与 AAL1 403 PASS | CA11 网络/权限变化/不同产品 CA13 |
| A4 操作人证实/危险动作 | `GrantCreate/AccountActions` 复用身份核实，不复用写授权；CA07/08/14 PASS | CA09/10 状态变化、UNKNOWN、最后管理员及真实浏览器确认 |
| B1 Pro 产品范围 | `ProductPicker`、当前顶部产品锁定、无产品不可提交；更多产品时修复嵌套 form | 不同产品切换和有效成员负例 |
| B2 Pro 模式与预计到期 | Admin 仅固定 7/30/90/365/custom 或永久；真 AAL2 Chrome 固定30d写入与永久写入/拒绝重复/撤销→Free PASS | 动态跨产品切换、真实故障/无障碍完整矩阵 |
| B3 原号恢复 | `grantPending` 与 `admin_find_grant_request` 沿用确定/未知分流，429 不弃原请求 | 原 HTTP 响应丢失、跨管理员、409/503/离线实测 |
| C0 业务/历史基线 | 本地分类 2 duration、0 其他；备份后采用 24h/FIFO、未消耗撤销、永久冻结；迁移 guard | 其他环境盘点、所有者产品签收 |
| C1 候选模型与守恒 | 19 个 JS 命名断言 + 300 组守恒、`pg_temp` 与真 SQL 回滚套件 PASS | 长时消耗/精确微秒压力 |
| C2 权威数据库读写 | 四条本地迁移已安装（核心、Admin摘要、余额索引、组合信用外键），真实 AAL2/JWT/HTTP 双30d、撤销、永久/兑换、双并发7d PASS；真实单账号100/1k/10k明细 HTTP P75/P95 PASS、精确 QA 归零 | 全 GE 负例/重试、并发/网络下生产级性能、远端迁移预检 |
| C3 Core×Lens | Lens 实际 Chrome 1/1、合同 8/8、重登/跨标签、反馈/兑换/封解已 PASS | 断网/故障注入/人工视觉签收 |
| D1 完整 Admin 空/非空/错误 | 既有 29 个路由宽度加载 Chrome PASS，A/B 实际行为扩展；来源 UI-01～14 | 新权益页面成功/失败操作、401/503及附件出错 |
| D2 WCAG 与视觉 | D3 静态对比度/表格语义 PASS、实际 320/390/768/1440 局部 | axe pending/200%/400%/NVDA/VoiceOver/人工签收 |
| D3 SPA / 懒加载 | 已有同页面快速切换/受控请求暂停和懒加载外壳脚本 | 非空快速切换、迟到响应、权限变化及导出筛选 |
| D4 权限/撤权 | AAL1 身份查询 403、AAL2 限制 RPC 403/成功；原 `--revocation` 受控场景 | 撤权中在途资源读和缓存状态 |
| D5 性能冷启动 | 现有脚本及 Lighthouse 局部基线；源码按 React-admin 数据提供器读取 | 真实网络 P75/P95、INP、冷热首屏、>2.5s 问题 |
| D6 数据规模与查询 | 信用余额聚合 100/1k/10k 行 PG TEMP EXPLAIN/回滚与账户索引；进一步以真GoTrue/AAL2 JWT+PostgREST对单 QA 用户100/1k/10k行每RPC预热12+采样40次，10k时 check_access/get_my_products/Admin预览 P95 分别28.65/42.06/82.36ms，精确 QA 清理 PASS | 多用户/并发/真实网络 P95、其余资源 count/分页规模及上线配置 |
| E1 Lens 当前资格 | `check_access` 服务端综合到期/永久、失败不可显示 Free | 真实长时段持续读取与被撤权场景 |
| E2 Lens 授权历史 | `created_at` 入账日期、独立 Grant/撤销展示、8 合同测试 PASS | 人工中英/移动端阅读 |
| E3 真实客户端→Core | Lens Chrome 真兑换/撤销→Free/永久→Pro、两产品隔离、QA 原基线复原 PASS | 全失败注入/长会话 |
| E4 账号生命周期 | Lens Chrome left/rejoin/suspend/restore、跨标签/两个 GoTrue 会话全部 PASS | 多真实设备/断网恢复 |
| E5 第三阶段外网 | 未授权部署不执行；保留原 R2/云迁移门禁 | 单独明示第三阶段准出和上线批准 |

## 6. 执行记录与复核

| 项 | 本轮状态 | 证据与剩余风险 |
| --- | --- | --- |
| A1～A4 | **CODED / STATIC PASS；LOCAL AAL2 PARTIAL PASS** | 新增真实 Chrome 8 组正例/受控负例：CA01/02/03/05/06/07/08/12/14 对应子场景 PASS，含无匹配邮箱禁止全量授权列表读取、移动端不溢出、不同入口复用核验身份；CA11 的 AAL1 HTTP403 拒绝子项 PASS、CA02 剪贴板权限拒绝 UI 反馈与可聚焦按钮 PASS；CA04/09/10/11 其余部分/13 仍 OPEN |
| B1～B3 | **本地 RPC + 30d/永久 Chrome 真写入/UNKNOWN PASS；全量 GE OPEN** | Admin 固定/永久且服务端权益核验；Chrome 30d、503 原号不在/已提交核对、429 原号保留、超20分页/模态框二次确认 PASS；`node scripts/test-admin-operations-other.mjs operations-permanent` Chrome 真永久写入→`check_access` 永久、重复永久禁止、撤销→Free、QA基线还原全 PASS |
| C0～C3 | **LOCAL LEDGER/INDEX/LINEAGE MIGRATED / REAL JWT+AAL2 & LENS CHROME PASS；全套 GE OPEN** | 四条本地迁移已执行且有先前 DB 备份，信用守恒和组合 FK 守卫 PASS；真实 HTTP 双30d/撤销无洞/永久冻结恢复/兑换/跨产品隔离/幂等冲突/双并发7d与 `get_my_products` 综合投影一致 PASS，QA 清洁；Lens Chrome 1/1 PASS。其他环境仍须独立审计、正式视觉签收及 GE 缺漏 |
| D1/D2 | **AAL2 29 路由 + 74 视口组合 + 4 类真写入矩阵 PASS；完整 OPEN** | 29 场景/74 组合、懒加载、撤管、真实 Admin Grant/发码/账号治理/反馈四队列 409、503/429 原请求恢复、超20授权分页都 PASS；`--axe-pending` 3 加载态无严重/关键违规，但 incomplete 人工待核；`--spa-tags` AAL2 真 Chrome 两次快速切路由新增标签 RPC 为 0 PASS；真实 P75/P95/读屏和远端环境仍 OPEN |
| E | **LENS REAL CHROME/EDGE PRIVATE S3 IMAGES PASS；其他 Stage2 OPEN** | Lens 兑换→授权/撤销/永久/跨产品/双会话 Chrome PASS；新增真实 Lens 8443 双图提交→Core GoTrue/Edge→本地私有 S3/DB，AAL2 ZIP/403/503/撤权/丢 ACK/部分 PUT/引用对账全部 PASS；P4 本地缩略图生成/私有签名访问/孤儿引用回归 PASS；云 R2/历史回填、完整 WCAG/人工签收 OPEN |

**Admin 真实 Chrome 全子任务追加 PASS**：为避免旧脚本因业务库非空而硬性拒绝，改造 `scripts/test-d3-authenticated-pages.mjs` 的仅属于测试的 QA 基线保存、随机 QA 身份/产品所有权校验、信用账户/条目精确清理和最终前后计数断言；业务数据没有被删。`node scripts/test-d3-authenticated-pages.mjs` 已在原有非空本地库 **EXIT 0**：10 类只读资源/导航/负面邮箱、真实 GET 429/503、标签路由/移动版、产品范围与迟到响应；`node scripts/test-admin-operations-grants.mjs` **EXIT 0**：30d Pro 真授权、503 原号只读不在/已在恢复、429 不误弃原请求、User360 超过20授权分页、模态框关窗二次确认；`node scripts/test-admin-operations-other.mjs operations-issuance` **EXIT 0**：发码明文仅首响、TXT/CSV 下载擦除、结果 UNKNOWN/同号核查/批次撤销、AAL1 受限拒绝、账号封解/管理员撤管和产品停服实际写入；`node scripts/test-admin-operations-other.mjs operations-responsive` **EXIT 0**：74 路由×视口布局、键盘/Escape 取消、发码真 HTTP 503/429 与真实 TOTP；所有子项 `NONEMPTY_BUSINESS_BASELINE_RESTORED PASS` 和 QA 清理 PASS。完整 WCAG 读屏/真机、性能长会话等仍须另外验收。

**F07 双仓真图片与私有 ZIP 补充**：`node scripts/test-f07-edge-images-local-s3.mjs` 退出 **0**，因当前库已有真实用户与反馈，先修改 Core 和 Lens 互调脚本，将原“Auth=1/反馈=0”硬编码前提改为只读捕获前后 Auth/会员/反馈/附件基线、清理前精确核实随机 QA 邮箱/UUID。再用实际 Lens 官方8443 Chrome 提交两张真实 PNG，经 GoTrue JWT→正式 Edge handler→私有 S3 协议 fixture→Postgres 两条附件，测试本人与陌生人 200/403；Mailpit 实际确认注册账号、真实 AAL2 管理员 ZIP 含两张原图字节一致，缺图503、导出期间撤管拒交ZIP、网络断连保留来源、丢201 ACK 同号重放不重复、第二张PUT 503恢复重用第一张、私有对象引用受限枚举与差异409均 PASS。**QA全部已清理并恢复原非空数据基线；尚非真实外网 Cloudflare R2、人工读屏/视觉签收。后续 P4 已另行本地实现并验收，详下。**

**F07/P4 实际压缩缩略图收尾（2026-10-29）**：采用现有 `jsr:@matmen/imagescript@3.3.0`，原始图片先完整 MIME/尾部/像素数量安全解码，然后服务端生成最长边320px JPEG(72) 且尺寸≤256KiB，私人存储键 `<原图key>.thumb.jpg`，不得相信客户端缩略图。真实 Edge 上行一次上传原图与私有衍生图、失败时同号复用相同对象键且数据库原附件事实不变；图片访问 RPC `variant:'thumbnail'` 复用原归属/封禁权限，签名 URL 60秒，Admin 自动加载缩略图、高清原图另签。升级本地 `20261029003000_feedback_thumbnail_reference_guard.sql` 后，孤儿枚举只在原附件已提交时认可派生对象，无普通用户枚举。完整测试：`deno test -A supabase/functions/tests/feedback-thumbnail.test.ts` **2/2 PASS**，原反馈 Edge 回归 **10/10 PASS**，SQL 正反关联事务 **PASS + ROLLBACK**，`node scripts/test-f07-edge-images-local-s3.mjs` **真实 Edge+Lens Chrome EXIT 0**，新增真实缩略图私有签名读取/跨用户403、原图 ZIP 字节一致、同号恢复、第二张图 PUT503/原缩略图不丢、孤儿引用完整性等全部通过，QA原非空数据库还原。存量旧反馈无缩略图可显示占位仍能单独读取原图。**Cloudflare真实 R2、存量 backfill、缩略图页面人工可访问性与正式签收未执行**。

**2026-10-29 信用 10k 真 HTTP P95 + F07 权限故障追加验收**：`node scripts/test-pro-credit-http.mjs --http-scale` 最终 **EXIT 0**：本地原有非空库中只对独立随机 QA 用户加100/1k/10k条1天信用事实，真GoTrue JWT+AAL2→PostgREST/RLS分别测 `check_access/get_my_products/admin_get_pro_entitlement`，每档每RPC预热12次、40次串行样本；10k单次采样的P95为 **28.65/42.06/82.36ms**。`ui-evidence/pro-credit-http-scale-2026-10-29.json` 保留完整P50/P75/P95和测量条件；**单机、共享本地库、无生产网络和多用户竞争，不能称线上P95或SLA**。首次尝试使用旧30s清理超时，10k关联删除完成时Auth清理未执行；随后使用精确QA邮箱/UUID由本地GoTrue成功清理两名残留测试身份；第二次业务/采样/QA清理均PASS，但全局COUNT期间出现独立其他数据写入，因而脚本退出1；最终改为只核对测试自身UUID/source_ref/信用/审计均归零，第三次全链 **EXIT 0**。绝不清理非本测试记录，也不以全库COUNT变化宣称自己破坏了外部业务。

`node scripts/test-f07-edge-images-local-s3.mjs` 额外 **EXIT 0**：服务端真正JPEG缩略图签名、AAL2 Admin读缩略图200/同一管理员撤权后新增签名403、非法`variant`422；仅在本地S3临时删除一个已控制的缩略图对象时其GET404、原图仍200、数据库附件记录不变；原图ZIP/导出在途撤管/两图503恢复/原号重试均继续PASS。Core与Lens测试同样改为比较测试启动前**精确原始行ID依然存在+本次 QA UUID 已删除**，而非要求共享开发库全局COUNT不变；本地业务零删除、临时S3/.env清理 PASS。仍欠真实云R2、前端截图/读屏、生产容量及正式签收。

**四队列反馈闭环补充**：`node scripts/test-admin-operations-other.mjs operations-feedback` 在保留真实业务记录的本地库实跑 **EXIT 0**；Core 浏览器创建严格临时反馈，通过收件箱→工作台→归档→工作台→回收站→恢复、用独立 AAL2 请求模拟并发写入，服务端 409 拒绝过时版本并保留标签/星标/高优先级；10 条内部事件、6 条管理审计 PASS，`QA_FEEDBACK_CLEANUP`、`QA_PRODUCT_CLEANUP`、`NONEMPTY_BUSINESS_BASELINE_RESTORED` 全 PASS。再次说明：图片真实上游/ZIP 与人工读屏不在本次四队列 E2E 覆盖内。

**后续安全与性能收尾（2026-10-29 本地）**：`node scripts/test-admin-operations-other.mjs operations-permanent` 真实 AAL2 Chrome **EXIT 0**：无日期永久授权、服务端 `check_access`/无信用明细、重复永久 UI 禁止、撤销后恢复 Free、QA 清理/非空基线还原 PASS。`supabase/migrations/20261029001000_pro_credit_account_summary_index.sql` 本地已安装：(user_id,product_id) 非余额可变列索引；`scripts/experiments/pro-credit-scale-rollback.sql` 真实 PG TEMP 100/1k/10k 行 `EXPLAIN ANALYZE` + ROLLBACK，10k 样本同查询无索引 1.326 ms/索引 0.117 ms（仅单次 SQL、非 P95/生产负载）。`supabase/migrations/20261029002000_pro_credit_grant_identity_fk.sql` 增加信用记录 Grant ID 与实际用户/产品三元对应约束；`scripts/experiments/pro-credit-lineage-rollback.sql` 事务内真实正确/跨产品非法写入正反例 PASS，安装后负例再次 PASS。`node scripts/test-pro-credit-http.mjs` 全部真实 AAL2/JWT/并发回归 PASS，补充 `get_my_products` 与 `check_access` 合同一致性。Admin `UserShow` 的摘要读取与路由 UID 绑定，禁止用户 A 的旧摘要在用户 B 路由加载时短暂出现；Admin 构建/Lint PASS。**不把这里的 SQL 单次执行时间当线上 P95**。

**本轮新增真实施工及测试凭证（以上旧纯模型部分仅保留作历史）**：对现有本地开发库先做仓库外 `pg_dump`，然后在 `BEGIN/ROLLBACK` 验证整份信用账本迁移与临时 QA 账目，修正按 UUID 排序不确定的问题为自增信用序号 FIFO；正式执行 `pnpm dlx supabase migration up --local --yes` 安装 `20261028230000_pro_credit_ledger.sql`、`20261028235000_admin_user_pro_overview.sql`，原有 2 条 Grant 无损，2 条信用明细、守恒错误 0。`node scripts/test-pro-credit-http.mjs` 使用真实本地 TOTP AAL2 JWT+HTTP，通过双30天累计、重复请求只记一次、撤销第一笔后保留第二笔且不留洞、永久冻结和恢复、永久期间不耗码、永久撤销后成功兑换、已用码拒绝、受限权限 RPC 的 AAL1 403，以及真实并行 7+7 天双连接；`PRO_CREDIT_HTTP_QA_CLEANUP PASS`。AisenLens 的 `node --test tests/features/workflow/core-entitlements.browser.test.js` 经安全动态基线核对后真实 Chrome **1/1 EXIT 0**：Core Auth、Lens 正式权益屏幕、兑换、撤销/永久、反馈 Edge/审计、成员生命周期和跨产品/跨标签/双会话隔离，QA 清洁恢复原库基线。Lens `core-entitlement-contract` **8/8 PASS**，类型、Lint、WebApp Vite 构建 PASS；首页综合到期仍只来自 `check_access`，历史使用 `created_at` 和已入账/撤销状态。全套 GE、CSP、长会话/断网、永久模式 Admin 浏览器表单及 UX 人工签收仍未完全覆盖，不能标正式 Stage2 全部通过。

**C0/C1 只读盘点与受控原型（未采用产品政策）**：只在已确认的本地 `supabase_db_Aisencore` 执行 `BEGIN READ ONLY` 聚合查询，不输出用户 ID/邮箱：当前共 2 条 Grant（1 admin，1 redeem_code），均为 duration、其中 1 条 `starts_at` 在未来，未见 explicit/lifetime/revoked；产品总数 2、正常 2。当前快照**不能推断远端生产状态**，不自动迁移/删除任何历史业务数据。 `scripts/experiments/pro-credit-reference.mjs` 是**纯内存、单用户单产品**参考算法；`node scripts/test-pro-credit-reference.mjs` 退出 0，包括 19 个命名场景断言与 **300 组确定性信用守恒验证**；该纯 JS 参考模型本身未执行真实数据库写路径、RLS/并发或 Lens 端，也未采用 DEC-E01～E08 作为最终业务政策。

**C2 PostgreSQL 事务隔离原型 PASS（不等于正式迁移）**：新增 `scripts/experiments/pro-credit-pg-prototype.sql`，使用 `BEGIN`、会话本地 `TEMP TABLE` / `pg_temp` 函数和末尾 `ROLLBACK` 在本地真实 PostgreSQL 中执行，不创建持久表、不修改既有用户/产品/Grant。一次执行退出 0，日志为 `CREDIT_PG_TEMP_PROTOTYPE_PASS`，覆盖受限账户信用 FIFO 结算、30+30 累计、撤销已部分消耗的 A 后 B 连续接续、再续期与撤销未消费 C、永久冻结/恢复、同来源同参重放、换参拒绝及两个产品账户隔离。仍未覆盖真实服务 RLS/AAL2、两个连接同时写、旧业务事件映射、事务回执 UNKNOWN、读写负载及 Lens；因此**不得将此临时事务试验直接安装为正式迁移**。

**本轮 A/B 与 D 真实浏览器证据**：`node scripts/test-admin-perf-aal2-readonly.mjs --identity-ux` 退出 0：CA01/02 受限邮箱匹配仅 1 行且编号按钮就近、CA03 用户详情、CA05 成员用户 ID 过滤、CA06 授权记录邮箱查找与无匹配时刷新禁用/不请求无筛选记录、CA07 用户详情预选、CA08 直接邮箱查找并显式选择已核实 UUID、CA14 治理操作仍有独立二次核对、CA12 390px 移动版无横向溢出，**只读操作未执行正式授权/封禁**；`AAL2_QA_CLEANUP PASS`。证据另存 `ui-evidence/admin-identity-ux-2026-10-28.json`，不覆盖原 29 场景证据。后续 AAL1 访问受限身份 RPC 的服务端拒绝场景亦通过业务断言，但一次运行遇到 Windows 临时 Chrome 目录锁定导致测试退出码 1；已独立核实并清理**仅本轮创建**的残留目录、加强脚本的 fail-closed 清理重试；该次不能视为整套 PASS。**补充回归再次完整执行后退出 0**，日志包括 `CA11_AAL1_IDENTITY_LOOKUP_DENIED PASS`、全部其余 8 组业务子项及 `AAL2_QA_CLEANUP PASS`，Chrome 临时目录清理成功。该测试扩展过程中曾在外层授权表单内发现嵌套 form 问题，首次扩展测试退出 1 且 QA 清理 PASS；改为非嵌套查找控件、阻止回车误提交后完整扩展用例复测退出 0。普通 `node scripts/test-admin-perf-aal2-readonly.mjs` 的 29 场景和懒加载外壳亦实跑退出 0、QA 清理 PASS；**不是**全套 CA01～14、写操作 GE、WCAG/真实长会话或人工设计签收。

**首轮历史验证记录（未安装新账本之前，已被上述真实迁移/Chrome/HTTP 扩展结果补充）**：`pnpm --dir apps/admin build` 退出 0（TS + Vite，2379 模块）；`pnpm --dir apps/admin lint` 0 问题；`node scripts/test-d3-phase1-foundation.mjs` 和 `node scripts/test-d3-source-boundaries.mjs` 均退出 0（静态断言）；`node scripts/check-doc-links.mjs` 首次检查 89 文档 / 858 本地文件链接 / 15 标题锚点 / 0 错误。**真实 AAL2 浏览器尝试**：`node scripts/test-d3-authenticated-pages.mjs` 退出 **1 / PRECHECK BLOCKED**，强制要求原始 DB 基线 `1|2|2|1|0|0|0|0|0`，当前只读发现 `2|2|2|1|1|2|1|1|10`（按顺序 Auth、两正常产品数、全部产品数、有效管理员数、成员数、Grant 数、批次数、码数、审计数）；脚本输出 `QA_PRECHECK_BLOCKED no temporary QA identity or product was created`，在测试用户/产品写入前停止。**绝不为使测试通过而清理现有用户和业务数据**；真实 CA/GE Chrome 属于未运行，需另准备独立隔离库重测。`node scripts/test-admin-auth-inflight-race.mjs` 5 场景 PASS（隔离模拟的 Auth 在途逻辑，不是浏览器业务验收）。新 Pro SQL/并发、Lens 与真实负载也未验证，保持 NOT RUN/OPEN。最终复核 `git diff --check`、工作区差异与文档链接，保持第一阶段签收未完成；不做 Git 提交、推送、DB 重置或云端操作。
