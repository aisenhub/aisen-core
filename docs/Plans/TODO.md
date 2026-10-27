# AisenCore MVP｜未完成工作与分阶段准入门槛

> 更新：2026-10-25。这里跟踪**尚未完成的实现、验证和所有者签收**。[三阶段交付验收总则](./aisencore-mvp/three-stage-delivery-gates.md) 规定顺序与数据切换，权威需求/架构见 [需求](../spec/requirements.md)、[架构](../architecture/README.md)，唯一总计划为 [MVP 开发总计划](./aisencore-mvp/00-mvp-master-plan.md)。下方 D1/D2/D3/S1/D4 是技术工作流编号，不能被误读为新的五阶段交付制。

## 三阶段总控与当前第一阶段退出清单

**当前交付状态：第一阶段进行中，尚未验收；第二、三阶段待第一阶段签收后推进。** 不得因局部 305/305 pgTAP、Chrome E2E PASS 或某个页面完成就宣布第一阶段达标。

**本次深审后新增施工入口**：[第一阶段全站交付整改计划（W0～W7 / P1/T1/B1/B2/A1/R1/V1/Q1）](./aisencore-mvp/phase1-delivery-remediation-plan.md)。本轮已实现**部分基础改造**：

- [x] **Admin 四项操作弹窗化（工程/完整Chrome自动验收通过，人工准出待完成）**：见 [实施计划与测试实证](./aisencore-mvp/phase1-admin-operation-dialogs-2026-10-25.md)。新增Pro授权、发行兑换码、平台账号操作、新建产品从首页/列表/用户详情以单一可访问弹窗打开，保留背景页面与四条原URL独立页面回退；用户详情精确预填UUID，普通成功刷新并关闭。发码真实明文单次展示未确认保存禁止关闭，TXT/CSV下载与擦除、UNKNOWN持久原请求核查/同号重试、批次撤销均在同根Dialog完成。正式Build/TypeScript、Lint 0警告0错误、27模块源码边界、构建JS秘密扫描、diff check和真实TOTP/AAL2完整Chrome **exit 0**，专项axe自动0违规但有incomplete；包含全部业务、高危RPC、503/429、70组视口及QA资源清理。**NVDA/VoiceOver、200/400%缩放、真机、完整键盘/焦点与八维视觉人工验收继续OPEN。**
- [x] **Admin 范围选择器精准对齐与一级菜单短名称（工程与真实 Chrome 自动回归 PASS，人工准出未完成）**：范围选择器在桌面右移，与正文主要 H1 左边缘准确重合（1440px x=309），平板/手机不增加固定空白；2026-10-25 当时唯一工作区五入口显示「概览 / 用户 / 权益 / 兑换码 / 平台管理」（2026-10-26 已按新要求扩展为六项）；用户二级、返回链接、页面包屑与资源显示名同步，具体授予 Pro 仍按真实业务含义显示。Build/TS、Lint 0 errors/warnings、差异检查 PASS；最终完整真实管理员 TOTP/AAL2 Chrome E2E **exit 0**，新几何对齐断言、五个一级导航短名称、用户二级跳转/详情、Pro 授权、70组响应式、高危流程和QA清理均通过。自动 axe 未检测到违规，但有 incomplete；完整人工读屏/真机/浏览器缩放/视觉签收继续 OPEN。
- [x] **Admin 三分区浅色悬浮布局重构（工程/自动化通过，人工视觉签收未完成）**：按 [详细设计与执行记录](./aisencore-mvp/phase1-admin-shell-light-surfaces-2026-10-25.md)，去除顶栏重复的「产品目录」与「工作范围」文字（保留业务正文 H1 与完整可访问 ScopeSelector），将全局范围移至 Logo 右侧；重新统一近白半透明顶栏、浮动圆角导航卡、内容面板与雾灰背景的三层视觉、细边与低强度阴影。新增真实 Chrome `SHELL_LIGHT` 几何断言：1440导航 x16–256 / 内容 x272–1391、16px沟槽、64px浅色顶栏，320px Logo/折叠44px/全平台范围正确，无整页横溢；截图复查补修导航选中态的卡片内距及产品搜索按钮横向排布。最新 Build/TS、Lint 0问题、源码边界26模块、构建包静态密钥扫描与两轮真实管理员TOTP/AAL2完整Chrome E2E（最终exit 0）PASS，70组视口、业务高危RPC和QA清理通过。**NVDA/VoiceOver、200/400%缩放、真机与用户八维视觉签收保持 OPEN**。
- [x] **Admin 导航 IA v2 五入口/单工作区重组（工程与自动化已完成，人工验收仍开放）**：按 [新版导航施工验收记录](./aisencore-mvp/phase1-admin-navigation-v2-2026-10-25.md) 删除「业务管理」分类，将原三业务入口与概览合并至唯一「工作区」；原「产品」不再为侧栏一级，而与「管理审计 / 账号限制 / 管理员权限」并列为「平台管理」四个二级视图；全面改名「平台治理」→「平台管理」。全部 11 Resource / MFA / 安全管理 RPC / 产品上下文与详情 URL 原样保留；新增产品→审计二级点击、刷新选中态、320/390px 宽度验收，**真实管理员 TOTP/AAL2 完整 Chrome 回归 exit 0**，70组视口与QA清理通过，axe 25状态零自动违规但有 incomplete。**人工读屏、真机、200/400% 缩放和最终视觉签收仍为开放门槛**。

- [x] **Admin 全站文字降噪与视觉重点专项 W0–W6（工程与自动化已完成，非总签收）**：按 [逐项施工记录](./aisencore-mvp/phase1-admin-content-audit-execution-2026-10-25.md) 清理首页营销 Hero/英文装饰标签、详情页重复“受保护”解释、操作页双标题、User360 有效权益本页数字误导、ProductPicker 重复范围提示、移动 RECORD、产品键误称账号枚举、旧 Resource 名称等；新增管理审计动作中文映射（`demo_fixture_preview` 显示为演示审计记录），治理动作显示与当前选择一致的真实业务风险。保留 Pro/发码 UNKNOWN、授权理由、撤销影响、一次性兑换码明文安全保护。生产 Build/TS、Lint 0 warnings/0 errors、源码边界/包密钥/diff check PASS；**最新真实 Chrome AAL2 全业务 E2E exit 0**，10类列表/8类详情、敏感写入/429/503、70组视口与QA清理通过；axe 自动违规0但存在 incomplete。**真机、完整键盘/读屏、200/400%缩放、全部业务边界态及八维视觉人工签收仍开放**。
- [x] **Admin 页面布局密度与导航视觉整改 W0–W6 的工程和自动化部分**：按 [施工记录](./aisencore-mvp/phase1-admin-layout-execution-2026-10-25.md) 去除业务列表英文装饰头部/重复范围卡及页内全局切换；产品列表计数区改为紧凑筛选；详情页改为面包屑、记录编号和操作布局；危险操作页收起重复安全说明但保留表单内核验与确认。顶栏首个可见品牌左置、手机折叠控制排在品牌后、桌面保持导航常驻；导航中文分组、统一15px文字/46px行高、压缩环境 footer。真实 Chrome 完整 AAL2 业务回归 **exit 0**，25页/状态 axe 自动检测无违规、70组视口组合 PASS；1440px运营列表表头约173–182px、首行约221–230px，修正了320px多16px横向溢出。生产构建/TS、Lint、源码边界、包静态密钥扫描与 diff check PASS。**真机、200/400%缩放、读屏/自动 axe incomplete、全站八维人工签收仍未通过准出门槛**。
- [x] **历史：第一阶段 Admin 六领域导航重构（原方案已被最新五入口导航替代，非当前 IA）**：侧栏从12个平铺入口收敛到6个（概览/产品/用户与成员/Pro权益/兑换码/平台治理），用户与成员、兑换码和治理分别提供路径驱动的二级导航，保留全部11个 Resource 和安全 RPC。成员事件下沉到成员详情，批次/Grant向受限码/核销视图传递非秘密 UUID，产品详情提供跨模块产品范围跳转，User360保留受控账号治理入口。生产构建/TypeScript、Lint 0错误0警告及源码/密钥静态扫描 PASS；Chrome 一级六菜单、二级选中/点击/刷新、三条关联深链、产品详情选定范围与全平台恢复、User360 → 治理操作页实填 UUID/邮箱核验、320/390视口及**整套真实 AAL2 业务回归 exit 0**。**人工完整键盘、读屏、真机、200/400%缩放及所有者视觉签收仍待完成**。详见 [导航施工与准入清单](./aisencore-mvp/phase1-admin-navigation-redesign.md)。
- [x] **V1 首页与全局工作台历史视觉方案（已由本次降噪改造替代；不是视觉签收）**：`Dashboard.tsx` 形成真实数据驱动的编辑式主视觉、四指标、快捷操作与审计时间线；`theme.ts` 和 `App.tsx` 统一工作区与导航视觉语言；包含响应式布局、减弱动画以及键盘焦点。正式 Build/TypeScript、Lint PASS，Chrome 320/390 首页无横向溢出及全套业务/25状态 axe 回归 exit 0；见 [V1八维自审](./aisencore-mvp/ui-evidence/phase1-v1-design-review-2026-10-25.md)。**真机、缩放、完整八维逐页人工评审与所有者视觉签收仍为开放门禁**。
- [x] **P1 局部：真实路由级懒加载**：`App.tsx` 改为动态加载各业务路由/表单/登录/详情，公共 Suspense 加载态；正式 Vite build 生成独立异步 JS 块，`App` 主要 chunk 从约 428 KB(gzip 122 KB) 降为约 93 KB(gzip 31 KB)。**不是首屏 Web Vitals 或所有性能预算达标**。
- [x] **T1 局部：10 个业务列表可操作列排序**：MUI TableSortLabel + 服务端允许字段排序及 `aria-sort`，纯计算状态列不假装可排序；扩充受限精确 ID 查询；作用域分页复位、超出页码给明确回首页选项。缺全表格交互、负例与综合自动化/人工签收。
- [x] **B1 局部：危险治理操作账号身份验证**：UUID 格式正确但无法解析到邮箱时不得解锁提交，不能根据 id-only placeholder 进行治理。
- [x] **数据完整性局部**：Dashboard 通过确切产品 ID 获取当前产品名称；用户360成员/Grant 历史改为独立20条/页的服务端分页并显示精确总数，关联产品按实际 ID 加载，未来授权标记「待生效」，授权时效定期重算，平台封禁只检查相应 blocked 行；超过20/100条实际数据翻页和完整资格仍需验收；可选产品超过100时补充精确产品键查询。
- [x] **A1 局部：源码已确认的低对比度颜色调整**：侧栏分组、次级说明、表头及列表 ID 与页脚颜色修正；仍必须全站自动扫描、读屏及人工确认。
- [x] **第一批改造已完成的回归范围**：正式生产构建 Chrome 真实 MFA/AAL2、10 列表和 8 详情、敏感 RPC、发码 429/503、Pro 503/429 与跨刷新幂等重放、表格服务端排序和错误 UUID 拒绝、70 组视口×页面断点及 QA 清理均 PASS；`scripts/test-d3-phase1-foundation.mjs`、正式构建及 Lint PASS。**此项只表示已经实施的第一批功能回归，不代表全阶段 P0/P1 或所有页面状态已通过。**

- [x] **Pro 授权 UNKNOWN 安全恢复子项**：`GrantCreate.tsx` 和 `grantPending.ts` 实现 tab 内原管理员/原参数/request ID 保持，503 后刷新、服务端先已提交时原编号回放不重复建 Grant，已知 429 拒绝及时清理。**独立受保护只读 `admin_find_grant_request` 已实现，19项 pgTAP 通过，使本地合计305/305；生产预览 Chrome 已验证 503 后只读查无、刷新后只读查已有且不重复写入；真实断网/超时、查无后实际点重试及全部期限负例仍未完成**。
- [x] **25 页/状态 axe 自动化准入样本**：开发依赖 axe-core 与正式预览 AAL2 Chrome 初始16页从281个违规元素匹配项修复至0；现在扩展8个详情页及危险确认弹窗，**共25状态全为0个 serious/critical 自动违规**，并已建立自动断言门禁，证据 `ui-evidence/phase1-axe-wcag-baseline.json`。**不等于正式 WCAG 2.2 AA 签收**：仍需 incomplete 排查、登录及其余交互态、NVDA/VoiceOver、完整键盘、IME、200/400%真实缩放与真机验收。
- [x] **第一份浏览器性能诊断样本**：正式预览 AAL2 Dashboard 实测资源请求、传输量、DOMContentLoaded/Load/TTFB 并保存 `ui-evidence/phase1-perf-browser-sample.json`；正式 LCP/INP/CLS、P95、冷/热对比与高记录量测试仍未完成。

- [x] **Admin 性能优化 O0 工程首批（非完整验收）**：按 [2026-10-26 专项计划](./aisencore-mvp/admin-frontend-performance-optimization-plan-2026-10-26.md)实施通用列表固定表头先出现、仅表体等待及已有数据刷新状态；修复 [PERF-08 静态回归检测](./aisencore-mvp/admin-frontend-performance-review-2026-10-26.md)中过期颜色值，增加加载结构契约。已执行当前 Git HEAD 下的 `pnpm build` PASS（Vite 27 JS chunk）、`pnpm lint` PASS（0错误/0警告）、`node scripts/test-d3-phase1-foundation.mjs` PASS（拆包、4项对比度、固定加载结构与排序/作用域源码断言）。**O1 已补充 AAL2 的受控只读 GET 慢请求加载/CLS 验证；完整业务交互、真实不同网络/数据规模、读屏和所有者视觉签收仍 NOT RUN。**
- [x] **Admin 性能 O1/O2 部分已落地（局部PASS，非完整验收）**：按 [专项计划](./aisencore-mvp/admin-frontend-performance-optimization-plan-2026-10-26.md)改造产品、反馈四队列的固定表头与局部 loading，通用资源列表桌面/手机子树择一挂载；`node scripts/test-admin-perf-aal2-readonly.mjs` 在本地一次性AAL2合成管理员+生产预览+CDP暂停读请求场景 **29/29 PASS**，320/390/768/1440代表性视口、最大CLS约0.0088、文档溢出0、懒路由保持顶栏侧栏、QA清理 PASS。权限 RPC 同token in-flight 去重后单页冷请求观测从先前2～4次降至1～2次；反馈标签请求部分仍2次，未宣称彻底消除。登录 CPU/网络分离各5次：冷 LCP 中位636/688/2984ms（常规/CPU4×/网络150ms+1.6Mbps），网络关键路径仍待优化。`pnpm build`、`pnpm lint`、静态加载与排序回归 PASS。证据见 `ui-evidence/admin-perf-aal2-readonly-2026-10-26.json` 及 `ui-evidence/admin-login-cpu-network-2026-10-26.json`。
- [x] **Admin 匿名入口白屏缓解（感知性能子项）**：`apps/admin/index.html` 新增轻量、无JS依赖的原生「正在加载管理平台…」反馈，正式React接管时替换；`pnpm build`、Lint PASS，重新用 `node scripts/test-admin-login-isolation.mjs --after-shell` 完成三条件×五次冷加载：LCP中位常规548ms、CPU4×676ms、模拟网络2932ms（此前636/688/2984ms）；不将不同轮次差异宣称因果加速，**模拟慢网LCP仍超过2500ms且公共JS关键路径尚未解决**。证据 `ui-evidence/admin-login-after-shell-2026-10-26.json`。
- [x] **Admin 权限异步校验补强（局部安全回归）**：`authProvider.ts` 在 `admin_check_access` 结果返回后再读取当前session，与发起时的用户/令牌和失效epoch对照，避免旧会话迟到结果误缓存授权；`pnpm build`、`pnpm lint`（0问题）、静态回归全部PASS；隔离AAL2生产预览29/29加载场景、撤权后新导航拒绝及一次性QA身份清理PASS。**仍须模拟 RPC 在途时精确登出/刷新/撤权竞态，未宣称该项完整验收。**
- [x] **Admin 在途认证并发确定性单元测试（局部PASS）**：新增 `scripts/test-admin-auth-inflight-race.mjs`，运行真实 `authProvider.ts` 转换代码并注入可控 Supabase 应答；同token双调用single-flight、请求期间登出、令牌刷新、强制重新验证及服务端拒绝共5场景PASS，旧请求返回允许不重新授权；不动本地DB/Auth数据。仍需真实Chrome跨身份、在途撤权和长期会话竞态。反馈标签重复请求与受限网络 LCP 尚未完成。
- [x] **Admin 性能第二阶段计划与S2首批源码**：新增 [真实加载与交互优化施工计划](./aisencore-mvp/admin-performance-phase2-real-load-and-interaction-plan-2026-10-26.md)，分S1登录关键链、S2反馈标签缓存、S3非空真实SPA连续操作、S4准确count/关联查询、S5只读取消、S6辅助技术与人工签收。`useFeedbackTags.ts` 完成令牌+产品隔离的12秒/最多20项短缓存及旧在途令牌校验；反馈队列选中的标签按产品作用域派生而非旧值延续。**工程首批不等于S2真实重复RPC下降验收**，安装TanStack Query直接依赖离线超时未改锁文件，后续应统一Query缓存。保留 S1、S3～S6 的全部待测门禁。
- [x] **Admin 性能第二阶段 S1/S2/S4 实测增量（均为局部，不算整体PASS）**：S2 新增 `node scripts/test-admin-perf-aal2-readonly.mjs --spa-tags`，本地隔离AAL2同一SPA切收件箱→处理→归档，标签RPC首次2次、接下来切两个队列新增0次，QA清理PASS，证据 `ui-evidence/admin-perf-spa-tags-2026-10-26.json`；S1 新增浏览器 JS 资源瀑布证据 `ui-evidence/admin-login-network-chain-2026-10-26.json`，网络模拟150ms/1.6Mbps冷LCP中位2948ms，mui-vendor约128KB在~1.9s完成，其后App/Supabase/登录页串行；仅延迟加载SetupScreen的试验中位2968ms无可靠收益，**已回退试验源码**，证据 `ui-evidence/admin-login-entry-split-2026-10-26.json`；S4 仅只读本地SQL小表（8产品/48成员/1反馈），精确COUNT执行0.310ms、最近20行0.168ms，不代表RLS/大数据量/HTTP。以上留存于 [第二阶段施工计划](./aisencore-mvp/admin-performance-phase2-real-load-and-interaction-plan-2026-10-26.md)，S1慢网≤2500ms、S2冷入双RPC和跨产品隔离、S3/S4大量数据/S5/S6门禁仍开放。
- [ ] **Admin 性能 O1～O3 余项及整体交付仍开放**：排查登录公共JS网络关键链并完成同条件A/B；审查产品状态count、Dashboard请求与标签重复负载、只读Abort及准确结果；已补临时 QA 管理员撤权后新导航拒绝负例 PASS（`ui-evidence/admin-perf-aal2-revocation-2026-10-26.json`），但**仍须完成 Auth 撤权/登出在途并发竞态与跨身份负例**、产品/筛选/页码快速切换、多种请求错误和超时、Profiler真实渲染收益、100/1000/10000隔离数据、P75/P95/INP、200/400%缩放和读屏/NVDA、截图/视频、真机与所有者视觉签收。加载中额外运行 `--axe-pending`，3个样本（产品桌面/反馈收件箱/成员手机）0条自动违规，incomplete分别2/1/1，证据 `ui-evidence/admin-perf-aal2-loading-axe-2026-10-26.json`；必须人工复核这些未完成项。阶段 O3 未完成，不得把当前局部29项PASS扩大为所有页面业务验收或 WCAG 2.2 AA 签收。

- [ ] **Admin 前端 UI 生产级审查与整改**：新增独立 [《AisenCore Admin 前端 UI 生产级审查与整改计划》](./aisencore-mvp/admin-frontend-ui-production-readiness-audit-and-remediation-plan-2026-10-27.md)（2026-10-27），登记 UI-01～14 与 UI-G0～G7，按真实业务范围验收功能、环境文案、全平台危险操作确认、账号未知状态、错误恢复、四反馈队列/含图ZIP、键盘与读屏、八维视觉/响应式及所有者签收。**当前只是审查基线与未完任务，并未改业务代码或执行新增全量E2E**；已有25 axe状态和29加载场景只算局部证据，与性能专项不重复建第二套合同。完整UI准出仍为BLOCKED。

### 第一阶段｜对接 AisenLens 本地开发环境之前 · 必须达到交付标准

- [ ] **Admin 全部资源和业务功能完整**：概览、产品、用户/成员、Pro、发行批次/安全码、核销、成员事件、账号查找、管理员、账号限制、审计及认证/恢复辅助页面。逐模块通过准确数据、操作、搜索、筛选、表格排序与分页（适用时）、详情联动、危险命令确认、加载/空/错误/权限/冲突/超时状态等全套业务流程和真实 Chrome 测试；合成数据覆盖完整场景。不可把用户已要求的业务功能移到第二阶段再做。
- [ ] **八维视觉品质与所有者签收**：字体排版、留白、视觉层级、色彩、动效、微交互、响应式和原创性对照高标准参考逐页评审；手机/平板/宽屏完整覆盖，消除已知 P0/P1 视觉和交互问题，最终由所有者进行明确视觉验收。
- [ ] **无障碍达到交付标准**：完整 WCAG 2.2 AA、键盘/焦点/读屏、表格和弹窗语义、错误提示、降低动画、200%/400% 缩放、中文输入和各模块多状态逐项 PASS；先前 30 组响应式及 Tab/Escape 烟测仅为部分证据。
- [ ] **优先完成 Admin 前端性能/代码拆分**：资源级动态导入、路由与大型依赖按需加载、减少重复请求/重渲染，真实测量生产构建冷/热加载、主要交互、数据较多的表格/分页、缓存与网络情况，记录基准和可验收预算；已修复约 944 KB 单块仅是起点，不算性能验收完成。
- [ ] **独立 Core/Admin 安全与质量收口**：MFA/会话恢复、数据库 Lint、错误/拒绝场景、真实本地数据库和 QA 清理、完整本地可执行权限与业务验收；关键功能的自动化及人工实测留证。第一阶段不连接真实 AisenLens 环境，不要求线上部署。
- [ ] **第一阶段交接准入**：交付功能矩阵、截图/视频或可复核操作证据、性能基线、无障碍结果、缺陷关闭记录，并取得所有者签收后才准入第二阶段。

### 第二阶段｜本地 AisenLens 双端真实业务联调（第一阶段通过后）

- [ ] **停用合成 seed/demo 作为验收依据**：改用实际本地 AisenLens 操作路径创建的产品/用户/成员/权限/备份等真实业务数据；旧 fixture 可保留但必须隔离，不以演示数据冒充真实联调，更不擅自导入生产用户数据。
- [ ] **同步开发 Core 后端和 AisenLens 对应前端**：注册登录/成员/Pro/兑换、离线 Free、按需权限复核和实际业务告知；落实批准的备份元数据/配额、Edge、R2 存储接口、版本差异预览和恢复，以及跨系统故障对账。
- [ ] **真实双端互通准出**：Auth ↔ Core ↔ AisenLens 本地客户端 ↔ 适用的 Edge/存储，覆盖成功/拒绝/断网/重试/权限撤回/到期/跨产品隔离；完成适用 I/R/REV 本地端到端矩阵与全部必要的 AisenLens UI 验收，取得阶段签收后才可转部署。

### 第三阶段｜Admin、Supabase、AisenLens 实际部署与验收（第二阶段通过后）

- [ ] **线上环境独立配置**：Admin/Cloudflare Pages、Supabase 生产或预发 Auth/DB/API/Edge、AisenLens 部署端、域名/HTTPS、真实 SMTP、所需 R2 私有存储与密钥/回调/角色隔离。固定本地开发管理员凭据及演示数据严禁入线上。
- [ ] **部署端全链路与生产运维准出**：真实环境业务、跨端通信、权限安全、性能/容量、邮件/恢复、数据备份与回滚、监控告警、事故应对及适用备份上传/恢复/对账；不以本地 PASS 替代线上 PASS。
- [ ] **正式上线审批**：全部线上验收材料和风险项经所有者审核，并**另行明确授权部署、推送和最终公开上线**；本任务的文档更新不代表任何此类授权。

---

## 以下按旧 D1/D2/D3/S1/D4 技术工作流跟踪详细实施事项

## Phase D1｜数据库与可信 RPC（本地准出）

D1-M1～M4 在本地完成六份 pgTAP 用例 `001`～`006`、**286/286 PASS**；测试已修订为与长期 demo 数据共存而不做全库 count 假设，M1 最后管理员条件在回滚事务中隔离验证；实际独立 PostgreSQL 双连接 `LCK-01`～`07` **7/7 PASS**。SQL 模拟身份和事务测试不等于 GoTrue/HTTP，后者另有真实 API 回归。

## Phase D2｜统一身份、公共 API 与 Admin MFA（技术工作流；第一阶段需收口独立可完成事项）

- [ ] **D2-M1 补足 HTTP 契约与完整服务健康**：已在隔离环境成功启动 GoTrue/PostgREST/Kong/Mailpit + DB（55321/55322/55324）并完成真实测试；测试后因开发密钥及 `0.0.0.0` 绑定风险已主动停止容器（数据卷保留），真实 JWT 已通过 401/403/409/422 与 `CheckAccess`/`RedeemCode` 业务拒绝 HTTP 200 测试；仍需全量服务（目前其余组件显式排除）、503/技术超时和完整负例的 HTTP 验证。
- [ ] **D2-M2 DEC-06 完整性能准出**：已实现非登录 owner、仅五个 `auth.users` 字段授权、专用 RLS 与 `admin_lookup_users`，SQL [006](../../supabase/tests/database/006_admin_user_lookup.test.sql) **47/47 PASS**，真实 JWT + `aal2` HTTP 正/负向通过；已进行 50 UUID × 15 次本地 HTTP 烟测（P95 21.6ms，小数据样本不具上线代表性）；仍需有规模的数据 P95/EXPLAIN，邮箱精确查询在 Auth-owned 表的索引方案未决定，若性能不达标则按约定切换受保护 Edge 回退。
- [ ] **D2-M3 完成剩余真实 Auth/MFA 用例**：已使用本地 GoTrue、Mailpit 实测注册确认、邮箱未确认不能登录、ES256 JWKS 签名校验、TOTP enroll/challenge/verify 升 `aal2`、管理员撤权/blocked 后旧 JWT 拒绝、日常读写零额外 MFA 请求、多会话本地登出隔离。已通过真实 Mailpit 找回邮件、签名恢复 JWT、更改密码、旧密码失效及新密码登录测试；D3 已编码 `/auth/confirm`/`/auth/reset-password` 页面及恢复邮件发送表单。待完成：真实浏览器回调验证、因子移除/丢失恢复、完整 `AUTH-P01`～`P12` 编号验收。
- [ ] **D2 SQL 性能警告与数据规模验收**：2026-10-24 回归后直接查本地数据库，`d2-*` Auth 残留 **0**、`admin-uiqa-*`/`ordinary-uiqa-*` 临时账号 **0**、`qa_browser_*` 产品 **0**，固定开发管理员 **1**、演示成员 **48**，不再存在旧的合成 Auth 用户待清理事项。Supabase Advisors 先前无 WARN 级安全问题，仍有 products/product_memberships 的两项 `multiple_permissive_policies` 性能提示，待真实查询计划判断是否合并。

- [x] **数据库独立 PL/pgSQL lint 代码质量修复（2026-10-25，本地）**：新增 `supabase/migrations/20261025000000_plpgsql_lint_cleanup.sql`，让 `private.admin_lookup_users_core` 及公开代理 RPC 的 volatility 与动态鉴权一致，删除码生成/发行两个 FOR 循环的遮蔽变量声明。已在保留长期管理员与 demo 数据的隔离本地库应用迁移，`pnpm dlx supabase db lint --local` 返回 `No schema errors found`，pgTAP **286/286 PASS**；再次核对原函数 owner 与私有 schema 的 CREATE 权限未扩张。**全新空库从头迁移回放及前端完整签收仍 NOT RUN**，不要把本项完成解释为第一阶段完成。

## Phase D3｜React-admin 正式管理前端（第一阶段必须完成交付级验收及视觉签收）

**D3 前端完备化专项计划（IMPLEMENTATION ACTIVE，未获视觉签收）**：[功能缺口审计、UX-0～UX-7、八维视觉/响应式/真 E2E 与用户签收](./aisencore-mvp/d3-admin-experience-upgrade.md)。在连接任何真实 SaaS 前可长期保留隔离本地合成数据；不得自动把旧离线 Demo 数据当成正式数据库或批准新增业务。

- [x] **UX-1 幂等本地业务场景数据**：`pnpm run seed:admin-demo` 已两次真实执行且计数一致，新增 4 demo 产品、24 合成用户、48 成员、26 授权、3 批次、18 码安全摘要、6 核销、61 事件与 10 合成审计；原始手动数据保留。仅限定 55321/55322 的 AisenCore 本地环境。
- [ ] **UX-0/UX-1 其余验证**：已建立真实临时 TOTP/AAL2 Chrome 自动回归，覆盖概览、产品、其余 10 列表与 8 类详情、3 类业务表单、账号精确查找、`aisenlens` 空态恢复；保留 1440/1000/390px 证据。仍需不同异常状态/键盘/无障碍基线与受控 fixture 清理（必须避免误删用户数据）。
- [ ] **UX-2/UX-3 高品质品牌设计与全站壳层**：已实现统一 MUI Theme、分组菜单、范围切换、资源级中文 i18n、10 个其余资源的原创页头/提示/移动卡片/数据表格/适用筛选与分页；8 类详情页面及受保护操作表单统一版式。真实 Chrome 均可加载，成员范围空态可恢复。尚需视觉方向对比、全站细节与所有状态/断点精修、用户视觉签收。
- [ ] **UX-4 核心业务页完备**：真实 Chrome + MFA 在 Vite 开发及 production-preview 上通过 10 个业务列表、8 类详情、3 类操作表单、账户精确邮箱 RPC、48 成员范围空态恢复。**本地真实写入 PASS**：产品创建/启停、成员 active/left 暂停/恢复、Grant 授予/撤销、单码/整批撤销、平台封禁/解封、管理员授予/撤权；后端状态/审计检查 PASS。TXT/CSV 真实下载并立即删除明文文件、首响不持久化、UNKNOWN 已有/缺失恢复及 Chrome 实际注入 HTTP 503/429 后分别安全重试或拒绝 PASS；修复了 PostgREST HTTP 状态码丢失导致 429 误判 UNKNOWN 的缺陷。测试 QA Auth/产品删除核验 PASS。仍需 18 个合同项中的剩余异常负例、全 WCAG 和视觉签收；见 [验收矩阵](./aisencore-mvp/d3-acceptance-matrix.md)。
- [ ] **UX-5～UX-7 八维视觉精修与签收**：多断点、键盘/WCAG2.2 AA/动效、真实浏览器 18 项安全/业务 E2E 和新增关键用例 PASS；完整截图/性能/用户签收，不能以编译或默认 RA 页面代替。

- [ ] **D3-M1/M2 工程编译与浏览器确认**：Vite/React TS、统一 MUI theme、AuthProvider/TOTP、受保护 DataProvider 均已实现；dev 和 production-preview 的真实 Chrome 已完成**页面实际密码输入→TOTP→AAL2**、匿名/AAL1 受保护路由阻断、主要管理写入与异常 503。还需 MFA 因子丢失恢复、所有注销/过期/权限负例、完整网络安全与 WCAG 验收。
- [ ] **D3-M3 业务页的真实完整验收**：已编码产品作用域筛选、成员/Grant/码/审计列表、Pro 直授、发码首响易失内存、UNKNOWN 核查/撤销/原 request_id 安全重试、管理员与账号限制；已实际通过类型检查、构建和未认证登录渲染；仍需真实业务读写负例、交互/视觉和复杂 UNKNOWN 恢复完整验收；不得将离线 Demo 或源码烟测当 E2E。
- [x] **D3 基础静态/构建门禁**：`pnpm typecheck`、`pnpm build`、`pnpm lint`、`pnpm install --frozen-lockfile`、`pnpm audit --prod`（此前 0 已知漏洞）、源码安全测试、JS 构建产物私钥扫描通过。Vite 8 采用 Rolldown 的 `ra-core`/MUI 依赖分包：主要 JS 分别约 216/308/366/428 KB，取代以前 944 KB 单个 Admin chunk，超大包警告已消除；**同时正式打包后的 preview 实测真实 MFA、全部页面及四条重要写入链路 PASS**。尚未全面性能/无障碍签收。
- [x] **D3 本地根目录 `pnpm run dev` 白屏修复**：确认 `apps/admin/.env.local` 缺失触发了 Supabase 客户端顶层错误。现在入口先验证 Publishable Key/URL 后按需加载 Admin；无配置显示可操作的安全引导页，配置正确加载登录页。两种情况经隔离端口 Chrome 烟测 PASS，`typecheck/lint/build` PASS；正式登录仍要求本地 Supabase 服务在线和有效管理员 TOTP。
- [x] **GitHub README 本地体验与配置指引**：GitHub 首页入口分离无需服务的离线模拟 HTML 与需真实 Auth 的 React-admin；在根目录增加 `pnpm run setup:local`，从本项目正在运行的 Supabase CLI 获取公开 Publishable Key、仅生成 Git 忽略的 `apps/admin/.env.local`，并将 Auth 本地回调白名单与 `http://localhost:3000` 对齐。上线/真实浏览器 E2E 仍未验收。
- [x] **本地固定测试 Admin**：`pnpm run setup:dev-admin` 仅允许本机 AisenCore GoTrue 55321 + DB 55322。固定邮箱 `admin@aisencore.test`，固定开发密码 `Admin123456!`（GoTrue 哈希保存到 auth.users，不另建本地凭据文件）；已有合格测试管理员时重复执行直接恢复固定密码，新建仅限空管理员名册。真实密码登录 PASS，`aal1` 的 `admin_check_access` 拒绝 PASS。MFA 首次绑定在浏览器完成，正式 D3-UI E2E 不因本地账号建立而豁免。
- [ ] **D3-M4 完整 18 项验收与视觉签收**：已在 `vite preview` 以本机真实 AAL2 Chrome 进行大量正向/部分负向验证；**尚非 18 项全部 PASS**。6 宽度×5 路由 30 个断点核查、基本 Tab/Escape PASS；继续补 429/断网、MFA 设备恢复、WCAG 2.2 AA/缩放与读屏、DEC-06 生产规模 P95、最终视觉评审和所有者签收。逐项真实结果在 [D3-UI 验收矩阵](./aisencore-mvp/d3-acceptance-matrix.md)。

- [ ] **D2/3 安全边界**：核验实际 JWT 签名方式及旧 `aal2` 会话/因子撤销差异；前端明文不落持久化缓存，不能假设首次 Network 响应不可见。

- [x] **2026-10-26 用户反馈一级菜单调整（导航代码与自动化验收）**：一级「工作区」从五项扩展为「概览 / 用户 / 权益 / 兑换码 / 用户反馈 / 平台管理」，反馈在兑换码下方，详情沿用 `/feedback/:id/show` 且选中一级入口；「用户」二级仅保留成员关系、查找账号。相关 App、域导航配置、D3/反馈专属浏览器测试和 IA 文档同步；不修改用户反馈 API、RLS 或存储权限。整体第一阶段人工签收仍单独 OPEN。

### 跨 SaaS 用户反馈 V2｜收件箱、处理工作台、AI ZIP 导出

- [ ] **V3 平台对接后再续开发（当前暂停）**：本地四队列、轻量编辑与安全 RPC 阶段已完成编码和专项验证，剩余私有 R2 压缩缩略图、真实含图上传/高清预览/ZIP、权限撤销与 503、全站 V3 回归、人工视觉/WCAG 2.2 AA、P95/故障恢复和生产迁移审批均保持 OPEN。对接后按 [V3 剩余工作交接清单](./aisencore-mvp/feedback-v3-lightweight-implementation.md#平台对接前暂停开发后续工作交接清单2026-10-26) 继续；当前只提交代码和文档，不执行远端部署、迁移或第二/三阶段施工。
- [ ] **V3 轻量反馈管理（2026-10-26，功能代码与本地 AAL2 专项已通过，尚未发布）**：四个并列队列、收件箱先写优先级/标签/星标/内部备注后原子加入工作台、处理人自动记名、工作台归档及回收站原阶段恢复均已落地；原 V2 RPC 直接收件箱归档的绕行已用数据库 Trigger 封锁。标签词典从全部可见记录获得，列表的多标签 OR 过滤和 ZIP OR 过滤使用一致合同；管理端剥离五态状态编辑、负责人指派与用户公开回复。V3 pgTAP 12 文件 462/462 PASS，Admin TypeScript/Vite Build PASS，Oxlint 0 warning，真实本地 AAL2 Chrome V3 浏览器流程 PASS（含删除恢复、归档重新处理、390px 无整页溢出和合成截图）。**未完成**：R2 真正低分辨率压缩缩略图与私有授权链路，目前只有固定尺寸占位与点击高清图；全站 V3 回归、真实带图 R2、性能与人工视觉/读屏签收。详见 feedback-v3-lightweight-implementation.md。不得因为已有本地测试 PASS 自动生产部署。
- [ ] **2026-10-26 反馈页面留白与低频操作重新整理（实现及专项浏览器测试已通过，人工视觉签收 OPEN）**：纠正标题、表格和空态被挤成页面中央窄列的宽度问题，按其他 Admin 页的全宽左对齐规范布局；详情改为通栏正文与处理表单，附件仅在实际存在时出现，收件分诊为紧凑横向按钮；星标标签和处理历史通过顶部按钮进入 Dialog，历史按需分页。反馈专项真实 AAL2 Chrome 增加列表/详情占宽比、弹窗入口、权限操作、草稿保留与移动端无溢出断言；已生成两张新的 Dialog 截图及原有列表/详情实测截图。仍需人工截图比对、键盘/读屏及 P95 性能验收，不等同云端上线授权。
- [ ] **2026-10-26 反馈 Admin UI 质量专项（代码/自动回归已更新，人工签收 OPEN）**：已改任务型列表、收件/工作台 Tabs、响应式双栏详情、状态与优先级层级、受限身份/产品引用、负责人可读账号、历史受控分页；守住 ZIP 的敏感字段确认与每次打开安全重置、切换队列/产品清除资源选中、草稿与版本冲突避免丢失。内部标签使用数组 Chip 而非含歧义的顿号拼接，状态选项限定后端合法下一步。真实本地 AAL2 Chrome 在专项脚本中新增星标/标签写入及保留公开回复草稿、敏感导出分步确认与重开后恢复默认用例，均 PASS；390px 详情/工作台、320px 工作台无整页溢出，axe 无 serious/critical；本地 DB 437/437 pgTAP PASS。已存 5 张合成界面截图在 ui-evidence/feedback-*.png；脚本新增的工作台 390/320 另外两张需以 FB_CAPTURE_UI=1 重跑才生成。待人工视觉、键盘/读屏/WCAG 2.2 AA、性能及第一阶段所有者签收；不等同云端可发布。
- [x] **2026-10-26 全站自动回归最新复测**：node scripts/test-d3-authenticated-pages.mjs 本地真实 GoTrue/TOTP AAL2 Chrome 最终 exit 0，受保护操作/异常恢复/导航、74 视口-页面组合、测试账号/产品资源清理 PASS。此前两个失败属于测试等待页面动作与 Chrome 截图超时，已加有界等待及截图重试并实际重跑通过；不能用通过结论覆盖尚未进行的人工无障碍、性能与视觉签收。
- [x] **V2-01/02/03 数据与可信 RPC 已落地**：本地增量迁移 `20261026013150`、`20261026013346`，新反馈优先级/状态均 NULL；Admin 明确分诊才入工作台，阅读/归档/软删除/恢复、星标/标签、原五态/负责人版本锁及审计。`010` 核心用例已添加。另加 `20261026023706_feedback_v2_read_only_marker.sql` 修复首次阅读不递增业务版本，真实 AAL2 Chrome 连续分诊回归 PASS，11 文件 437/437 pgTAP PASS。
- [ ] **V2-04 Admin 已编码，本地专项 Chrome 通过，人工门槛未签收**：`/feedback` 收件箱及归档/回收站，`/feedback/workbench` 处理列表，详情按 queue_state 区分操作，Dashboard 统计待分诊反馈；真实 AAL2 浏览器可从收件箱分诊并处理、指派及 390px/axe 自动检查，**完整 D3 真实 AAL2 Chrome/74 组视口组合 PASS**；仍需人工键盘/读屏、WCAG 2.2 AA、性能与所有者签收。
- [ ] **V2-05 ZIP 真实零图 HTTP 已通过，真实 R2 含图链路未签收**：`feedback-export` Edge、界面筛选/所选 ZIP 及字段开关、最小化导出审计。11 个数据库测试文件 **437/437 PASS**，ZIP 结构/解压/原始 bytes/隐私 **3/3 Deno PASS**；`node scripts/test-fb-v2-export-http.mjs` AAL1 403、AAL2 0 图选中/按产品筛选 ZIP 200、超限请求体 413、解压/最小审计/清理 PASS；本地隔离 S3 1/2 图 GET→ZIP 字节与 503 失败传播 Deno 用例 PASS。待含一两张真实/隔离私有 R2 图片 HTTP 全链、存储 503、吞吐/内存、长期回收和人工签收。
- [x] **V2 ZIP 权限/资源补强（2026-10-26）**：流式 R2 GET 严格 3 MiB 上限、导出前实时 Admin 检查及最终审计双检、打包后反馈版本快照二次核验 409、敏感字段二次确认与 Blob URL 延迟释放；9/9 Deno PASS、437/437 pgTAP PASS，重新加载当前 Edge 代码后本地真实 HTTP AAL2 ZIP/撤权旧 JWT 403 PASS；本地 Edge `per_worker` 历史版本缓存与 502/504 曾干扰复测，现核对导出 revision，不视为可上线签收。
- [ ] **V2-06/07/08 阶段门槛**：第一阶段 Admin/Core 所有工作完成后人工签收，才准第二阶段 AisenLens 本地联调；第三阶段实际线上 R2/Supabase/发布仍需明确许可。[V2 计划](./aisencore-mvp/fb-v2-inbox-workbench.md)为唯一现行施工合同。

### 旧 FB-V1 历史施工证据（被 V2 两阶段合同取代，仅供溯源；不作为当前完成度）

- [ ] **FB-01 数据、本人 RPC、Admin RPC（PARTIAL）**：三表/索引、RLS、本人受限读取/回复、服务端专用提交、管理员五态/优先级/负责人指派/公开答复/内部备注、乐观版本/事件/最小审计、本人安全附件 ID/版本 DTO、候选 5 条/小时双层限流已编码并在隔离本地库应用；`008/009` 已加入，**9 个文件共 397/397 pgTAP PASS**（SQL 角色模拟）。另用一次性 Auth 用户完成 **6/6 AAL1 HTTP 安全用例 PASS**，并新增 `node scripts/test-fb-real-http.mjs`：**真实 JWT/TOTP/AAL2 管理 HTTP、本人隔离、幂等/并发版本、负责人及状态/事件 PASS，QA 用户/产品清理确认**。后续仍需隔离空库全迁移回放、业务高并发与故障全面验证。见[FB 专项计划](./aisencore-mvp/fb-user-feedback-implementation.md)。
- [ ] **FB-02 Edge 小图与容错（PARTIAL）**：已编码 `feedback-submit`、`feedback-image-access`、私有 R2 条件写/短期读取、上传格式与大小检查、幂等 SHA-256 路径、并发重试安全保留对象、不执行危险即时删除的失败补偿初步分支；Deno `check` PASS、纯本地辅助单测 **5/5 PASS**。**已通过真实本地 Edge JWT HTTP**：0 图文字提交 201、重播 200、冲突 409、伪 MIME/三图 422、无权图片查询 403、5 条后新提交 429、精确重放不计数、匿名 401；隔离本地 S3 协议替身验证条件写 1/2 图、不覆盖和模拟 503，Deno 单测累计 **6/6 PASS**，所有测试资源清理已确认。**已新增 service_role 专用 `feedback_referenced_keys` 安全引用查询（仅列存在的 key，不删除）**。**尚未完成**一/两图 Edge→R2 真正 HTTP 端到端、图片解码/体积实测、R2 对象枚举与引用核对的实际运行/定时删除/告警、真实 R2 和并发/503/UNKNOWN 故障注入。
- [ ] **FB-03 Admin 反馈管理（PARTIAL）**：已编码独立一级「用户反馈」（紧随兑换码）导航、`/feedback` 列表、详情/按权限的图片预览入口、五态与优先级操作、内部备注/公开回复、时间线与首页新反馈指标，React-admin 生产 Build/TS PASS、Lint 0 问题。**已新增负责人指派/解除与事务审计**；**反馈专属真实 Chrome AAL2/E2E 已通过**：`scripts/test-fb-browser.mjs` 完成列表、状态提交、指派/审计、390px 无整页溢出、axe 无 critical/serious；同时修复中文空状态。**全套 D3 真 Chrome 回归已在修复测试时序和反馈空态假设后成功退出 0**，包括 74 个视口-页面组合、多模块权限与故障注入；**尚未完成**真实 R2 图片浏览器链路、完整键盘/读屏/WCAG 2.2 AA、性能与所有者八维视觉签收。
- [ ] **FB-04 双端/云端联调**：第二阶段 AisenLens 本地真实提交文字+最多两图、本人回看和追加回复、Admin 处理、离线/幂等/跨产品负例；第三阶段另行授权后验证真实 R2 私有读写/短签名、孤儿清理、注销删除、防刷、成本及性能。

## Phase S1｜AisenLens 接入与 R2 私有备份（第二阶段本地双端开发，第三阶段真实云端验证）

- [ ] **S1-M1/M2 备份配额预留 RPC 与受保护 Edge Function**：建立备份元数据与 `pending/ready` 配额原子预留；实现 Edge 校验 JWT/Pro/属主与白名单非敏感小 JSON，条件创建唯一 R2 final（`If-None-Match: "*"`），并落地跨系统失败对账与孤儿清理。
- [ ] **S1-M3 客户端低请求量复核与恢复验证**：实现离线 Free 零联网、Pro 按需复核 + single-flight 去重、手动选版本→预览分类差异→按类别替换恢复，实测通过 `REV-DEC02-01`～`08`。

- [ ] **D3 反馈交付边界**：数据库 RPC、Edge 与 Admin Resource 已有部分本地代码/静态验证，**并非用户提交到 Admin 完整 E2E 验收**；AisenLens 客户端与实际 R2 云环境未接入。V6 原型不能冒充真实联调，正式目录唯一为 `apps/admin/`。

## Phase D4｜跨阶段准入与线上发布（第一/二阶段完成本地可执行验收，第三阶段完成部署验收）

- [ ] **D4-M1/M2 全链路验收与应急演练**：真实运行并归档 `I-01`～`I-28`、`R-01`～`R-15` 及全部 `REV-*` 证据；测量核心 RPC P50/P95 延迟；完成 `A-04` 单人运营双 TOTP 因素失设备恢复演练与人工账号注销演练（`I-25`）。
- [ ] **D4-M3 生产配置核查与文档收尾**：核对生产 SMTP、回调域名、Cloudflare Pages/R2 最小密钥隔离与数据库备份恢复；全仓清理过期过程文档；**正式公开上线与云资源变更须经项目所有者独立明确批准**。

- [ ] **发布/账号注销缺口**：逐表梳理 `auth.users` 的 `ON DELETE RESTRICT`、历史合法留存与匿名化、跨 SaaS 数据/R2 清理；运行的实测区分 Mock/真实 R2/生产环境，不允许将 Mock PASS 冒充真实 R2。

**反馈未决运营参数**：单图 `3 MiB`、正文 `5,000 字符`、短时 GET `60 秒` 均是候选值；还需确认速率/请求包、清理执行者与频率、存储保留/账号注销处理、是否支持匿名提交或邮件通知，真实上线前必须有可复测证据。

## 到相应阶段才需确认的参数

- [ ] **管理员与兑换码（D3/D4 前）**：实际主管理员及备用 TOTP 因素恢复责任人（A-04）、单次批量发码上限（`100/批` 为候选）、码默认有效期与永久码发行策略。
- [ ] **AisenLens 专项（S1 前，U09/U10/U11）**：允许备份的非敏感 JSON 字段白名单、单文件字节上限（`256 KiB` 为候选）、保留版本数（`10 版` 为候选）/期限、以及 断网启动新纯本地 Pro 任务的 U11 与待测 15 分钟新鲜度窗口。
- [ ] **公开运营（D4 上线前，U06）**：生产域名、Auth 回调白名单、自定义 SMTP 服务商与发件身份、注册反滥用、人工账号注销申请渠道与法定留存期限。
