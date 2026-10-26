# AisenCore 内部 Admin 管理前端架构

> 状态：MVP **应用层长期架构**，规定 Admin Resource、Provider 与敏感操作；正式 React-admin 已开始在 `apps/admin/` 编码（登录/TOTP、唯一 MUI Theme、初版 DataProvider 与业务 Resource）；已通过本地 TypeScript、Vite build、lint、真实 GoTrue TOTP/AAL2 Chrome 完整自动回归与静态产物秘钥扫描；**正式人工视觉与无障碍签收仍未完成**，离线 Demo 仍只用于交互参考。
>
> **视觉与实施状态**：采用[统一 Theme/UX 规范](./admin-ui-design-system.md)；具体视觉方案仍须用户评审。D1 数据库开发已启动，独立后端开发不受历史 UI-G0A 视觉样例门槛阻塞。权限按[管理员领域](../domains/platform-admin-and-account-lifecycle.md)及[API 契约](../backend/api-contract-and-mvp-acceptance.md)实施。
> **2026-10-25 最新 Admin 外壳**：已按 [三分区浅色轻质感设计与工程验收](../../Plans/aisencore-mvp/phase1-admin-shell-light-surfaces-2026-10-25.md) 将顶栏、浮动卡片式左侧导航、独立内容面板统一为浅色层次；顶栏不重复显示资源标题或「工作范围」，选择器靠左侧品牌。该日期的五入口 IA 已于 2026-10-26 按新要求调整为六入口；资源权限不变，Chrome 自动回归不代替人工视觉、无障碍与真机签收。
>
> **开发时选用规范**：[Admin 设计规则与模式入口](../../development/frontend/admin-design-guide.md)覆盖字体中文混排、表格/表单/确认、导航位置和长内容/错误状态的开发审查。迁入的设计原则**不新增**业务 API、角色或高权限数据读取，不自行决定已获批准的视觉方案。
>
> 适用对象：平台所有者与少数可信管理员使用的 **React-admin** 内部管理应用；不将它扩展为各 SaaS 的业务运营后台或面向全部用户的门户。

## 1. 定位、范围与边界

Admin 是 AisenCore 的**公共能力管理门面**：查看必要的平台用户/产品/成员状态，管理产品及成员生命周期、权益和平台自有兑换码。其作用是呈现数据、发起操作、展示执行结果，不充当统一认证服务器、后端业务引擎或数据库权限权威。

- **应用层**：React-admin 负责导航、Resource、List/Show/Edit/Create、筛选分页、确认操作、表单反馈和必要的状态刷新。
- **业务领域层**：产品状态、成员封禁和解封、权益以及兑换码业务规则分别由所属领域文档定义，前端不重复维护一份独立规则。
- **公共后端层**：管理员普通列表经 PostgREST + RLS 读取；所有写入经单事务的受保护 PostgreSQL 管理 RPC，逐次复核管理员资格/MFA 并写入管理审计；仅 Auth Admin 用户检索等必须持有密钥的操作走 Edge Function。
- **数据层**：Supabase 托管 PostgreSQL 保存公共关系与权益事实，RLS/GRANT、事务与审计防止越权和部分提交。
- **基础设施层**：React-admin 默认 React/TypeScript/MUI 体系、Vite 构建，Cloudflare Pages 托管静态 Admin 网站；实际域名、仓库与发布环境待实施时确定。

内部 Admin **不天然拥有**各独立 SaaS 项目、任务、私有文件的查看或修改权；只有明确的产品业务授权才可以访问对应资源。

## 2. Admin 信息架构：任务组织可调整，作用域与权限必须正确

- Admin 覆盖公共产品、成员、Pro 资格/授权期限、兑换码、管理员身份、限制及审计，并新增**已编码且通过本地反馈专项 AAL2 Chrome 验证，但尚未完成图片 R2/人工签收**的跨 SaaS 反馈处理领域；反馈业务、隐私和五态处理以[用户反馈架构](../domains/user-feedback.md)为唯一权威，不能把 V6 合成反馈当作真实后端。
- 平台/全局作用域是业务与权限事实。管理操作必须明确目标产品或全局影响范围；视图中的切换器、菜单或筛选状态**不能**成为真实授权凭证。跨产品查询和写入需由可信后端重新验证权限。
- 先从操作者实际任务组织导航和信息展示，鼓励用户综合详情和关联跳转以减少上下文丢失；具体菜单数量、名称、排序、顶部/侧边布局、Tabs、抽屉、工作台卡片数及页面栅格均不作为永久架构要求。
- 产品成员 `left/suspended`、平台账号 `blocked` 与产品运行状态的作用范围不同；不得混淆为一种 UI 状态。查询他人的会员状态只能基于授权的安全字段与事实，不能利用管理员 JWT 代调用其本人 `check_access`。
- Pro 是资格与授权时长事实，30/365/永久是期限参数而非功能版本。公共 Admin 不提供 SaaS Free/Pro Features/Limits 编辑、功能方案克隆或业务配额控制，参见[最新会员边界](../domains/membership-qualification-boundary.md)。
- 发码第一次响应中的明文只能临时展示；未知结果按原目标产品与 `request_id` 核查，不得自动产生双重危险写入。交互必须明确真实目标、影响、授权和错误结果，但不要求某个特定视觉组件承载上述规则。

### 当前第一阶段 Admin 业务导航（2026-10-26 更新）

侧栏**仅保留「工作区」一个分组和 6 个一级入口**，顺序固定为：`概览 /`、`用户 /memberships`、`权益 /grants`、`兑换码 /code-batches`、`用户反馈 /feedback`、`平台管理 /audit-logs`。用户反馈**紧跟兑换码**，有独立选中态；反馈详情 `/feedback/:id/show` 继续归属该一级入口。不再出现独立的「产品」一级入口或「业务管理」分类标题。其领域二级导航：
- 用户：仅 `成员关系 /memberships`、`查找账号 /users`；用户反馈不再出现在这里。
- 兑换码：`发行批次 /code-batches`、`兑换码记录 /codes`、`核销记录 /redemptions`。
- 平台管理：`产品 /products`、`管理审计 /audit-logs`、`账号限制 /restrictions`、`管理员权限 /admins`（同级；用户指定顺序）。
一级「权益」以授权记录为核心，不混用「会员」与产品成员身份；具体 Pro 授权操作仍保留业务类型。一级「平台管理」点击默认进入管理审计，产品独立 Resource 路径及其创建/详情仍保留并归属平台管理。二级导航复用统一的 `DomainNavigation` 与纯数据导航配置；React Router URL 是唯一的选中态依据，直接 URL、前进/后退、刷新、移动布局应保留当前视图。菜单层级不引入新权限边界。

成员事件 `/membership-events` 继续作为成员详情可检索的全平台生命周期记录，不以产品过滤假装其只涵盖选定产品。人工授予 `/grant-new`、发码 `/issue-codes`、账号治理 `/account-actions` 和新建产品 `/products/create` 的普通操作按钮以共享弹窗呈现，保留背景列表/详情与操作上下文；直接URL/新标签页仍可使用原独立完整页面。一次性明文保存、UNKNOWN请求核查、批次撤销均在同一个顶层弹窗处理，权限/审计始终交由后端。它们不单列一级菜单，细节见[弹窗施工与验收记录](../../Plans/aisencore-mvp/phase1-admin-operation-dialogs-2026-10-25.md)。产品详情能够选定该产品并前往成员、Pro 和批次视图；安全码与核销纪录可按非秘密 UUID 从已确定的批次或授权进行深链接。账号查找仍只接受完整邮箱，不增加用户枚举、模糊查找或信任前端参数的身份授权。

**适用范围**：这是第一阶段当前 UI 导航方案，并非永久不变的架构约束。参见 [导航实施与六入口调整记录](../../Plans/aisencore-mvp/phase1-admin-navigation-v2-2026-10-25.md)；原[六入口施工记录](../../Plans/aisencore-mvp/phase1-admin-navigation-redesign.md)已转为历史证据。

### 用户反馈收件箱与处理工作台（FB-V2 已编码，第一阶段整体未签收）

- **2026-10-26 任务导向界面整理**：收件箱与工作台使用同一组 MUI 业务 Tabs；React-admin Datagrid 将编号、两行正文、类型、未读、星标、图片数与标签合并为主要反馈摘要，优先呈现处理状态、优先级与时间，产品以受权限保护的引用字段展示名称而不铺满 UUID。窄屏折叠次要列表列，不使表头逐字换行。切换产品或队列时清除资源级旧勾选，避免在另一筛选阶段误导出；ZIP 仍以受保护 Edge 的服务端权限与过滤为准。
- **详情操作层级（2026-10-26 视觉纠偏）**：与其他 Admin 工作区保持左对齐及全宽、统一标题字号；反馈正文使用通栏内容卡片，无图片时不占独立空附件卡片；状态、优先级、负责人、内部备注和公开回复集中在下一张通栏处理卡片，响应式网格适配窄屏。低频的「星标与标签」与「处理历史」移动到详情顶部按钮，打开独立 MUI Dialog；历史 Dialog 按最新事件 20 条分页读取，关闭时不常驻加载。用户与产品引用仍使用受限详情链接，完整内部 ID 不占主要视觉。各独立版本事务保留原 RPC 权限与乐观锁，未保存处理草稿时阻止更新负责人；星标标签弹窗成功保存后刷新不清除其他编辑区未提交的公开回复和内部备注。视觉与行为自动测试不等于人工审美/WCAG 2.2 AA 签收。
- **敏感操作与前端保护**：内部标签使用独立 Chip 数组录入，单标签内容可包含中文顿号和逗号；最多 8 个、每个最多 32 字符、不允许重复，由客户端预检且 RPC 继续强制执行。处理状态选择仅提示服务端当前允许的后继状态；待用户补充时须填写公开问题，后端最终判断所有状态过渡。ZIP 弹窗每次打开重置敏感资料开关，启用内部评论或身份信息后必须经过同一对话框内独立确认，取消不得下载或继续保留敏感选项。私有预览图片使用短期授权链接和 no-referrer；错误可重新获取授权。
- **列表**：复用 React-admin `<List>/<Datagrid>`，收件箱仅展示未受理反馈和首次阅读状态，工作台才展示优先级、处理状态、星标、内部标签；支持产品范围、工作台分层筛选、原图数、时间、分页、加载/空/错误/冲突状态。首页可展示新反馈及处理中数量并深链到筛选结果。全平台/指定产品切换只是显示过滤，不是授权来源。
- **详情**：`/feedback/:id/show` 查看用户原文与私有图片（必须按反馈属主授权临时读取）、用户关联入口、处理状态、优先级、可选负责人、内部备注、独立的用户可见回复及只追加的事件时间线。查看不自动变更状态；状态变更由受保护 RPC 在单个事务完成并与审计一致，支持 `expected_version` 冲突刷新。
- **2026-10-26 双视图**：保留左侧「用户反馈」独立第 5 一级菜单；`/feedback` 为「收件箱」（待筛选/归档/回收站），`/feedback/workbench` 为「处理工作台」，`/feedback/:id/show` 依当前 queue_state 切换受保护操作。收件时没有优先级和处理状态，设优先级才晋升工作台；列表具产品/类型/状态/优先级/星标/标签筛选，Dashboard「待筛选反馈」计数只查 `inbox`。
- **ZIP 导出**：两视图用相同的选择范围/内容选项对话框，按已选 ID 或服务端筛选请求 `feedback-export` Edge，包含文本与私有图片，内部评论和用户身份默认关闭。单包最多 20 条，候选 ZIP 24 MiB，上线前需完成真实 R2/错误/性能与人工无障碍签收。
- **用户端**：一段文字、可选 0～2 张图片、提交后“我的反馈”状态与公开回复；禁止返回内部备注、管理审计和其他用户反馈。受限 Edge 图片上传与 R2/DB 幂等/补偿详见[反馈业务合同](../domains/user-feedback.md)。
- **权限**：Admin 读取仍走 RLS/PostgREST，写入仅 `aal2` + 当前平台管理员资格的管理 RPC；用户可见读写用受限投影/RPC。Resource、DataProvider、V2 收件箱/工作台可信 RPC、含导出共三个 Edge Function 已编码；**本地 SQL/TS、JWT/TOTP/AAL2 Admin 浏览器/E2E、零图真实导出 HTTP、隔离 S3 原图→ZIP 均已通过**，仍缺真实 R2 含图跨服务、人工 WCAG/视觉与全异常/压力签收。离线 V6 不能充当正式功能。

## 3. 登录、管理员准入与会话

1. Admin 复用公共 Supabase Auth 的邮箱密码登录与原生会话/密码恢复能力，不自建账号数据库、JWT 或登录服务。
2. **认证成功 ≠ 具有平台管理权**。Auth Provider 可通过受保护的“当前管理员资格/能力”查询决定是否进入管理界面；无权时显示拒绝页面并阻断管理导航。
3. React-admin `authProvider` / `canAccess`、资源隐藏和按钮禁用仅改善 UI；**每次敏感管理 API 必须由可信服务端读取当前管理员资格并判断目标操作权限**，不能仅依赖已缓存的前端角色。
4. 管理员身份可基于简单可信的 `platform_admins` 逻辑记录，不能来自用户可自行编辑的 `user_metadata`。管理员撤权后再次调用管理接口必须被拒绝，即使旧页面或 JWT 仍有效。
   `BlockAccount` 与 `RevokeAdmin` 必须由可信 RPC 共同保护最后一名未被全局封禁的有效管理员；UI 仅展示冲突和确认，不通过前端计数替代事务校验。
5. 账号级封禁与产品成员封禁彼此独立。Admin 登录不会给管理员自动创建所有产品的成员身份，也不自动恢复任何已退出或封禁的成员。
6. **首版强制 Supabase Auth TOTP MFA**。管理员进入资源前需要当前会话 `aal2`；未完成 MFA 由 Auth Provider 引导验证；服务端 RLS/管理 RPC 同时复核管理员资格与 `aal2`。丢失设备通过受控运维恢复，不能只靠 UI 判断 MFA 状态。
7. **Admin TOTP MFA 为 MVP 必做**，同时要求低打扰/低请求量：登录时必要的 TOTP enroll/challenge/verify 建立 `aal2`，有效管理会话中**不因为每次读列表、翻页、操作按钮而重新向 Auth MFA 服务器发起挑战**；普通管理 RLS/RPC 在原本一次业务请求中检查已签发 JWT 的 `aal2` + 当前名册/blocked。UI `checkAuth/canAccess` 可短暂缓存只供导航，不每次导航另行 `getUser()` + `admin_check_access`，并在 JWT 等级变化/401/403 时失效。真正的 Auth Admin Edge 仍需服务器额外资格校验。完整长期要求见[平台管理员与恢复控制](../domains/platform-admin-and-account-lifecycle.md)；AUTH-P06～P11 属实施时的真实验收用例。

完整权限与账号生命周期以[平台管理员专项](../domains/platform-admin-and-account-lifecycle.md)为准；登录/会话以[多 SaaS 会话专项](./auth-and-multi-saas-sessions.md)为准。

## 4. Data Provider、Auth Provider 与后端连接

优先遵循 React-admin 现成 **Resource + Data Provider + Auth Provider** 契约，不另造通用 HTTP/缓存/表单/路由框架。

- **普通列表/详情查询**：统一选择 **PostgREST + 管理员 RLS**；Data Provider 将 React-admin 的分页、排序、筛选转换为 Supabase Data API（须从服务端响应获得总数以支持分页）；先评估 `ra-supabase` 的版本兼容性，必要时只封装局部 Provider，不自行搭建每个 Resource 的读 API。`auth.users` 不暴露 Data API。**DEC-06 A 已批准**：优先受保护 PostgreSQL 只读 RPC 对本页有限 UUID[] 补邮箱、做有界精确邮箱查找与分页，内核必须同时验证真实 JWT/`aal2`/active admin/blocked、最小字段与受限参数，并在隔离环境证明 `auth.users` SELECT 的 owner/权限安全可行；**证据失败立即技术性回退**一次受保护 Edge 请求聚合内部有限并发 Auth Admin getUserById/listUsers 查询，禁止声称 SDK 有原生 UUID[] 批量 API。任何扫描未覆盖部分须标 `search_incomplete`，不能误报不存在；失败降级 UUID 主列表、严格隐私和浏览器无密钥。
- **敏感写入**：产品、成员、Pro 授予/撤销、发码/撤码和平台限制全部由**单次管理 RPC** 承载，函数按当前资格、`aal2`、目标状态判权并与审计同事务提交；`BlockAccount` / `RevokeAdmin` 冲突按 `STATE_CONFLICT` 提示而不假装成功。Auth Admin 用户查询及确需 Auth Admin 权限的账号操作通过 Edge Function，不能绕过对管理员的保底检查；数据库变更仍调用相应受保护函数。浏览器不持有 `service_role` 或秘密。
- **适配原则**：读路径仍为安全 RLS；普通产品状态等可适配的 create/update 采用标准 DataProvider 封装**单个受保护 RPC**，仅特殊不可逆/敏感动作使用独立命令 Mutation；任何操作均不得将 CRUD 直通受保护表。具体接口响应与缓存参见 §4.1，`ra-supabase` 版本安装前再核验。
- **查询与更新体验**：利用 React-admin 默认的 TanStack Query 机制做界面状态缓存与成功后的刷新/失效处理。缓存用于展示，不是权限判断凭据；操作失败不得假装后端已修改成功。
- **异常呈现**：接入既定 HTTP 状态码和稳定业务错误码；401 引导身份恢复，403 管理权限不足，409 并发/状态冲突应刷新当前记录，429/503/网络超时作恰当提示与有限重试。不能把暂时服务异常误称为用户被封禁。
- **结果一致性**：高风险操作优先等待服务端确认再显示最终成功；请求超时后先查询实际状态，不能假定操作未发生并盲目重复生成兑换码/授予权益。

公共 API 的逻辑契约及错误语义，以[API MVP 与验收专项](../backend/api-contract-and-mvp-acceptance.md)为权威；数据库写入边界见[数据库访问与可信事务](../database/database-access-and-transactions.md)。

### 4.1 标准 DataProvider 与特殊命令（A-03）

**普通资源继续复用 React-admin 的标准 DataProvider 与表单生态**：`getList/getOne/getMany` → RLS 受限 PostgREST 读取，能一一对应受保护管理 RPC 的普通产品状态等允许字段修改由 `dataProvider.create/update` 封装**单次** RPC、返回稳定 `id` 和安全 record，保留原生校验、加载、通知、缓存失效与重定向。撤销、封禁、批次发行、管理员直接授予属于**危险/特殊命令**，采用显式自定义 DataProvider 方法或 Mutation，绝不让浏览器直接 PATCH/INSERT 受保护业务表，亦不构建第二套 UI、表单、缓存、路由框架。

| Resource | 安全读取 | 写操作与失效 |
| --- | --- | --- |
| products / Pro 资格与期限 | 安全可读的产品元数据、当前 Pro Grant 摘要与授权期限预设（**不含功能/额度**） | 仅受控管理 Pro 发码/直授及期限事实；不提供 plans.features/limits 编辑和版本克隆 |
| users（虚拟） | Auth Admin 受限身份查询，稳定 id/必要邮箱 | 不经 Data API 访问 auth.users；高权账号操作经 Edge 验证 |
| memberships | RLS 分页、邮箱按需受保护补全 | suspend/restore 特殊命令；刷新成员、事件、相关权益 |
| grants | 本人/管理员安全投影 | grant/revoke 命令带 request_id；刷新授权与权益 |
| code-batches / codes | 无 code_hash/无明文的安全投影 | createCodes/revokeCodes 命令；刷新安全码与批次；首次明文只在当次组件易失内存 |
| redemptions / audit | 只读脱敏分页 | 不接受普通 CRUD 写入 |
| admins / restrictions | 管理员受限只读 | grant/revokeAdmin、block/unblock 高风险命令；当前身份变化清空敏感缓存 |

标准 create/update 返回服务端确定的 id+record；特殊命令返回其实际业务结果，不伪造普通 CRUD。401/403 应使管理资格相关查询立即失效；409 刷新对象；超时/未知结果先按 request_id 查持久事实，不能盲目重新发码/授权。**码明文绝不放入 TanStack Query cache、URL、localStorage、日志或遥测**。

**A-02 / DEC-06 后端查询与前端 getMany 已编码，D3 实际浏览器验收未完成**：虚拟 `users` Resource 的 `getMany(ids)` 对本页去重 UUID[] 一次调用受限 `admin_lookup_users`，让成员/授权/核销的标准 ReferenceField 批量补邮箱，避免逐条 N+1；若实际权限/查询计划、越权或 P50/P95 证据不满足，工程师直接切换为已批准的**单次 Edge 批量聚合回退**。本页邮箱失败降级 UUID，不阻塞合法成员主查询、不得误报完整性。该技术方案须先以真实权限/性能证据验证；Admin 视觉由所有者按实际页面评审，不强制历史四类样例。

**Free/Pro 操作边界**：用户 360° 的会员层级由本人在当前 SaaS 是否存在生效、未撤销、未过期的 Pro Grant 派生；否则显示 Free（无有效 Pro），不写永久用户等级、不造 Free Grant。**Core 不定义 Free/Pro 的 AI、导出、备份功能或业务配额**；各产品自身执行。账号 blocked、成员 left/suspended、产品停服照常限制在线服务。发码/直授只可授予本产品 Pro 时长，不能发行 Free。

**SaaS 功能配置不在 Core**：移除产品 Free/Pro Features/Limits、Free 默认能力更新、Pro 套餐版本克隆、功能快照编辑与相关 Admin 操作。产品管理只显示“Pro 资格与授权期限”（30天/365天/永久快捷期限选项）及发码/直授入口；变更具体 AI、导出或云备份业务规则不经过 AisenCore。原有期限计算、强类型幂等、风险确认、明文仅首响和 UNKNOWN 安全恢复不变。参见[资格边界](../domains/membership-qualification-boundary.md)。

## 5. 典型管理流程

### 5.1 成员封禁/恢复

1. 管理员进入某个产品的成员列表，定位目标记录；界面可展示当前成员状态和经授权的历史摘要。
2. 点击“暂停”或“解除限制”，在必要时给出操作确认；用户界面不直接提交可靠性未经验证的 `pre_suspend_status`。
3. 可信 API 验证当前管理员资格、产品目标及成员状态，并在同一数据库事务内修改状态和写审计。
4. React-admin 根据服务端返回刷新该记录/列表并显示结果。若记录已由其他管理员改变，按当前状态提示冲突而不是强制覆盖。
5. 从 `left` 封禁的用户解封后仍为 `left`，不会因为管理员操作重新加入。

### 5.2 自有兑换码创建及管理

1. 管理员选择目标产品和已批准的兑换码规则，提交创建请求。
2. 管理 RPC 核验管理员和 MFA、产品/套餐、数量上限以及提交的 `request_id`；生成高熵码、只持久化哈希并与审计同事务提交；**首次响应才包含明文**，允许管理员仅在本次结果页立即复制/下载，明确提示安全保存，不写浏览器持久存储、持久化查询缓存或日志。
3. Admin 按需展示创建结果及兑换情况，平台所有者按既定规则人工分发；领取/核销仍由独立的可信用户兑换接口执行。
4. 提交前生成一次 `request_id`；可在当前标签页 `sessionStorage` 暂存**非秘密**的 request_id、产品/Pro 期限与规范请求摘要用于刷新/断线恢复，不得含码明文、Token 或密钥。未知结果先用原 request_id 查非秘密批次状态；已创建则**不得再次显示/导出明文**。若明文确实丢失，分别确认撤销原批次和以新 request_id 重发并留审计；**不自动串联两次危险写入**。终态确认或登出时清理暂存。

兑换次数、有效期、批量创建、撤销、码明文一次性展示等 **MVP 默认规则已确定**，以[计费权益专项](../domains/billing-and-entitlements.md)为唯一权威；页面字段与批量数量上限待实施时细化。

## 6. 正式 Admin 前端质量与设计自由度

- 正式实现使用 React-admin/MUI 官方布局、Resource、表单、列表、通知和对话框等成熟能力，接入最小必要的 DataProvider/AuthProvider；不重造完整前端框架。
- 单一全局 Theme 提供视觉 Token，具体颜色、字号、密度、页面信息架构、响应式断点和交互组织由当前设计任务及用户评审决定，见[统一 UI 规范](./admin-ui-design-system.md)；本架构不定义视觉冻结值。
- 对状态、错误、可访问性、关键业务路径和危险操作结果做真实验证，不将历史原型样式、静态设计清单或单次构建成功当成验收。
- 小规模可信运营优先简洁、可审计，不预设复杂可配置仪表盘、BI 或 SaaS 私有管理能力。产品专属任务仅在实际授权范围内开放。

## 7. MVP 验收标准与未决事项

**实施时应能验证**：

- 未登录、普通账号和被撤销管理员资格的账号，都不能通过页面或直接 API 调用执行管理操作；管理员前端缓存不提供真实权限。
- 仅剩一名合格管理员不能被全局封禁/撤权；多管理员并发相互封禁/撤权不导致无人可管；失败操作显示 `STATE_CONFLICT`，保护必须由可信 RPC 实现。
- 可信管理员能够在公共产品、成员、权益、兑换码范围内完成已批准的首版管理操作；列表/详情显示的数据符合最小权限。
- 已发行码的产品、Pro 资格和可信授权时长不因 UI 期限选项调整而篡改；旧码是否可兑换由既有有效性与后端规则决定；发码明文仅首次成功响应可复制/下载，之后不能从 Admin 查询或重试恢复。
- 成员从 `active` 和 `left` 封禁再解封，分别返回原状态；重复封禁、并发状态变化不覆盖原记录；审计与状态一致。
- 后端拒绝变更、429/503、请求超时、重复提交时，前端能正确呈现状态，避免重复发码、重复权益授予或错误地显示成功。
- 浏览器构建产物和请求中不得包含 `service_role` / secret key、支付密钥或 R2 长期凭据；敏感 API 不允许只靠隐藏按钮实现保护。
- 不展示来自独立 SaaS 的私有项目/文件作为默认平台管理员权限。

**待实际实施前确认**：React-admin/ra-supabase 适配版本、MFA 恢复运维责任、发码批量上限和部署站点等仍需真实验证与授权；管理员 `aal2`、安全 RLS 读取、受保护写入和明文不可重取是既定合同，而非视觉候选。

## 8. Admin 前端行为验收用例（原 D3-UI-X 编号保留）

以下是可观察行为与安全回归索引，**不规定页面结构或视觉方案**。正式 React-admin 页面和这些端到端用例均未实现/执行（本地 D1 的 239 项 SQL/模拟角色 pgTAP 与 LCK-01～07 双连接测试另有证据）。真实证据需来自相应浏览器、RPC/RLS、权限、网络和可访问性测试。

| ID | 应验证的行为与状态 |
| --- | --- |
| D3-UI-X01 | 多种实际目标设备/缩放下关键任务、控件、导航可操作，无重要内容裁切/遮挡 |
| D3-UI-X02 | 只展示真实数据与可信统计，不编造 KPI |
| D3-UI-X03 | 未登录或 `aal1` 不暴露 Admin 数据；真实 `aal2` 才进入受保护功能 |
| D3-UI-X04 | 有效 `aal2` 不每次翻页重复挑战；管理员撤权后可信服务端拒绝并令 UI 资格缓存失效 |
| D3-UI-X05 | 产品列表、创建、修改与暂停的合法范围、分页及安全 RPC 写入 |
| D3-UI-X06 | DEC-06 身份查询按受限 UUID 批量补邮箱，失败降级、扫描不完整不误报不存在 |
| D3-UI-X07 | 成员暂停/恢复忠实呈现服务端状态；`left → suspended → left` 不误加入 |
| D3-UI-X08/X09 | **历史套餐功能克隆/冻结用例已取消**；取而代之的是 Pro 资格/时长、已发码与 Grant 事实不被期限 UI 改动篡改 |
| D3-UI-X10 | 直授 duration / explicit_window / 明确永久互斥正确、漏填拒绝、同请求幂等与可信时段 |
| D3-UI-X11 | 发码参数、限额、合法默认值、提交保护与服务端幂等一致 |
| D3-UI-X12 | 码明文仅首次创建成功的临时状态出现；刷新/登出/历史查询不再出现 |
| D3-UI-X13 | `UNKNOWN` 使用原 request_id 查安全状态；旧批撤销与新发为两次独立确认操作 |
| D3-UI-X14 | 码、核销及审计只读安全字段，不暴露 code_hash/历史明文 |
| D3-UI-X15 | 成员限制、全局封禁、产品暂停和管理员撤权实际影响与服务端 M1 防误撤合同一致 |
| D3-UI-X16 | 401/403/409/429/503/网络断开与未知写入结果区分，避免误报成功与盲目重写 |
| D3-UI-X17 | 键盘、焦点、读屏名称、输入法、缩放、对比度按 WCAG 适用条款真测 |
| D3-UI-X18 | 正式环境不泄露高权限秘密；Provider/Auth/版本连接与网络行为实际测量 |

## 相关架构

- [应用层索引](./README.md)
- [技术栈与部署承载](../infrastructure/tech-stack.md)
- [平台管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)
- [成员生命周期](../domains/membership-lifecycle.md)
- [公共 API 与 SaaS 接入](../backend/public-api-and-saas-integration.md)
- [公共 API 契约与 MVP 验收](../backend/api-contract-and-mvp-acceptance.md)
- [前端开发规范与官方参考](../../development/frontend/README.md)
