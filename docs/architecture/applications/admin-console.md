# AisenCore 内部 Admin 管理前端架构

> 状态：MVP **应用层长期架构**；本文规定 Admin Resource、Provider、敏感操作合同。原 [D3-UI 页面施工设计](../../Plans/aisencore-mvp/aisencore-mvp-d3-ui-admin-uiux-design.md)保存候选路由、线框与测试安排，未形成真实页面或已批准视觉稿。
>
> **视觉路线最新状态**：唯一视觉规范入口仍为 [Admin UI Design System](./admin-ui-design-system.md)。所有者已要求**删除 development 下的真实 React-admin/MUI 视觉原型**并暂停重新搭建；未来载体和 UI-G0 验收次序待讨论。**当前 UI-G0A NOT APPROVED，正式 MVP 业务实现不启动**。IA/权限仍以本文、[管理员领域](../domains/platform-admin-and-account-lifecycle.md)与[公共 API](../backend/api-contract-and-mvp-acceptance.md)为准。
>
> **开发时选用规范**：[Admin 设计规则与模式入口](../../development/frontend/admin-design-guide.md)覆盖字体中文混排、表格/表单/确认、导航位置和长内容/错误状态的开发审查。迁入的设计原则**不新增**业务 API、角色或高权限数据读取，不替代原有 UI-G0 视觉权威。
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

## 2. MVP 信息架构：按任务组织，严格区分操作作用域

**单一 Admin、两类操作作用域，而不是两套后台/权限系统。** 首发 Aisenlens 的产品运营列表和表单明确当前 `product_id` 并由可信 RPC 再校验归属；**全平台账号封禁、产品停服、管理员资格不能伪装为单产品操作或继承产品筛选**。首版只需显示当前产品和必要的产品选择控件；不建设 URL + `localStorage` 双状态切换器、全平台汇总工作台或独立 Workspace 框架；第二款 SaaS 接入时再扩展简单选择器。

| 作用域 | 一级导航/任务 | MVP 组合 |
| --- | --- | --- |
| 公共入口 | 工作台 | 精确查用户、发码、直授等真实快捷入口；不新增 KPI/统计 API |
| **当前产品运营** | 套餐、兑换码、权益授权、产品成员 | 套餐及 Free 指针；发码批次/单码安全状态/核销记录同一入口；授权与撤销；成员与事件详情 |
| **全平台管理** | 用户查询、产品管理、平台安全、审计 | 用户身份及跨产品成员/授权摘要、全局封禁；产品注册和停服；管理员资格；脱敏审计 |

**简洁用户详情**：经授权读取邮箱/UUID、全局限制、各产品成员、可信现有权益摘要、分页授权记录，按需展开兑换与成员事件；提供目标已绑定的直授和成员操作。**不创建管理员准入模拟器**：现有 `check_access` 是按当前调用者 JWT 做本人检查，不能拿管理员 JWT 诊断其他人的准入。历史数据按需查，不能访问独立产品的私有文件。

**危险操作显示影响范围**：成员 `suspended` 只影响当前产品，账号 `blocked` 影响所有产品，产品暂停影响该产品全部成员。确认弹窗直接标明目标/影响范围，颜色只是辅助，最终权限及状态由服务端事务判定。

**数据库表不是菜单清单**：`restrictions` 操作归入用户详情；`membership_events` 归入成员详情；`redemptions` 和单码检索归入兑换码区域。底层只读 Resource/详情路由可保留。首版不做支付管理、组织/RBAC、复杂 BI、SaaS 私有业务数据浏览。

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
- **敏感写入**：产品、成员、套餐、授予/撤销、发码/撤码和平台限制全部由**单次管理 RPC** 承载，函数按当前资格、`aal2`、目标状态判权并与审计同事务提交；`BlockAccount` / `RevokeAdmin` 冲突按 `STATE_CONFLICT` 提示而不假装成功。Auth Admin 用户查询及确需 Auth Admin 权限的账号操作通过 Edge Function，不能绕过对管理员的保底检查；数据库变更仍调用相应受保护函数。浏览器不持有 `service_role` 或秘密。
- **适配原则**：读路径仍为安全 RLS；普通产品/套餐 create/update 采用标准 DataProvider 封装**单个受保护 RPC**，仅特殊不可逆/敏感动作使用独立命令 Mutation；任何操作均不得将 CRUD 直通受保护表。具体接口响应与缓存参见 §4.1，`ra-supabase` 版本安装前再核验。
- **查询与更新体验**：利用 React-admin 默认的 TanStack Query 机制做界面状态缓存与成功后的刷新/失效处理。缓存用于展示，不是权限判断凭据；操作失败不得假装后端已修改成功。
- **异常呈现**：接入既定 HTTP 状态码和稳定业务错误码；401 引导身份恢复，403 管理权限不足，409 并发/状态冲突应刷新当前记录，429/503/网络超时作恰当提示与有限重试。不能把暂时服务异常误称为用户被封禁。
- **结果一致性**：高风险操作优先等待服务端确认再显示最终成功；请求超时后先查询实际状态，不能假定操作未发生并盲目重复生成兑换码/授予权益。

公共 API 的逻辑契约及错误语义，以[API MVP 与验收专项](../backend/api-contract-and-mvp-acceptance.md)为权威；数据库写入边界见[数据库访问与可信事务](../database/database-access-and-transactions.md)。

### 4.1 标准 DataProvider 与特殊命令（A-03）

**普通资源继续复用 React-admin 的标准 DataProvider 与表单生态**：`getList/getOne/getMany` → RLS 受限 PostgREST 读取，能一一对应受保护管理 RPC 的普通产品/套餐创建和允许字段修改由 `dataProvider.create/update` 封装**单次** RPC、返回稳定 `id` 和安全 record，保留原生校验、加载、通知、缓存失效与重定向。撤销、封禁、批次发行、管理员直接授予属于**危险/特殊命令**，采用显式自定义 DataProvider 方法或 Mutation，绝不让浏览器直接 PATCH/INSERT 受保护业务表，亦不构建第二套 UI、表单、缓存、路由框架。

| Resource | 安全读取 | 写操作与失效 |
| --- | --- | --- |
| products / plans | 受 RLS 的安全字段与版本列表 | 普通 create/update → 单 RPC；刷新产品、套餐及关联权益；冻结套餐拒绝修改权益字段 |
| users（虚拟） | Auth Admin 受限身份查询，稳定 id/必要邮箱 | 不经 Data API 访问 auth.users；高权账号操作经 Edge 验证 |
| memberships | RLS 分页、邮箱按需受保护补全 | suspend/restore 特殊命令；刷新成员、事件、相关权益 |
| grants | 本人/管理员安全投影 | grant/revoke 命令带 request_id；刷新授权与权益 |
| code-batches / codes | 无 code_hash/无明文的安全投影 | createCodes/revokeCodes 命令；刷新安全码与批次；首次明文只在当次组件易失内存 |
| redemptions / audit | 只读脱敏分页 | 不接受普通 CRUD 写入 |
| admins / restrictions | 管理员受限只读 | grant/revokeAdmin、block/unblock 高风险命令；当前身份变化清空敏感缓存 |

标准 create/update 返回服务端确定的 id+record；特殊命令返回其实际业务结果，不伪造普通 CRUD。401/403 应使管理资格相关查询立即失效；409 刷新对象；超时/未知结果先按 request_id 查持久事实，不能盲目重新发码/授权。**码明文绝不放入 TanStack Query cache、URL、localStorage、日志或遥测**。

**A-02 / DEC-06 方案已批准，NOT IMPLEMENTED**：虚拟 `users` Resource 的 `getMany(ids)` 对本页去重 UUID[] 一次调用受限 `admin_lookup_users`，让成员/授权/核销的标准 ReferenceField 批量补邮箱，避免逐条 N+1；若实际权限/查询计划、越权或 P50/P95 证据不满足，工程师直接切换为已批准的**单次 Edge 批量聚合回退**。本页邮箱失败降级 UUID，不阻塞合法成员主查询、不得误报完整性。该技术选择不解除 UI-G0A；未签收四类可见高保真与 Token 前不可开始 Admin 正式编码。

**Free 管理（DEC-04）**：`plans` 常规新建受保护 RPC 可创建**首次写入后权益不可再编辑**的 Free 新版本；“将此版本设为当前 Free”是独立、需确认的**受保护高风险命令** `admin_set_default_free_plan`，必须验证同产品 Free 家族、展示旧/新版本及影响、L0/L3/L4 内切换与审计，绝不修改历史发码或 grant。人工直授表单选择互斥的 `duration` 顺延与 `explicit_window` 显式时段（后者含明确永久），不可把空白字段默认为永久。

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
4. 提交前生成一次 `request_id`；可在当前标签页 `sessionStorage` 暂存**非秘密**的 request_id、产品/套餐与规范请求摘要用于刷新/断线恢复，不得含码明文、Token 或密钥。未知结果先用原 request_id 查非秘密批次状态；已创建则**不得再次显示/导出明文**。若明文确实丢失，分别确认撤销原批次和以新 request_id 重发并留审计；**不自动串联两次危险写入**。终态确认或登出时清理暂存。

兑换次数、有效期、批量创建、撤销、码明文一次性展示等 **MVP 默认规则已确定**，以[计费权益专项](../domains/billing-and-entitlements.md)为唯一权威；页面字段与批量数量上限待实施时细化。

## 6. UI 设计与复杂度控制

- 使用 React-admin 默认布局、资源页面、筛选、详情、操作确认、表单校验及通知；避免另建一套 Ant Design/Tailwind 前端体系或自研表格/路由/数据缓存框架。
- **D3-UI 已补齐页面细节（实施候选）**：按本文“当前产品运营 / 全平台管理”分组及 [D3-UI](../../Plans/aisencore-mvp/aisencore-mvp-d3-ui-admin-uiux-design.md) 的简洁用户详情、危险表单实施；沿用 React-admin/MUI 的侧栏、窄屏 Drawer、一次明文结果和 MFA 登录，不另建导航/状态框架。**视觉 token、菜单路径仍需真实 React-admin 版本与运营者验收，不是已开发 UI**。
- **全局主题约束**：Admin 必须复用[UI-G0 统一 Token/Theme、Layout 与共享模板](./admin-ui-design-system.md)，不能每个 Resource 页面各自声明字体/主题色/按钮/表格密度/断点，也不能把局部 `sx` 魔法数演化为第二套布局。主题颜色/字体与四种基准页尚未获用户视觉批准，**D3-UI 文档设计已完成不解除 UI-G0 阻断**。
- 管理人数少，优先简单可用、可审计，暂不设计复杂可配置工作台、企业组织导航、精细化角色编辑器、重型仪表板或 BI 图表。
- 不将 Admin 变为普通用户中心；用户本人退出/重加、订阅取消或数据删除请求由合适的独立用户入口处理。
- 批量操作、大文件导出、敏感账号操作如以后真正需要，再单独评估权限、确认和风险；不默认存在。
- 兼顾基本可用性：列表的加载/空状态、错误提示、分页、操作确认、取消与权限拒绝提示；**D3-UI 已提供中文优先、UI 默认候选字段/布局/路径与响应式/可访问性规范**，实际主题/字号/品牌色还要在 UI 实施前评审，不提前宣称已获用户视觉定案。

## 7. MVP 验收标准与未决事项

**实施时应能验证**：

- 未登录、普通账号和被撤销管理员资格的账号，都不能通过页面或直接 API 调用执行管理操作；管理员前端缓存不提供真实权限。
- 仅剩一名合格管理员不能被全局封禁/撤权；多管理员并发相互封禁/撤权不导致无人可管；失败操作显示 `STATE_CONFLICT`，保护必须由可信 RPC 实现。
- 可信管理员能够在公共产品、成员、权益、兑换码范围内完成已批准的首版管理操作；列表/详情显示的数据符合最小权限。
- 已发行码引用的套餐权益被锁定；停用套餐后旧有效码仍可兑换；发码明文仅首次响应可复制/下载，此后不能从 Admin 查询或重试恢复。
- 成员从 `active` 和 `left` 封禁再解封，分别返回原状态；重复封禁、并发状态变化不覆盖原记录；审计与状态一致。
- 后端拒绝变更、429/503、请求超时、重复提交时，前端能正确呈现状态，避免重复发码、重复权益授予或错误地显示成功。
- 浏览器构建产物和请求中不得包含 `service_role` / secret key、支付密钥或 R2 长期凭据；敏感 API 不允许只靠隐藏按钮实现保护。
- 不展示来自独立 SaaS 的私有项目/文件作为默认平台管理员权限。

**待实际实施前确认**：D3-UI 已把页面/推荐路由/字段/导航文本线框、仅首次创建响应内复制/下载明文的流程和 UI 测试方案细化；**尚需用户最终视觉确认及真实开发实现**，包括 `ra-supabase` 适配版本、MFA 恢复运维责任、100/批候选上限、Cloudflare Pages 站点/域名等。**管理员 `aal2`、读走 RLS、写走受保护 RPC、不得事后导出码明文均非待定项**。完成页面设计并不等于 Admin 前端 MVP 可运行。

## 相关架构

- [应用层索引](./README.md)
- [技术栈与部署承载](../infrastructure/tech-stack.md)
- [平台管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)
- [成员生命周期](../domains/membership-lifecycle.md)
- [公共 API 与 SaaS 接入](../backend/public-api-and-saas-integration.md)
- [公共 API 契约与 MVP 验收](../backend/api-contract-and-mvp-acceptance.md)
- [前端开发规范与官方参考](../../development/frontend/README.md)
