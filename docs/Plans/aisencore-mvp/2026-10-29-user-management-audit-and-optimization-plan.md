# 用户管理全链路审查与分阶段优化执行计划（2026-10-29）

## 2026-10-29 用户一级导航纠偏：真实用户中心首页

**用户最终确认的排布**：「用户中心」是唯一用户一级导航，直接打开 `/users` 的**注册账号列表**；每个账号只显示一行，无论加入几个产品。点「用户360°」进入 `/users/{auth_user_id}/show` 五区卡（账号状态/成员关系/订阅 Pro/反馈/审计）。旧 `/memberships` 是产品级**成员关系记录**，不能冒充用户目录，已从一级菜单及用户二级导航移除，仅供用户详情中的成员管理、状态调整和事件深链继续使用。

**关键后端约束修正**：以前的 `admin_lookup_users` 为严格 UUID/精确邮箱查找且拒绝无条件枚举，不能承担用户目录。新增专用迁移 `supabase/migrations/20261029180000_admin_user_center_directory.sql` 的 `public.admin_list_users`，在 `private.require_admin()` 验证**实时 AAL2、有效平台管理员且未被封禁**后，才允许服务端分页（每页最多50）、注册时间排序及可选产品/完整邮箱精确过滤。只返回必要的身份字段及成员数、当前产品成员状态、账号封禁事实；不改变旧查找接口的隐私/权限合同，也不授予普通 authenticated 对 `auth.users` 的直接 SELECT。全平台列表包含未加入任何产品的注册账号；单产品列表按该产品的成员关系筛选（包含历史退出/暂停），但按账号去重。读取失败不伪造成无用户；成员状态与平台账号封禁明确分列，切产品重置页码。

**前端实现**：`AdminMenu`「用户中心」直达 `/users`；`dataProvider.getList('users')` 使用新分页 RPC，`getOne/getMany` 仍走老的已知用户 UUID 查找；`WorkspaceLists` 显示真实用户邮箱、用户编号及复制、平台账号状态、关联产品数量、注册时间，单产品时多显示成员状态；点击「用户360°」打开原五区详情。页面以顶部产品选择器表达当前作用域，用户目录直接展示检索和数据列表，不再放置重复的介绍卡片。旧成员表格路由仍供高级业务记录深链使用。

**本地变更边界**：迁移只创建受保护的只读函数、授权和 schema cache 通知，未修改任何业务行、没有云部署或提交推送；已在本地 Supabase schema migrations 登记版本 `20261029180000`。旧「用户中心=成员列表」测试前提必须淘汰；后续验收必须从侧栏「用户中心」真实点击→注册账号列表→「用户360°」，同时执行匿名/AAL1 拒绝、非法分页、同账号多产品只展示一行、无产品账号不遗漏，以及单平台筛选。

## 用户明确的核心交互：单平台用户 360° 分区卡片（本轮补回主线）

**P0 用户报告的真实入口缺陷及修复（2026-10-29）**：实际用户截图是左侧「用户」→ `/memberships` → 列表「详情」→ `/memberships/{membership_id}/show` 的**单平台成员记录**，只显示状态/暂停；真正用户 360° 五卡位于 `/users/{auth_user_id}/show`。此前 Chrome 测试直接导航 `/users/{id}/show` 而未点击用户列表入口，属于验收路径遗漏，**不能将原五卡测试通过等同用户入口交付**。

已修复 `WorkspaceLists.tsx` 用户菜单首页的成员列表：主按钮明确标记「用户360°」，使用成员行的真实 `user_id`（非成员关系 `id`）前往五卡管理中心；保留独立「成员记录」次按钮用于操作单产品成员状态；非合法 UUID 不打开账号详情。移动列表将姓名和两个操作按钮上下排布，避免在320/390px压缩。旧 `WorkspaceDetails.tsx`「成员详情」中添加明显说明及「查看该用户360°管理中心」受保护深链，成员事件入口与原单产品安全操作继续保留。用户查询/Pro/反馈不因这次路由变化更改认证或授权后端。

**严格的真实入口回归**：在既有随机 QA 管理员、成员、Pro 授权的 GoTrue/TOTP AAL2 Chrome `node scripts/test-admin-operations-grants.mjs` 中，补上 **实际点击** `/memberships?user_id={uid}` 的「用户360°」按钮、核对用户 UUID/五卡，以及点击「成员记录」→旧成员详情→「查看该用户360°管理中心」返回五卡。最初新增断言使用了浏览器表达式错误及异步页面未稳定就断言的测试缺陷，经修正并完整重跑，**整套 EXIT0**：`USER_MENU_MEMBER_ROW_TO_USER360_REAL_AAL2 PASS`、`LEGACY_MEMBER_DETAIL_TO_USER360_REAL_AAL2 PASS`，后续真实23条权益分页、503/429恢复、操作弹窗与产品上下文均 PASS，`NONEMPTY_BUSINESS_BASELINE_RESTORED PASS`、`QA_CLEANUP_VERIFIED PASS`。Admin 正式 TypeScript/Vite Build EXIT0 / Lint 0。后续所有用户中心验收必须从左侧导航及真实用户行主按钮进入，不得只直接输入深链。

原始依据：`d3-admin-console.md`「用户 360° 详情」要求成员/有效 Free/Pro/历史事件；`d3-admin-experience-upgrade.md` UX-4 第一版明确仍需完善跨资源可达性；`2026-10-28-pro-entitlement-immediate-accrual-renewal-admin-ux-plan.md` 7.1 要求用户中心产品上下文卡片。此前专项过度集中邮箱与治理安全，遗漏了用户明确要求的卡片总览及反馈入口，不应视为已交付用户管理升级。

**本地第二批真实施工（2026-10-29）**：`UserShow.tsx` 扩充为五块可展开摘要「账号状态与权限」「成员关系」「订阅与 Pro 权益」「用户反馈」「账号管理审计」，每张卡支持语义化展开/收起；成员详情与成员事件、单笔授权详情、直接以用户为目标的审计详情及全部审计均有对应受保护记录入口。保留单产品成员/权益/反馈过滤，平台封禁/管理员资格/账号审计不冒充产品级权限；成员和权益按用户+作用域重置分页。订阅当前状态由服务端 `admin_get_user_pro_entitlements` 提供，通过 `dataProvider.getOne('user-pro-entitlements')` 的查询缓存承接 React-admin `refresh()`，不再只在路由挂载时查询一次；用户详情将刷新入口收至邮箱标题行右侧，仅保留带可访问名称的刷新图标，点击后仍由 React-admin `refresh()` 重取相关数据；删除顶部重复注册日期和作用域说明，注册时间保留在「账号状态与权限」详情中。读取错误不能显示为 Free 或正常。读失败/无记录/分页截断各自区分，反馈/审计摘要只预览最近5条，详情可进入完整列表。隐藏数据不写入本地持久化。

**用户详情操作去重（2026-10-29）**：移除邮箱下方与五区卡片重复的四个快捷操作按钮。账号管理、完整成员记录、完整授权历史、用户全部反馈继续由各自可展开卡片内部提供入口，不改变目标用户过滤、既有管理权限和操作流程；详情标题行只保留复制编号与刷新数据等必要工具按钮。

**平台管理操作拆分（2026-10-29）**：取消平台管理重复的「账号限制」导航/资源页面，普通用户封禁和解封只保留用户中心 `账号状态与权限` 内 `/account-actions`；新增 `AdminRoleActions.tsx`，使平台管理管理员权限列表/详情通过 `/admin-actions` 独立授予或撤销管理员资格，不再混用普通账号封禁弹窗。已核实 UUID、状态读、理由、二次确认和原 AAL2/审计 RPC 未变。代码与构建通过不等于实际 AAL2 管理员写入和浏览器视觉已签收。

**Pro 卡片重复授权入口收敛（2026-10-29）**：移除「各产品当前权益」逐产品展示行中的「此产品授权」按钮，仅保留卡片底部「为此用户新建 Pro 授权」作为新增授权入口，以及「完整授权记录」与各条历史详情。展示当前 Pro 状态不再夹带重复操作；专项 Chrome 脚本改为从卡片内当前真实入口验证弹窗，不再测试已移除的逐产品快捷入口。

**跨记录上下文闭环**：`/feedback/history?user_id=<UUID>` 以受限 `admin_feedback_summaries` 查询用户全部队列、保留当前产品并提供各队列切换、逐条详情及返回用户中心；非法/缺失 UUID fail-closed，防止漏筛选返回全平台反馈。在仅用户筛选的反馈视图禁用全量/选中导出（现有导出后端尚未承接用户过滤，不能提供与列表不一致的 ZIP）。用户中心 Pro 卡片底部 `/grant-new?user_id=...` 入口保留目标用户上下文，授权目标产品由弹窗按当前作用域与权限确认；如产品编号非法或顶部作用域冲突，禁止写操作而不静默改变目标；原 UNKNOWN 幂等恢复机制和真实 UUID 合同不变。管理审计列表 `?target_id=<UUID>` 也保留精确对象筛选。反馈详情增加返回该用户全部反馈的入口。

**最新复测（本地 AAL2，不是生产签收）**：在前期 Windows Chrome QA profile `EPERM` 和初版通用队列复用的前端错误（`TypeError: r is not a function`）后，改用专门的用户反馈历史页面，并从调用时点区分背景反馈查询与用户历史查询。最新完整 `node scripts/test-admin-perf-aal2-readonly.mjs --identity-ux` **EXIT0**：五卡展开和 Pro 明细、账号审计直达、完整反馈按用户 UUID 过滤、非法 UUID fail-closed、非法产品卡授权 fail-closed、CA01/02/03/05/06/07/08/11/12/14 子项和 `AAL2_QA_CLEANUP PASS`；这次不能继续拿早期失败运行冒充当前失败。最后一次 Admin TypeScript/Vite Build EXIT0、Lint 0 错误/警告。额外反馈阶段/320px 用例、非空真实多产品记录及 503/409/权限变化等完整场景仍须单独实测；本地合成只读成功并非发布许可证。

## 用户 360° 生产准出检查清单（不可自动签收）

| 门禁 | 测试边界 | 本地状态 |
| --- | --- | --- |
| UX-360-01 | 单产品/全平台、五卡摘要、可展开/收起、键盘可访问 | AAL2 五卡+订阅+审计 PASS；320/390展开操作和读屏 OPEN |
| UX-360-02 | 当前 Pro 汇总准确、历史区分、真实授权/撤销后的刷新 | 真实 AAL2 30天授予、503/429原请求恢复、超过20条用户详情分页与弹窗 **独立写操作套件 EXIT0**；React-admin cache+手动刷新代码/Build PASS；写入后重复读取/长期会话刷新细项 OPEN |
| UX-360-03 | 成员详情与完整事件、left/suspended/current lifecycle | 受保护链接已编码、原生命周期合同既有测试 PASS；跨产品完整矩阵 OPEN |
| UX-360-04 | 反馈收件箱/工作台/归档/回收站按用户+产品聚合，分页、详情与隐私 | AAL2 非空反馈的用户卡片→精准历史→工单详情、归档队列历史、320px非空展示、真实四队列状态+409并发审计、无障碍勾选/导出预览 **独立反馈写入套件 EXIT0**；多用户/多平台真实异常负例仍 OPEN |
| UX-360-05 | 账号封解禁/管理员、最后管理员冲突、审计 | 真实 AAL2 原四种治理操作和审计子项 PASS，撤权保护已有 PASS；所有负例 OPEN |
| UX-360-06 | 作用域不串产品/不漏用户、无匹配与服务器错误不伪造 Free/正常 | 无效产品编号拒绝授予、有效产品卡预选锁定实际产品、反馈历史非法UID拒绝查询、历史归档阶段仍保留UID **真实AAL2 PASS**；合法多平台切换、跨用户迟到响应 OPEN |
| UX-360-07 | Admin Build/Lint/类型、真实 Chrome 端到端、QA 精确清理 | Build/Lint、扩展`--identity-ux`、`test-admin-operations-grants.mjs`、默认`test-admin-perf-aal2-readonly.mjs`、`test-d3-authenticated-pages.mjs`、`operations-feedback` **均有完整 EXIT0 证据**；自动 axe、原始业务 UUID 全量保全与合成 QA 清理 PASS；生产复杂故障与人工签收 OPEN |
| UX-360-08 | 320/390/768/1024/1440、200%/400%、WCAG 2.2 AA NVDA/VoiceOver、人工视觉签收 | 320/390/768/1440局部浏览器与axe-core WCAG 2.2 检查 **用户中心0、反馈列表0严重/关键违规 PASS**；自动检查仍有 incomplete，200%/400%缩放及人工读屏/生产设备 OPEN |
| UX-360-09 | 远端历史数据预检、真实云迁移/回滚、真实运行环境授权、签收 | OPEN；无远端访问/发布授权，不得擅自变更 |

**新增真实写入验收（2026-10-29）**：`node scripts/test-admin-operations-grants.mjs` 曾在旧脚本未先展开折叠卡时退出1（但真实30天授予、503/429恢复通过、QA清理和原业务基线还原PASS）；现改为点击“展开订阅与 Pro 权益详情”，脚本先经 `node --check`，然后**完整再次执行 EXIT0**：`T1 PASS real User360 server pagination >20 grants`、`OPERATION_USER360 PASS`（账号操作及授权弹窗）、`B1_PENDING_GRANT_MODAL_CLOSE_PRESERVES_REQUEST PASS`、真实权限/成员状态生命周期 `X07 PASS`、QA清理与业务基线恢复全部PASS。此事实独立于只读用户中心 AAL2 EXIT0。

**新增浏览器反馈验收（2026-10-29）**：`node scripts/test-admin-perf-aal2-readonly.mjs --identity-ux` 扩展后再次完整 EXIT0，增加 `USER360_REAL_AAL2_FEEDBACK_ARCHIVE_STAGE_PRESERVES_TARGET`、`USER360_REAL_AAL2_FEEDBACK_HISTORY_320PX`、原完整历史/非法UID/无效产品与CA诸场景PASS，`AAL2_QA_CLEANUP PASS`；最终构建/静态检查和普通反馈四队列回归应分别记录。

**普通管理路由无回归（2026-10-29）**：`node scripts/test-admin-perf-aal2-readonly.mjs` 默认 29 组真实 AAL2 浏览器只读回归 **EXIT0**，含原反馈收件箱/工作台/归档/回收站 1440px 及 390px、成员320px与768px、授权/平台限制/审计列表、懒加载菜单可见等，`AAL2_QA_CLEANUP PASS`。本测试只验证列表加载/宽度，不能替代反馈写入及非空业务深链。

**新增无障碍及共享库保护修复（2026-10-29）**：独立 Admin 导航与 axe 套件`node scripts/test-d3-authenticated-pages.mjs` 的初次新卡片回归识别出反馈列表自定义/React-admin选择框的 `aria-prohibited-attr` 和 `label` 两条严重/关键 WCAG 违规。现以明确带标签的当前页/逐行选择及真实 input slot `aria-label` 替代内置不符合要求的复选框，保留选中反馈 ZIP 预览和导出入口。修复后**整套 EXIT0**：`A11Y_BASELINE feedback violations=0`、`user360-mobile violations=0`、账户/导航/恢复及原工单列表 PASS。`node scripts/test-admin-operations-other.mjs operations-feedback` **EXIT0**：实际勾选 QA 反馈→选中1条 ZIP预览→取消未导出，409并发拒绝、四队列完整流转、内部事件10、反馈审计6及QA精确清理PASS。`scripts/test-d3-authenticated-pages.mjs` QA清理由比较共享库全表 COUNT 改为逐表核对12个真实关系的所有原始 Auth/业务 UUID 仍在、容忍并发合法新增；不能因本机其他任务新增两条记录而谎报业务数据污染。

**用户中心非空数据的增强回归（2026-10-29）**：在上述 `operations-feedback` 隔离真实 AAL2 浏览器套件新增用户中心反馈卡展开真实 QA 工单→点击该用户全部反馈→验证仅该 UUID 的工单深链；在 **320px 有实际工单**时整页不溢出，以及归档后该用户历史的 `queue_state=archived` 仍能找到指定工单。首次扩展测试遇到同一 Chrome 调试目标快速 `Page.navigate` + `Page.reload` 的竞态，QA 清理与所有新业务断言均已通过但总计 EXIT1；缩减为只有同一路由原地刷新才能使用强制 `Page.reload` 后，**完整 `operations-feedback` EXIT0**，连同四队列审计和原业务 UUID 保全通过。另 `operations-grants` 扩展真实用户产品权益卡“此产品授权”的正向锁定预选及服务端综合权益上下文，在同轮 30 天授权、503/429恢复、23条授权分页与安全关闭弹窗中 **整套 EXIT0**。`USER360_REAL_AAL2_CARD_PRODUCT_GRANT_CONTEXT PASS`。

**永久 Pro / 登录认证及多断点复核（2026-10-29）**：`node scripts/test-admin-operations-other.mjs operations-permanent` **EXIT0**，真实 Chrome `GE19_GE21_PERMANENT_ADMIN_CHROME_WRITE_AND_CHECK_ACCESS PASS`、`GE20_PERMANENT_DUPLICATE_DENIED_AND_REVOKED_TO_FREE PASS`，本地非 QA 记录身份全部保留。`node scripts/test-admin-operations-other.mjs operations-responsive` **EXIT0**，`X01/X17 PARTIAL PASS 74 viewport-route combinations`、Tab/Escape、X16 兑换码 503 原请求安全核查及 429 明确拒绝、X03 AAL1/匿名直接路由拒绝、真实浏览器密码→TOTP→AAL2 登录全 PASS，全部 QA 清理及原业务 UUID 不变量 PASS。74 组视口检查是自动化局部覆盖，NVDA/VoiceOver、200%/400%缩放及人工验收仍 OPEN。

**发行/治理完整重跑（2026-10-29）**：此前 `operations-issuance` 有完整命令因测试软截止 EXIT1，虽然 X04/X15 部分场景 PASS。现保留同一安全 QA 软截止、完成脚本与精确身份集清理改造后，重新执行 `node scripts/test-admin-operations-other.mjs operations-issuance` **完整 EXIT0**：真实 Chrome 文本/CSV 兑换码首次明文与清除、503 UNKNOWN 原请求重试/核查、批次/单码撤销、平台封解禁与管理员授撤、AAL1 拒绝、老 AAL2 撤权、产品状态切换和审计、`QA_IDENTITY_CLEANUP`、`NONEMPTY_BUSINESS_BASELINE_RESTORED`、`QA_CLEANUP_VERIFIED` 全 PASS。当前真实环境 QA 合格不意味着线上 MFA/RLS/真实云、完整读屏或运营签收已完成。

**关联 PERF-01 登录性能仍 OPEN（2026-10-29）**：生产构建在单机冷缓存匿名 Chrome 下 `node scripts/test-admin-login-isolation.mjs --modulepreload-baseline` EXIT0，正常/4×CPU/150ms RTT 1.6Mbps 受限网络的中位 LCP 分别为 **628/672/2936ms**（每组5次），最后一项高于2500ms候选目标。证据在 `ui-evidence/admin-login-modulepreload-baseline-2026-10-29.json`。试验给 `index.html` 加入源码 `/src/App.tsx` 的静态 `modulepreload` 虽成功打包却额外产出未正常编译的 `App-*.tsx` 资源，因此**已原样撤销该试验**，生产构建恢复合法JS资源并再获 EXIT0；不保留未验证优化、不宣称性能准出。前次懒加载预取 A/B 无改善，真正解决需独立的匿名登录入口依赖拆分和生产网络基线，不能牺牲配置失效保护或 MFA 保护。

**PERF-01 第二个安全对照试验同样回退**：改为 Vite `transformIndexHtml` 的构建后插件，确实让正式 `dist/index.html` 的 `modulepreload` 指向编译的 `App-*.js`（不是源码，MFA/配置逻辑未改变）。相同5次分组 `node scripts/test-admin-login-isolation.mjs --modulepreload-trial` EXIT0，正常/4×CPU/受限网络中位 LCP **708/672/2952ms**，对比同轮基线 **628/672/2936ms**；慢网不改善、快网变差，故**移除该构建插件**并保留 `ui-evidence/admin-login-modulepreload-trial-2026-10-29.json`。两组仅本地模拟，不能当真实用户 P75/P95 证据。PERF-01 **FAIL/OPEN**，保持安全入口及原构建行为不退化。

> 范围：AisenCore Admin 的账号查找/详情、成员生命周期、Pro 授权、平台级封解禁与管理员资格、审计、错误恢复、访问性。唯一身份源 GoTrue；管理员操作仍由现有受保护 AAL2 RPC 决定。**本计划不授权云变更、部署、推送、业务数据清理或正式验收。**

## 一、审查依据与既有成果

- 主索引：`docs/Plans/TODO.md` 的 CORE-ADMIN-UI-001/002、UI-01/02、AUTH-01、DB-01；`2026-10-28-optimization-execution-program.md` A1–A4、B1–B3、D1/D2/D4。
- 需求与验收：`2026-10-28-admin-user-search-id-copy-and-grant-ux-plan.md` CA01–CA14；`admin-frontend-ui-production-readiness-audit-and-remediation-plan-2026-10-27.md` UI-G2/G3/G5；`d3-admin-console.md` 用户与成员状态。
- 源码：`WorkspaceLists.tsx`、`UserShow.tsx`、`UserIdentityPicker.tsx`、`WorkspaceDetails.tsx`、`AccountActions.tsx`、`GrantCreate.tsx`、`OperationDialogs.tsx`、`dataProvider.ts`；受保护 SQL 与现有 Chrome QA。
- **现状：**邮箱精确查找、用户编号就近复制、Grant 预选/综合 Pro 读、AAL2 后端限制、最后管理员保护、未知授权请求幂等恢复已有局部实测 PASS。不得重复造用户目录 API、脱离产品成员关系直接授 Pro、将全平台封禁与产品级暂停混为一谈。

## 二、审查发现、优先级与执行顺序

| ID | 优先级 | 发现 / 风险 | 修复方式与不变量 | 验收 |
| --- | --- | --- | --- | --- |
| U01 | P0 | 危险治理操作已达到目标状态时仍可二次确认并提交；无实质变化仍制造误操作与混淆 | 只有最新可核实状态与所选动作不同，才允许核对及提交；保留后台并发拒绝 | 四动作已是目标状态均不可核对/提交；换动作或目标后重新核对 |
| U02 | P0 | 页面过时身份/状态或网络异常可能误导治理 | 账号 UUID、邮箱、角色、封禁状态一起生成确认标识；失去可信状态关闭提交，不把读错渲染成正常 | 两人切换、403/503、读延迟、账号封解/撤权后重新核对 |
| U03 | P0 | 失联/响应未知的治理写入不应被 UI 当作确定失败/成功 | 查清现有 RPC 幂等与审计合同；不盲目新增重试/客户端伪成功，先区分已确认和未知 | AAL2 真 Chrome，实际超时/服务拒绝、重复点击/刷新、审计只记一次 |
| U04 | P1 | 账号检索/身份确认散落多个页面，跨产品和邮箱变化容易保留旧选中 | 复用现有受限 `admin_lookup_users`；邮箱精确匹配且只选已核实 UUID；切换身份/产品清空旧预览与确认 | CA01/05/06/07/08/09/11/13，多人同名、改邮箱、无匹配不全量枚举 |
| U05 | P1 | User360 的成员、授权、当前 Pro 综合与全局封禁分离读取；迟到响应/分页/旧用户数据 | 以路由 UID 约束数据和页码；区分“查询中/失败/暂无/当前状态”，历史不得冒充综合资格 | >20 历史、切号、单次 503、封禁与产品暂停、跨产品用户 |
| U06 | P1 | 成员详情主键/用户编号、成员退出/暂停/恢复的状态差异需要全矩阵确认 | 保留两个不同 UUID 的单独复制；服务端状态保护不能被 UI 空态掩盖 | CA04，suspended→left、left→suspended→left、产品暂停/恢复 |
| U07 | P1 | 管理审计、最后管理员保护及跨会话撤权需要真实负例 | 审计仅按受保护来源展示，403/409 时不出现成功提示；最后管理员由服务端拒绝 | AAL1/AAL2、最后管理员、撤管中在途查询、操作前后审计一致 |
| U08 | P1 | 跨端点失败语义/键盘/窄屏/长编号与读屏未完整验收 | React-admin/MUI 现有组件、语义状态提示、按钮可聚焦、无横向溢出 | 320/390/768/1024/1440、Tab/Escape、200/400% 缩放、NVDA/VoiceOver |
| U09 | P2 | 用户列表的规模和频繁读 API 请求需要定量证据 | 精确邮箱/ID 查询优先；测试100/1k/10k代表性读数、P75/P95；不优化无数据证明的路径 | 本地真实 HTTP 样本、查询计划/索引、只读隔离 QA |
| U10 | 发版门禁 | 线上 RLS/MFA/恢复与正式 UI 签收尚未批准 | 其他环境只读预检→经授权部署→真实云验收→负责人签收 | 不将本地PASS冒充生产PASS |

## 三、具体实施批次

**批次 A（现在，P0）**：审查 U01/U02 写操作表单及身份选择、实施最小无效动作阻断；保持与后台已存在状态的精确比较。执行 Admin TS/Vite build、Lint、受限浏览器页面的状态负例；真实 QA 必须自建并只清理由自己拥有的 ID。

**批次 B（P0）**：审查治理 RPC 的请求/回执、权限撤销、最后管理员与审计；先扩展真实浏览器/HTTP 测试再决定是否需要业务实现。若现有 RPC 不支持安全重复写，保持不自动重发 UNKNOWN。检查断网/503/409、操作结果查证。

**批次 C（P1）**：逐个补全 CA04/09/11/13；产品范围、邮箱更改与旧身份结果失效、无匹配和读取失败、路由和 Dialog 复用；必要时改 `UserShow` 查询加载/重试反馈。每一项记录 Chrome/HTTP 证据而非静态宣称。

**批次 D（P1）**：成员状态与 Pro 当前/历史状态的服务端一致性、分页和深链、账号封禁/管理员撤权后的只读报错；与 AisenLens 联调读取但不改其用户存储。

**批次 E（P1/P2）**：完整用户管理可用性/无障碍及性能：全视口、缩放/键盘/读屏、AAL2 多会话，非空真实数据及读失败的截图，身份受限 RPC 性能。

**批次 F（准出）**：验收 CA01–CA14 和 UI-G2/G3/G5，逐条标注 PASS/FAIL/NOT RUN；剩余风险单列，人工与云端必须取得授权，不自动签收。

## 四、实施状态（事实）

- [x] 审查现有优化文档及用户管理源代码、标出 U01 P0 差距。
- [x] 批次 A 第一项：`AccountActions.tsx` 已按现有受限状态阻断无意义重复治理操作；保留原理由/二次核对和服务端最后管理员保护。
- [x] 批次 A 当前单一无意义解封操作 **真实 GoTrue/TOTP AAL2 Chrome EXIT0**：`node scripts/test-admin-perf-aal2-readonly.mjs --identity-ux`，打印 `U01_REAL_AAL2_GOVERNANCE_NOOP_BLOCKED PASS`（未封禁账号选择解封后解释原因，核对/提交按钮均 disabled），原 CA01/02/03/05/06/07/08/11/12/14 正/负例和 `AAL2_QA_CLEANUP PASS`；Admin build、Lint 0警告/错误通过。此证据**仅覆盖无意义解封一种状态，不可当作四动作矩阵全部PASS**。测试最初新增用例有脚本换行字符串语法错误，修复后完整再次运行 EXIT0。
- [ ] 批次 A 尚待：已封禁→重复封禁、已有管理员→重复授予、非管理员→重复撤管、跨用户读迟到/403/503、完整高风险写操作回归。
- [x] **U01/U07 既有高风险写操作独立子场景已复核 PASS（非整套）**：`node scripts/test-admin-operations-other.mjs operations-issuance` 在真实AAL2 Chrome执行 `X04/X15 PASS`：真实账号封禁→解除、授予→撤销管理员，旧AAL2会话撤权、审计结果一致；`QA_PRODUCT_CLEANUP`、`QA_IDENTITY_CLEANUP`、`NONEMPTY_BUSINESS_BASELINE_RESTORED` 与 `QA_CLEANUP_VERIFIED` 全PASS。**该套件整体 EXIT1**：后续授权/兑换码详情回归超出独立 QA 软截止，`ADMIN_QA_SOFT_DEADLINE`，必须按详情子项单独重测，不把整个 `operations-issuance` 标PASS。用户治理四动作正常写入未被U01误阻断。
- [ ] 批次 B、C、D、E、F 的完整矩阵与正式签收。

**本地数据纪律**：保留真实用户与产品，测试随机 QA 身份必须精确核对和撤销；禁止清库、跨范围批量重写与自动远端部署。
