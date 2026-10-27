# AisenCore Admin 性能与感知体验专项优化计划｜2026-10-26

> **状态：第一阶段实施中，未达签收。** 上游：[性能审查报告（PERF-01～09）](./admin-frontend-performance-review-2026-10-26.md)；本计划是[第一阶段全站整改总计划](./phase1-delivery-remediation-plan.md)的性能专项执行细目，遵守[三阶段交付门禁](./three-stage-delivery-gates.md)与[TODO](../TODO.md)。开始实施时 Git main HEAD=`25b3f994b775006dd0d7410404eb631e34d29822`；保留原有未提交审查报告。本次获授权**制定计划并开始本地优化**，不含提交、推送、部署、云服务、迁移或生产/长期数据库与Auth/存储配置修改；本地隔离AAL2测试允许一次性创建并在结束时清理随机 QA 管理员/roster，不触碰实际用户/业务记录。

## 一、目标与真实基线

**双目标**：①真实加载/渲染效率（首屏、网络、主线程、请求去重、分页）；②感知性能（交互后及时反馈、可信固定结构先出现、加载时布局稳定、同范围刷新不中断、异常可恢复）。不以伪造骨架屏代替实际加载加速，不为了“展示动画”而人为拖慢快请求。

**确认的事实**：当前 Dashboard KPI/最近审计使用 Skeleton；10种通用列表初次 pending 时用250px转圈卡片替代整个列表，数据返回后整张表格才挂载；产品/反馈列表使用 React-admin 默认 List/Datagrid，尚未确认真实加载视觉；User360部分关联区用文字加载。匿名 Chrome 20 样本：正常本地800×600冷/热LCP中位512/232ms、1440×900冷LCP中位676ms；4×CPU+150ms RTT+1.6Mbps冷LCP中位5152ms（五次全部>2500ms），登录页H1为LCP元素、CLS=0。Build/Lint和27块拆包原先通过，但 `scripts/test-d3-phase1-foundation.mjs` 有历史颜色常量导致失败。**以上是优化实施之前的审查快照**；后续已新增局部 AAL2 加载验收，见第七节实施日志及新证据。不得将源码静态风险宣称为已复现问题。

## 二、施工原则与验收口径

**按已知结构选择加载方式，而非统一整页骨架**：列、字段固定且允许显示时，标题、筛选器、表头应尽早出现；未知的表体才视等待情况使用简短状态、少量行占位、轻量Skeleton或固定高度，移动端优先稳定的卡片容器。动态列/权限未知时不得预渲染未经授权字段。已有**同产品/同查询**数据刷新，应可继续阅读，并准确提示「更新中」；产品/身份切换绝不把旧范围记录当成新数据。避免短暂骨架闪烁、焦点跳失、频繁重排、不必要辅助说明。React-admin/MUI已提供的交互机制优先复用，不造第二套列表/分页/缓存系统。

测量五种独立时刻：点击→首次明确反馈；固定标题/筛选/表头首次可见；请求结束；表体真实可操作；渲染布局稳定。验收需生产构建、冷/热浏览器轨迹、CLS和表格区域尺寸、320/390/768/1440视口及键盘/读屏。**普通本地点击后100ms以内反馈是设计目标，不是实测成绩**；慢网0.5/2/5秒受控延迟录视频看突变；受限登录LCP争取≤2500ms但须先分离CPU/网络瓶颈。同条件前后至少五个样本，保留冷启动离群点和负例。AAL2、跨范围、空结果、错误/权限/超时、刷新/排序/分页均需实测，不能因构建成功直接签收。

## 三、任务分批（优先顺序与文件）

| 批次/优先 | 审查项 | 可执行施工及主要文件 | 交付门禁 | 当前状态 |
|---|---|---|---|---|
| **O0-A 立即 / P2** | PERF-09 | `apps/admin/src/resources/WorkspaceLists.tsx`：固定桌面表头先呈现、仅表体局部等待；移动端不挂载桌面表格子树，已有数据刷新保留记录并提示更新。 | Build/Lint/静态契约 + 隔离 AAL2 慢请求场景 | **工程 PASS、Chrome 加载子项 PASS；其他交互仍开放** |
| **O0-B 立即 / P2** | PERF-08 | `scripts/test-d3-phase1-foundation.mjs`：改为检查当前主题语义颜色的真实对比度，去掉失效旧色断言，保留分包、静态表格语义，并增固定表头等待防倒退检查。 | Node脚本必须跑完；源码检查不能代替浏览器 | **静态回归 PASS；浏览器 NOT RUN** |
| **O1-A 真实视觉审查** | PERF-09/06 | 确认 React-admin 5.15.5 默认 DatagridLoading 首秒不渲染内容。用 `PendingDatagrid.tsx` 为产品/反馈固定列立即展示表头，移动端局部状态；实测懒加载时顶栏/侧栏不丢失。 | AAL2生产预览暂停只读GET、固定表头/等待反馈/布局与响应式 | **29场景 PASS；视频/人工视觉等仍需补齐** |
| **O1-B 真实登录性能** | PERF-01 | 匿名冷加载 CPU-only/network-only 各5次；为JS公共依赖下载前的空白增加无JS轻量可读状态（index.html），不动MFA/认证。复测三组各5次（常规548ms、CPU4×676ms、模拟慢网2932ms）。 | `ui-evidence/admin-login-cpu-network-2026-10-26.json`、`ui-evidence/admin-login-after-shell-2026-10-26.json`；Build/Lint | **感知首屏反馈已实现，冷加载复测PASS；慢网LCP仍大于2500ms、性能目标未完成** |
| **O2-A 数据读取** | PERF-02/05/07 | 29个冷 AAL2 GET 记录独立查询数；对反馈标签加同令牌/产品仅在途去重并避免展示过期产品标签。对现存产品页多项准确 count/ScopeSelector 查询不盲目合并，不放弃精确 total；只读取消机制尚需SDK/RA语义验证。 | 不同身份/范围/错误下的准确请求、100/1000/10000量级专门授权 | **标签在途去重已编码；其它诊断/优化部分开放** |
| **O2-B 权限在途** | PERF-04 | `authProvider.ts` 增同 token 并发 RPC single-flight，每调用仍先核对 session + AAL2；登出/登录/刷新/重新验证将旧在途响应作废并沿用8秒TTL。 | AAL2冷进入RPC计数、临时QA管理员撤权后新导航拒绝；旧在途并发撤权/登出/会话切换仍另验 | **工程/正例 PASS、撤权后重新进入负例 PASS；在途登出/刷新/强制重验单元测试PASS，浏览器竞态仍待验** |
| **O2-C 渲染路径** | PERF-03 | 通用列表用断点只挂载桌面表或移动卡片，保留20行服务器分页与排序；减轻双树常驻风险。 | AAL2 320/390/768/1440加载布局正例；Profiler/读屏/数据量仍需证实效果 | **源码与局部浏览器 PASS；性能收益未量化** |
| **O3 完整签收** | PERF-01～09 | 主要业务列表受控 pending/真实恢复29场景，局部CLS和溢出采样；新增3个典型加载中状态axe自动WCAG扫描均无规则违规，但incomplete待人工判定。剩余详情/操作/错误/过滤/快切/200–400%/读屏/大量数据/INP/长会话/真实R2/导出及所有者签收待核。 | 全流程真实证据、不同数据量与负例及所有者签收 | **PARTIAL；阶段整体未签收** |

## 四、O0的详细行为与边界

1. **固定列表表头**：`TableContainer/TableHead` 在查询pending时也挂载，不让等待状态把可确定表头整体换掉。`TableBody` 仅显示单个横跨所有列的读取状态，有最小表体空间。完成请求后直接显示行；空集仍显示清晰EmptyScene，失败仍显示Alert和重试按钮。
2. **移动视口**：不强制显示桌面表头，不制作完整卡片骨架；用相同业务加载语义和适量空位避免页面剧烈重排。
3. **已有数据刷新**：`isFetching && !isPending` 时保留可用行，更新上方 `role=status` 信息；跨产品/过滤键变更只显示属于新键的结果，不伪装旧结果。
4. **回归检查**：旧 App 颜色值检查已过期；针对 `theme.ts` 当前语义色做对比度校验，记录色值与背景；校验拆包预算/表格排序/作用域复位/加载时表头存在。该脚本不宣称自动WCAG AA。
5. **零越界**：不动 Auth、RLS、MFA、RPC、数据库、危险操作、明文兑换码、反馈导出/私图、服务器分页20条及查询数据的正确性；不新增业务依赖、不提交、不部署、不覆盖未提交工作。

## 五、任务拆解、验证和回滚

**开始前**只读Git状态与本计划/源码；**每项完成**对改动文件做差异审核、`pnpm build`（TS+Vite）、`pnpm lint`、`node scripts/test-d3-phase1-foundation.mjs`，并在本节记录实际结论。AAL2/browser/大数据/真实R2无法安全执行时必须记NOT RUN，禁止将匿名登录页当作业务表验证。回滚时只逆转本专项新增行，不做`git reset --hard`、`git clean`、数据库reset或全项目回退。

**验收等级**：①源码已改；②静态/构建 PASS；③真实AAL2浏览器PASS（**仅标注的单个场景**）；④大规模/辅助技术/所有者视觉PASS，四级相互独立。任何异常必须明确失败和残余风险；所有者完成第一阶段完整签收前，这份计划保持打开。

## 六、实施日志

| 时间 | 操作与实证 | 遗留 |
|---|---|---|
| 2026-10-26 启动 | 以既有PERF-01～09审查为依据制定本计划；明确固定表头先显示、表体按需等待、真实和感知性能并重 | O1～O3 尚未开始 |
| 2026-10-26 O0-A | `WorkspaceLists.tsx` 已改：首次待加载仍渲染固定表头，表体最小高194px含状态；窄屏单独局部读取提示；同范围刷新状态显示“正在更新记录”；原精确账号空态、分页、过滤、排序逻辑未改。正式 `pnpm build` PASS、`pnpm lint` PASS。 | 初次 O0 时尚无AAL2；后续 O1 已补只读受控慢GET加载和CLS的局部验证；读屏/快筛选/跨产品负例仍 NOT RUN |
| 2026-10-26 O0-B | 旧颜色断言替换为当前Theme配色；Node回归脚本全部 PASS：10类独立路由chunk，App 103104 raw/33854 gzip bytes；表头对比度5.74:1、次要文本5.60:1、正文14.76:1、选中导航8.82:1；固定表头加载源码、排序及作用域静态语义均PASS。 | 这些是局部源码/对比度断言，非全站WCAG 2.2 AA或Chrome PASS |
| 2026-10-26 O1/O3 局部加载验收 | `node scripts/test-admin-perf-aal2-readonly.mjs`：生产预览+本地临时 AAL2 合成管理员，CDP 暂停真实GET，**29/29 PASS**，涵盖产品、十余通用列表、反馈四队列及320/390/768/1440典型宽度；固定表头/手机局部提示/顶栏保持、GET恢复成功；最大实验室CLS约0.0088，记录的文档水平溢出均为0；受控 AccountActions 懒加载保留顶栏与侧栏。临时管理员 Auth/roster 清理 PASS。证据 `ui-evidence/admin-perf-aal2-readonly-2026-10-26.json` | 仅局部受控测试；无真实端到端视觉视频、完整键盘/读屏、慢网负例/失败态、跨范围/连续刷新/变更、实际大量数据与视觉签收 |
| 2026-10-26 O1 登录隔离 | `node scripts/test-admin-login-isolation.mjs` 3条件×5次匿名生产预览冷载：中位LCP常规636ms、CPU4×单独688ms、150ms RTT/1.6Mbps单独2984ms；网络比单纯CPU影响更显著；全样本/CLS/长任务记录见 `ui-evidence/admin-login-cpu-network-2026-10-26.json`。 | 不得拿模拟网速当线上P75，也不是优化前后同条件AB；慢网LCP仍>2500ms，下一步先分析公共JS与关键链，禁止动AAL2保护 |
| 2026-10-26 O2 初步去重 | AAL2 冷进入权限 RPC 优化前单页2–4次，当前29页正例记录1–2次（每次仍先核验当前session与AAL2）；`authProvider`加single-flight和epoch/token安全失效；`useFeedbackTags`按产品/令牌在途去重并隐藏旧产品标签。`pnpm build`、`pnpm lint`、基础静态回归 PASS。 | 标签RPC仍有页面每次加载2次，不能声称消除所有冗余；登出/撤权**在途竞态**与缓存失效、受限容量/延迟、QPS及React Profiler仍 NOT RUN |
| 2026-10-26 O3 加载态无障碍抽检 | `node scripts/test-admin-perf-aal2-readonly.mjs --axe-pending`：生产预览、临时AAL2管理员、在真实GET暂停期间，对**产品桌面 / 反馈收件箱桌面 / 成员移动端**三个加载状态执行axe-core WCAG 2/2.1/2.2规则：三者 **0条violations / 0条serious或critical**，仍有incomplete分别2、1、1；29场景加载验证再次PASS、QA清理PASS。证据 `ui-evidence/admin-perf-aal2-loading-axe-2026-10-26.json`。 | axe的incomplete必须人工复核，尚缺真实读屏/键盘/缩放及每个动态状态，不算WCAG 2.2 AA签收 |
| 2026-10-26 O2 撤销授权负例 | `node scripts/test-admin-perf-aal2-readonly.mjs --revocation`：仅将本测试创建的随机 QA 管理员设为 inactive；服务端 `admin_check_access.allowed=false`，刷新后受保护列表转入登录页且无受保护行，**PASS**；29个加载场景继续 PASS；QA Auth/roster 清理 PASS。独立证据 `ui-evidence/admin-perf-aal2-revocation-2026-10-26.json`。 | 仅覆盖撤权后全新导航，尚未覆盖撤权/登出恰逢在途 RPC 返回的竞态、长会话及跨身份场景 |
| 2026-10-26 登录感知首屏 | `apps/admin/index.html` 中 root 预置不依赖 JS 的「正在加载管理平台…」轻量状态；React 正式挂载后替换。`pnpm build`/Lint PASS；`node scripts/test-admin-login-isolation.mjs --after-shell` 3条件各5次，LCP中位正常548ms、CPU4×676ms、模拟150ms/1.6Mbps网络2932ms。证据 `ui-evidence/admin-login-after-shell-2026-10-26.json`；前一次中位636/688/2984ms，**非严格同机交织A/B，差异不可认定统计显著提速**。 | 这是白屏/加载反馈缓解，不会消除 JS 网络关键链；仍需彻底分析公共依赖并使慢网LCP达到目标，未完成人工视觉/性能签收 |
| 2026-10-26 权限异步会话安全加固 | `apps/admin/src/auth/authProvider.ts` 在服务器管理员允许/拒绝响应后额外读取当前 session，对比 token/user 和失效 epoch，阻断请求开始后登录态变化但旧 RPC 返回时继续缓存旧授权；Build、Lint(0警告)、`test-d3-phase1-foundation.mjs` 均 PASS。 | 尚缺可控在途登出/刷新/撤权竞争条件的专门浏览器断言；该变更仅加强会话正确性，不能宣称已改善登录 LCP 或所有请求性能 |
| 2026-10-26 权限在途确定性竞态回归 | 新增 `scripts/test-admin-auth-inflight-race.mjs`：隔离运行真实 authProvider 源码（TS 编译后注入模拟 Supabase），无需触及数据库，验证 single-flight 两名调用者共用一条RPC、在途 SIGNED_OUT、TOKEN_REFRESHED、强制重新验证以及拒绝结果共 **5种场景 PASS**。测试特别断言旧允许响应不得使调用成功；保留脚本可复现。 | 是可重复的单元竞态断言，不是浏览器多身份/服务器撤权在途真实HTTP压力测试；反馈标签仍可见部分重复请求、慢网登录仍>2500ms |
