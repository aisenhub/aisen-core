# AisenCore Admin 全面性能审查报告｜2026-10-26

> **审查性质：仅报告，不整改。** Git main，HEAD 9e3c860e9d4a0877b0e3ce29379f86e5d615addf；以已有未提交变动的当前工作区作为基线。保留原有 Admin 反馈 V3、文档、测试及截图等未提交改动。未修改任何业务代码、依赖、迁移、原计划、Auth/DB 数据，未提交、推送或部署。本轮只新增本报告与两份脱敏匿名浏览器指标文件。**不是第一阶段验收或线上发布准入。**

## 一、执行摘要

**生产构建 PASS、Lint PASS；路由级拆包真实存在。** Vite 8.3.5 构建转换2376模块，产出27个JS chunk；App块103104 raw / 33850 gzip B。匿名登录在本地正常环境呈现，但1440×900冷HTTP缓存、4倍CPU降速与模拟1.6Mbps下行/150ms RTT的5次 LCP 为5152/4304/5336/3240/6644ms，中位5152ms，5/5高于参考良好阈值2500ms。

**未确认 P0/P1 级真实管理业务性能故障**；识别两项已证实的 P2（实验室首屏慢、原有回归脚本因旧常量中断）和六项 P2 静态风险。不能把潜在风险当成复现的性能问题。由于无独立授权的AAL2管理会话，本轮未测受保护Dashboard/业务列表/反馈处理/ZIP的实际加载交互性能，结论保持 **NOT RUN**。

原始样本：[匿名800×600冷/热 JSON](ui-evidence/admin-performance-review-2026-10-26-browser.json) · [1440×900常规/降速 JSON](ui-evidence/admin-performance-review-2026-10-26-throttled.json)。

## 二、环境、执行与样本

Windows win32、Node24.19.0、Chrome155.0.8059.81（独立headless Chrome profile）；已装 React19.3.1、React-admin5.15.5、MUI9.5.0、Emotion React11.14.0/Styled11.14.1、Supabase JS2.118.0、Vite8.3.5、TypeScript6.0.3。正式 pnpm build 后从独立127.0.0.1:3415 vite preview加载，Chrome CDP 端口3416；未占用现有开发端口。独立匿名profile尝试打开 /products，仅出现登录页，无业务表。结束时停止临时服务器并清理本次临时profile。硬件配置、后台进程负载及CDP模拟限速实际生效精度未校准。

| 命令/手段 | 结果 |
|---|---|
| pnpm build | **PASS**，tsc -b + Vite build，2376模块、27 JS chunk，约29.62s（这是构建耗时） |
| pnpm lint | **PASS**，34文件，0 warning / 0 error |
| pnpm --filter @aisencore/admin list --depth 0 --json | PASS，实际安装版本已确认 |
| node scripts/test-d3-phase1-foundation.mjs | **FAIL**：先输出ROUTE_SPLIT PASS，随后脚本第34行检查App中旧色值 #53637d 失败；后续子检查未运行 |
| 正式 preview + 自建Chrome CDP匿名导航 | PASS，四条件×五次，共20样本；无真实AAL2 |
| 真实E2E、数据库压测、用户/图片/导出 | **NOT RUN**，存在登录/写入/安全数据约束 |

| 条件 | n | 全部FCP=LCP（ms） | 中位LCP | 中位TTFB | CLS |
|---|---:|---|---:|---:|---|
| 800×600，HTTP冷，正常本地 | 5 | 6788,1084,512,404,368 | **512ms** | 64.7ms | 0（5/5） |
| 800×600，HTTP热，本地 | 5 | 232,208,524,268,176 | **232ms** | 12.4ms | 0（5/5） |
| 1440×900，HTTP冷，正常本地 | 5 | 4860,592,424,676,872 | **676ms** | 47.8ms | 0（5/5） |
| 1440×900，HTTP冷，4×CPU/150ms RTT/1.6Mbps下行 | 5 | 5152,4304,5336,3240,6644 | **5152ms** | 40.5ms | 0（5/5） |
| AAL2 Dashboard/SPA/表格/处理/导出 | 0 | NOT RUN | — | — | — |

800×600冷缓存本地请求中位9（JS8）、实际传输395761B（JS394864B）；热缓存请求中位仍9但包含缓存命中，传输1559B（JS1432B）。登录H1为LCP元素。首个冷测样本6788ms和1440×900首个4860ms已完整保留，存在TTFB异常高值，不能拿重载最佳值当用户首次体验。没有有效点击交互，INP=N/A，不是0；浏览器短时JS heap波动也不能证明泄漏。真实用户P75/P95、线上网络不能由每组5个本地样本外推。

| JS构建产物 | raw B | gzipSync B |
|---|---:|---:|
| mui-vendor | 416694 | 127391 |
| ra-core | 320512 | 101912 |
| index | 216427 | 68469 |
| supabaseClient | 214543 | 54823 |
| App | 103104 | 33850 |
| WorkspaceLists | 17909 | 6964 |
| Feedback | 14231 | 5403 |
| FeedbackV2 | 13813 | 5937 |
| Dashboard | 5406 | 2214 |

LoginPage、AuthActionPage、WorkspaceDetails、UserShow、GrantCreate、IssueCodes、AccountActions等均有独立异步块。raw磁盘大小、gzip文件大小、HTTP实际传输、解析后内存为不同指标；不能相加替代真实首屏关键路径。

## 三、正式路由与交互矩阵

以下均**源码已核查**，但除匿名登录与 /products 未登录访问隔离外，**本轮登录态Chrome/性能均 NOT RUN**。所有12类 Resource 与CustomRoutes来源：[App.tsx:21–52、276–301](../../../apps/admin/src/App.tsx)。

| 路由/任务 | 源码 | Chrome及性能 | 待验证条件 |
|---|---|---|---|
| /login；密码/TOTP | YES | 匿名20样本；TOTP NOT RUN | 真AAL2与会话返回 |
| /auth/reset-password、/auth/* | YES | NOT RUN | 恢复Token及邮箱链路 |
| / Dashboard | YES | NOT RUN | KPI、审计、产品范围 |
| /products 与 /products/:id/show | YES | 仅匿名未登录保护；管理页面NOT RUN | 4状态统计、列表筛选、详情 |
| /products/create 及创建弹窗 | YES | NOT RUN | 首开chunk/受保护写入 |
| /memberships 与 /memberships/:id/show | YES | NOT RUN | 成员分页/关联 |
| /grants 与 /grants/:id/show | YES | NOT RUN | 授权状态、用户引用 |
| /grant-new 授权弹窗 | YES | NOT RUN | 结果未知/幂等 |
| /code-batches 与 /code-batches/:id/show | YES | NOT RUN | 批次统计与详情 |
| /codes 与 /codes/:id/show | YES | NOT RUN | 摘要及到期，不取明文 |
| /issue-codes 发码弹窗 | YES | NOT RUN | 首次明文下载、UNKNOWN |
| /redemptions | YES | NOT RUN | 核销/用户与码引用 |
| /membership-events | YES | NOT RUN | 历史事件 |
| /users 与 /users/:id/show | YES | NOT RUN | 精确邮箱/UUID查询、用户360 |
| /admins 与 /admins/:id/show | YES | NOT RUN | 管理员身份 |
| /restrictions 与 /restrictions/:id/show | YES | NOT RUN | 限制范围 |
| /audit-logs 与 /audit-logs/:id/show | YES | NOT RUN | 审计详情JSON |
| /account-actions | YES | NOT RUN | 治理高危操作 |
| /feedback 收件箱 | YES | NOT RUN | 标签、摘要、20行Datagrid |
| /feedback/workbench | YES | NOT RUN | 分诊/标签/星标 |
| /feedback/archived | YES | NOT RUN | 归档/分页 |
| /feedback/trash | YES | NOT RUN | 回收站/分页 |
| /feedback/:id/show | YES | NOT RUN | V3编辑/用户/附件 |
| 反馈星标标签、历史Dialog | YES | NOT RUN | 弹窗按需查询、草稿 |
| 私有图片预览与ZIP导出 | YES | NOT RUN | Edge、R2、Blob及内存 |
| 共享范围选择器、四类操作弹窗 | YES | NOT RUN | 频繁切换、首次加载 |

## 四、发现清单（置信度、路径、代价、验证）

**PERF-01｜P2，已证实：受限登录首屏LCP慢。** 1440×900、4×CPU/模拟慢网，五次5152/4304/5336/3240/6644ms，中位5152ms；H1是LCP元素，CLS0。来源：[降速证据](ui-evidence/admin-performance-review-2026-10-26-throttled.json)、[main.tsx:1–19](../../../apps/admin/src/main.tsx)、[App.tsx:21–52、276–301](../../../apps/admin/src/App.tsx)、[LoginPage.tsx:1–20、96–115](../../../apps/admin/src/auth/LoginPage.tsx)。根因尚未分离下载、解析、执行及冷启动竞争；不把最大MUI chunk直接判为罪魁。建议先按同设备做五次CPU-only与五次network-only再抓Network/MainThread/JS长任务，若发现非登录必要管理依赖拖累H1，才在现成lazy/Vite路径内调整；不能削减MFA、校验或错误页。诊断低中成本，收益未知。

**PERF-02｜P2，静态风险：exact count与多资源聚合成本。** [App.tsx:61–72](../../../apps/admin/src/App.tsx) 产品范围perPage100及所选产品查询；[Dashboard.tsx:54–64](../../../apps/admin/src/Dashboard.tsx) 5个KPI加一组审计 useGetList；[lists.tsx:93–102](../../../apps/admin/src/resources/lists.tsx) 四组产品状态计数；[dataProvider.ts:67–95](../../../apps/admin/src/data/dataProvider.ts) 所有普通列表都请求count:'exact'。代码路径确定，**没有证据证明请求风暴或SQL慢**；RA已有TanStack Query缓存。验证AAL2首次、返回、切范围及100/1000/10000库量真实端点/时长/字节/只读EXPLAIN；证实后才聚合必要安全计数或减少实际冗余，保持RLS/正确total。低中成本。

**PERF-03｜P2，静态风险：通用列表双DOM/React子树。** [WorkspaceLists.tsx:195–206、270–311](../../../apps/admin/src/resources/WorkspaceLists.tsx) 每页20行，桌面表格与手机卡片均构造rows.map/CellValue，靠CSS display择一显示。结构可确定，尚无Profiler证据表明实际卡顿，也不能说10000行直接挂DOM。测320/390/1440px、返回20行、数据库不同总量下React commit/实际DOM/输入帧；有效才按断点择一挂载，保护读屏与响应式，低中成本。

**PERF-04｜P2，静态风险：管理员TTL的并发在途请求。** [authProvider.ts:4–34、40–70](../../../apps/admin/src/auth/authProvider.ts) 已有8秒TTL、会话AAL2及admin_check_access，未显式用同身份pending Promise合并checkAuth/getPermissions/canAccess的同时调用。可能重叠，不是已测风暴。AAL2冷进和TTL过期时观察每组RPC、并发；如确有重复则仅在身份相同且有效的窗口合并，401/403/撤权/登出及时失效；不得关闭后端权限复核。中等成本。

**PERF-05｜P2，静态风险：反馈标签字典独立Effect RPC。** [useFeedbackTags.ts:6–16](../../../apps/admin/src/resources/useFeedbackTags.ts) 每次挂载与productId变化调用admin_feedback_tags，仅用alive避免卸载更新，未复用现有查询缓存/取消；[FeedbackV2.tsx:89–110](../../../apps/admin/src/resources/FeedbackV2.tsx) 四队列与[Feedback.tsx:137–157](../../../apps/admin/src/resources/Feedback.tsx) 详情使用。需要在合法会话下往返5次、切产品、比较真实请求数，再决定用已有QueryClient按产品/身份受限去重，不建第二套持久缓存。低中成本。

**PERF-06｜P2，静态风险：单外层Suspense可能影响切页外壳。** [App.tsx:21–59、276–301](../../../apps/admin/src/App.tsx) lazy页包在整个Admin外的Suspense；框架自身也可能有边界，因此**没有证据断言顶栏会消失**。录合法AAL2每路由冷/热进入时AppBar/sidebar是否被替换、导航到业务可操作终点、焦点与错误态，证实闪动才下移fallback边界。低中成本。

**PERF-07｜P2，静态风险：只读查询没显式传取消signal。** [dataProvider.ts:67–95、99–139](../../../apps/admin/src/data/dataProvider.ts) PostgREST普通查询无AbortSignal；[WorkspaceLists.tsx:181–213](../../../apps/admin/src/resources/WorkspaceLists.tsx) 可频繁切产品/排序/页码，旧请求可能仍传输。RA不同Query key已隔离，不能声称旧数据覆盖新页。仅在慢网只读实验测旧XHR传输与状态，证明无效成本后才传SDK支持的取消信号；高危写入、UNKNOWN/幂等重试不适用。低中成本。

**PERF-08｜P2，已证实：既有分包回归检测陈旧。** pnpm build PASS之后，node scripts/test-d3-phase1-foundation.mjs 的ROUTE_SPLIT输出PASS（App103104 raw /33850 gzip）后因[脚本:27–45](../../../scripts/test-d3-phase1-foundation.mjs)第34行要求App包含旧侧栏色值#53637d中断。属于检测工具错误，**不是前端构建失败**；后续授权时改为现行Theme/真实语义断言并让各类子测试独立报告，验证全脚本与Chrome；低成本。

**仅观察不列整改：** [dataProvider.ts:5–8](../../../apps/admin/src/data/dataProvider.ts) 反馈列表返回完整content，而[FeedbackV2.tsx:52–73](../../../apps/admin/src/resources/FeedbackV2.tsx) UI显示两行摘要，实际网络体积和DB耗时未采样；[FeedbackExport.tsx:39–72](../../../apps/admin/src/resources/FeedbackExport.tsx) ZIP Blob URL60秒后有界撤销，[Feedback.tsx:38–76](../../../apps/admin/src/resources/Feedback.tsx) 图片按点击授权，均无已证实泄漏。早期[phase1-perf-browser-sample.json](ui-evidence/phase1-perf-browser-sample.json) 同时出现resourceRequests54和JS/传输0，文件本身说明只是探索样本，不能理解为真实零字节。旧[第一阶段计划](phase1-delivery-remediation-plan.md)第24行记录App当时零动态导入，是历史描述，不是今日构建事实。

## 五、十个审查维度与缺口

| 维度 | 已有证据 | 本轮NOT RUN |
|---|---|---|
| A 首屏/路由 | 匿名20样本；入口→登录源码链 | AAL2受保护页主任务可操作时间 |
| B 构建/包体 | 27 JS块raw/gzip与匿名冷/热JS网络 | 各业务路由下载解析时序 |
| C 请求/查询 | count、getMany、服务器分页代码 | 真N+1、SQL/规模/关联分布 |
| D 缓存/刷新 | RA Query存在；8秒Admin TTL；HTTP冷热分开 | Query失效、登出/撤权跨身份实测 |
| E 渲染/表格 | 20行分页、桌面/手机双子树 | React Profiler、有效INP |
| F 视觉稳定 | 匿名登录CLS 0、LCP H1 | 业务骨架/图片/动态数据CLS |
| G MUI/样式 | 单一theme.ts、组件/样式路径 | paint/compositing，不凭blur判慢 |
| H 反馈/ZIP/R2 | 图片按需、历史分页、Blob有界回收 | 含图ZIP峰值、真正R2与内存 |
| I Auth/网络安全 | AAL2/RPC/RLS边界、错误路径 | AAL2下429/503/断网、幂等负例 |
| J 长会话/观测 | 短匿名heap与旧脚本失败 | 30分钟以上DOM/GC/监听器持续趋势 |

## 六、建议的最小下一轮顺序（未经实施授权）

1. 先做登录CPU-only/network-only，录制5次以上Network/Performance长任务，确认PERF-01真实依赖关键路径，**不凭包大小盲改**。
2. 用独立获授权本地AAL2 profile，从Dashboard到12资源/6个CustomRoutes及详情、过滤、分页、弹窗做冷/热导航基线；聚焦请求数量、主内容可操作时间与PERF-02/04/05/06/07。不运行已有带创建/删除副作用的业务E2E。
3. 获专门造数/只读数据库观察许可后测试100/1000/10000总规模，仍按20行分页，录真实SQL、Query请求、ReactProfiler；只有证实才优化重复请求、按屏幕择一挂载、标签缓存。不得新增QueryClient或迁移技术栈，也不得放宽RLS、MFA及准确统计。
4. 单独修正PERF-08静态检查中的历史色值断言，使拆包、可访问性、浏览器性能分离验收。
5. 真实含图ZIP/R2、长会话/稳定GC与安全失败场景另行审批、合成隔离、限制数据、确认清理及审计后才执行。

需保留已经正确实现的[React.lazy](../../../apps/admin/src/App.tsx)、[DataProvider批量引用/分页](../../../apps/admin/src/data/dataProvider.ts)、[Auth TTL及服务端安全](../../../apps/admin/src/auth/authProvider.ts)、[范围页码恢复](../../../apps/admin/src/resources/WorkspaceLists.tsx)、[反馈历史打开才查询](../../../apps/admin/src/resources/Feedback.tsx)以及单一[Theme](../../../apps/admin/src/theme.ts)。任何优化都需同条件前后复测+业务、权限、无障碍回归，不承诺未经证明的百分比收益。

## 七、终止与签收边界

**本轮NOT RUN不等于PASS。** 无合法隔离AAL2会话，未执行已认证全站Web Vitals/SPA可用时间、真实R2/图片、10000行库负载、INP、内存长会话、完整200/400%缩放和真机、生产CDN/用户P75。解除阻塞需独立AAL2测试账号/会话、与现有QA排他锁和端口无冲突；造数、故障写入、私图/下载及重负载分别授权。绝不重置长期管理员/因子、清库、推送或部署。

本轮只交审查报告和只读证据，不修改任何产品实现，未确认第一阶段验收通过。参考：[审查指令](../../prompt/admin-frontend-performance-review.md)、[AGENTS](../../../AGENTS.md)、[三阶段门禁](three-stage-delivery-gates.md)、[React-admin文档](https://marmelab.com/react-admin/DataProviders.html)、[Web Vitals参考阈值](https://web.dev/articles/vitals)。
