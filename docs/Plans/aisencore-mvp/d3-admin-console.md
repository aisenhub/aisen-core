# 阶段 D3 执行计划：React-admin 正式管理前端、单一 MUI Theme 与高危动作恢复

- **阶段代号**：`PHASE-D3`
- **新三阶段归属**：D3 是 **技术工作流编号**，不是新交付“第三阶段”。本 Admin 正式前端的**所有可独立完成的业务模块、交互表格、异常状态、原创八维视觉、WCAG 2.2 AA、响应式、性能/代码拆分及所有者签收都必须在新第一阶段完成**，且在 AisenLens 本地环境对接之前达成。第二阶段只承接真实本地业务联调，第三阶段负责部署端复验。权威见 [三阶段交付总则](./three-stage-delivery-gates.md)。
- **最新体验专项执行计划（持续实施，整体尚未签收）**：[D3 Admin 高标准前端完备化｜功能缺口、原创视觉、测试数据、UX-0～UX-7 与八维验收](./d3-admin-experience-upgrade.md)。此文件仅细化本 D3 阶段的产品体验工作，不替代当前需求/安全合同或已存在的 18 项 E2E 验收。
- **当前事实**：2026-10-24 已创建 [`apps/admin/`](../../../apps/admin/README.md) 和 pnpm 工作区，编写 Supabase 客户端、认证/TOTP、公共身份回调、唯一 MUI Theme、只读 RLS DataProvider、Pro 授权/发码/未知结果恢复、受保护管理操作与 10 个业务列表/详情资源。源码边界烟测 [`scripts/test-d3-source-boundaries.mjs`](../../../scripts/test-d3-source-boundaries.mjs) 已执行 PASS（12 个 TypeScript 源模块）；**依赖已安装，typecheck/build/lint 和未认证 Chrome 登录页实测 PASS；但完整认证浏览器 E2E 与视觉签收仍未验证，不能记为 D3 阶段完成**。
- **前置依赖**：可在 D2 接口稳定后准备脚手架/主题；正式管理读写与验收必须等待所需 RPC、JWT、MFA 安全用例通过。
- **权威依据**：
  - [根目录开发约束 `AGENTS.md`（规则 1, 2, 3, 4, 5）](../../../AGENTS.md)
  - [AisenCore 内部 Admin 管理前端架构](../../architecture/applications/admin-console.md)
  - [Admin 统一 Theme 与通用 UI 质量规范](../../architecture/applications/admin-ui-design-system.md)
  - [Admin 前端开发总纲（React-admin / MUI）](../../development/frontend/admin-design-guide.md)
  - [62 条结构化 UX 规则 `admin-design-rules.json`](../../development/frontend/admin-design-rules.json)
  - [Admin 原型验证与 AI 开发工作流](../../development/frontend/interaction-benchmark-workflow.md)

---

## 1. 阶段边界声明（Scope & Hard Boundaries）

### 1.1 准入条件（Entry Gate）
- D1/D2 的接口合同已足够稳定；可先建前端基础工程，但真正业务写入、授权与阶段准出以相应 D1/D2 的真实 HTTP 和安全测试通过为条件。
- 已阅读并对齐 `docs/development/frontend/admin-design-rules.json` 中的适用规则。

### 1.2 本阶段必须完成的交付范围（In-Scope）
1. **初始化正式 React-admin 前端工程**：采用 `pnpm (>= 12)` + `Vite` + `React` + `TypeScript` + `react-admin` (`ra-core` / `ra-ui-materialui`) + `@mui/material` + `@supabase/supabase-js`。
2. **单一全局主题（`src/theme.ts`）**：集中管理配色（语义色，WCAG AA ≥ 4.5:1 对比度）、中英文混排字体栈、间距、圆角与组件默认属性；支持清晰的信息层级与留白，业务页面零硬编码品牌 HEX。
3. **实现 MFA 感知的 `authProvider.ts`**：
   - 登录 → 检查是否已注册 TOTP 因子 → 未注册则引导 Enroll 绑定二维码/秘钥，已注册则引导输入 6 位 TOTP 完成 `challengeAndVerify` 升级至 `aal2` → 调用 `admin_check_access` 确认有效管理员资格。
   - 短期缓存 `checkAuth/canAccess` 导航资格（避免每次点击菜单都发 `getUser()` + RPC），遇到 `401`/`403` 或 JWT `aal` 降级时立即清除缓存并阻断界面。
   - 登出显式使用 `signOut({ scope: 'local' })` 并清理当前标签页敏感状态。
4. **实现安全合规的 `dataProvider.ts`（A-03 / DEC-06）**：
   - **读路径**：`getList` / `getOne` / `getMany` / `getManyReference` 走 PostgREST + 管理员 RLS（自动携带 `Prefer: count=exact` 获取分页总数）。
   - **虚拟 `users` Resource**：`getMany(ids)` 与 `getList` 调用 D2 验证通过的 `admin_lookup_users`（批量补全成员/授权/核销列表中的用户邮箱，消除 N+1；查询失败优雅降级显示 UUID，未完整扫描显式提示 `search_incomplete`）。
   - **写路径**：严禁直接对业务表发起 PostgREST `INSERT/PATCH/DELETE`！产品创建/状态变更、成员暂停/恢复、Pro 直授/撤销、兑换码批量生成/撤销、全局账号封禁/解封、管理员授权/撤权全部映射至 D1 的单事务受保护 RPC。
5. **实现核心业务管理模块与高危恢复流**：
   - **全平台治理视角 vs. 单产品运营上下文切换**（可参考 V6 原型交互逻辑，但使用标准 React-admin Layout/AppBar/Menu 与 MUI 组件实现，不照搬原型 DOM/CSS）。
   - **产品管理（`products`）**：列表、新建产品、切换运行状态（`draft` / `active` / `suspended`，明确告知暂停产品不批量修改成员状态）。
   - **成员与用户管理（`memberships` / `users`）**：跨产品/单产品成员筛选、用户 360° 抽屉/详情页（展示派生的 `Free`/`Pro` 状态、有效时段、历史事件）、暂停成员与恢复成员（忠实还原 `pre_suspend_status`，`left → suspended → left` 绝不误显为重新加入）。
   - **Pro 授权管理（`grants`）**：列表与筛选、人工直授表单（严格互斥切换 `固定天数顺延 duration` vs. `显式起止时间/永久 explicit_window`，带客户端 `request_id` 幂等保护）、撤销 Grant 确认弹窗（`<Confirm>`）。
   - **自有兑换码管理（`code-batches` / `codes` / `redemptions`）**：
     - 批量发码表单（固定 Pro，可选 30 天 / 365 天预设或自定义正天数、单码次数、码到期日、数量上限）。
     - **首响明文易失展示**：首次成功响应的明文码仅保存在当前组件 React 内存 state 中供一键复制/下载 CSV/TXT，提供醒目“离开或刷新后不可再次查看”警示；**严禁写入 TanStack Query cache、`localStorage`、`sessionStorage`、URL 或控制台日志**。
     - **网络超时 / `UNKNOWN` 安全恢复闭环**：提交前在 `sessionStorage` 仅暂存非秘密的 `{ request_id, product_id, quantity, grant_duration_days, created_at }`；若请求超时或中断，引导管理员按原 `request_id` 查询批次是否已落库；若已落库但明文丢失，提供**两步独立确认操作**（第一步确认撤销旧批次 `admin_revoke_batch`，第二步以新 `request_id` 重新发码），绝不自动串联两次危险写。
   - **平台管理员与账号限制（`admins` / `restrictions`）及审计日志（`audit-logs` / `membership-events`）**：处理 M1 最后一名合格管理员冲突（`409 STATE_CONFLICT`）友好提示；只读脱敏审计列表。
   - **最小认证辅助页**：`/auth/confirm` 与 `/auth/reset-password`（支持桌面端 AisenLens 用户在手机/任意浏览器点击邮件链接完成验证后提示返回客户端）。

### 1.3 严禁越界行为（Hard Out-of-Scope）
- **严禁**引入 Tailwind CSS、Ant Design、shadcn/ui、Redux、Zustand、自定义手写表格或独立路由框架。
- **严禁**在 Admin 中添加“Free/Pro 功能开关配置”、“业务额度编辑”、“套餐版本克隆（`pro_v2`）”或未批准服务端合同的“用户反馈收件箱后端写入”。
- **严禁**在前端代码或 Vite `VITE_*` 环境变量中配置 `service_role` key、数据库直连密码或 R2 Secret Key。

---

## 2. 详细技术设计与实施子任务（Milestones & Tasks）

### Milestone D3-M1：工程脚手架、唯一 MUI Theme 与 Provider 基础层

**实施进展（NOT ACCEPTED）**：Vite React TS 目录及根 `package.json`/`pnpm-workspace.yaml` 已建立，MUI Theme、Supabase Auth 与初版只读 DataProvider/受保护 RPC 适配已写入源码。依赖安装已成功，`pnpm typecheck/build/lint` 已成功退出；锁文件 frozen install PASS，`pnpm audit --prod` 固定修复 transitive 包后 0 已知漏洞。

1. **目录与依赖初始化**：
   - 唯一创建 `apps/admin/`，按[仓库目录规范](../../architecture/infrastructure/repository-structure.md)建立 pnpm workspace 和真实 `pnpm-lock.yaml`，配置 `vite.config.ts`、`tsconfig.json`。
   - 安装核心依赖：`react`, `react-dom`, `react-admin`, `ra-ui-materialui`, `ra-core`, `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`, `@supabase/supabase-js`。
2. **编写 `src/theme.ts`**：
   - 定义干净、克制、高对比度的企业级 B2B 管理后台主题（中文优先排版 `'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif`，等宽字体用于 UUID/兑换码前缀/时间戳）。
   - 统一配置 `MuiButton`, `MuiTableCell`, `MuiChip`, `MuiDialog`, `MuiTextField` 的默认尺寸与焦点可见环（`:focus-visible`），确保无需在业务页面写零碎样式。
3. **编写 `src/supabaseClient.ts`、`src/authProvider.ts` 与 `src/dataProvider.ts`**：
   - 封装統一 RPC 调用器 `callRpc(name, params)`，统一解析 PostgREST HTTP 错误与 `CheckAccess`/`RedeemCode` 结构化响应，将 `STATE_CONFLICT`、`ADMIN_REQUIRED`、`RATE_LIMITED` 等转换为清晰的中文可操作反馈。

---

### Milestone D3-M2：TOTP MFA 登录页与安全壳层（Layout / Scope Switcher）

**实施进展（NOT ACCEPTED）**：登录页对接官方 `signInWithPassword` / `mfa.listFactors` / `enroll` / `challengeAndVerify`，AAL2 后用 `admin_check_access` 二次验证；AppBar 通过 RA useStore 保存当前产品过滤范围。真实 Chrome 登录页 DOM 烟测已 PASS（使用假的公开测试 key，未进行管理员账号登录）；焦点/移动端与实际管理员完整会话未验收。

1. **自定义登录与 MFA 挑战视图（`src/pages/LoginPage.tsx`）**：
   - 第一步：邮箱 + 密码登录。
   - 第二步：检查 `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`：
     - 若 `currentLevel !== 'aal2'` 且无 `verified` TOTP 因子 → 展示首次 TOTP 绑定界面（二维码 + 秘钥文本 + 验证码输入框）。
     - 若已有 `verified` TOTP 因子 → 展示 6 位 TOTP 验证码输入界面。
   - 第三步：验证成功后调用 `admin_check_access()`；若非有效管理员，明确展示“当前账号无平台管理权限”并提供安全退出按钮。
2. **顶栏与作用域导航（`src/layout/AppLayout.tsx`）**：
   - 使用 React-admin `<Layout>` + `<AppBar>` + `<Menu>`，支持在“全平台治理”与“单产品运营空间（按当前选中产品过滤成员、Grant、兑换码、审计）”之间切换，且 URL/筛选状态清晰同步。

---

### Milestone D3-M3：六大核心 Resource 页面与高危交互实现

**实施进展（NOT ACCEPTED）**：已用 React-admin List/Datagrid/Show/Create 实现产品、成员、Grant、批次/安全码、核销、管理员/限制、审计与成员事件列表；提供受保护的 Pro 直授、账号管理和兑换码首响组件，UNKNOWN 保存非秘密请求元数据并提供独立批次核查/撤销/以原 request_id 重试。仍需要完整浏览器 E2E、安全审计、错误路径与视觉签收，禁止将静态源码或离线原型当生产可用。

1. **`products` Resource**：`<List>` + `<Datagrid>`、新建弹窗、状态切换确认按钮（带原因输入）。
2. **`memberships` Resource & 用户 360° 详情**：
   - 使用 `<ReferenceField source="user_id" reference="users">` 自动批量调用 `dataProvider.getMany('users', ...)` 补全邮箱。
   - 状态徽章明确区分产品成员 `active` / `left` / `suspended` 与平台账号 `blocked`（绝不混同）。
   - 暂停/恢复动作使用带必填 `reason` 的确认对话框，成功后精确刷新行数据与事件列表。
3. **`grants` Resource（Pro 直授与撤销）**：
   - `<Create>` 表单使用 `React Hook Form` 监听 `grant_mode`：选择 `duration` 时只渲染正整数天数输入与快捷预设（30天 / 365天）；选择 `explicit_window` 时渲染开始时间与“显式永久（`ends_at = NULL`）”开关或结束时间选择器。
   - 组件挂载时生成唯一 `request_id = crypto.randomUUID()`，防止网络抖动点击两次产生双倍授权。
4. **`codes` & `code-batches` Resource（批量发码、一次性明文与 UNKNOWN 恢复）**：
   - 发码成功弹窗：仅用组件局部 `useState<string[] | null>` 持有明文码列表，提供“复制全部”与“下载 `.txt`/`.csv`”按钮；关闭弹窗前要求管理员勾选或确认“我已妥善保存明文码”，关闭后立即 `setPlaintextCodes(null)`。
   - `UNKNOWN` 恢复横幅：检测 `sessionStorage` 中未完成的发码请求，点击“核查批次状态”调用只读查询；若已生成批次，展示批次详情并提供独立的“撤销该批次”按钮与“重新发起新批次”按钮。
5. **`admins`、`restrictions` 与 `audit-logs` Resource**：
   - 全局封禁/解封、管理员增删（触发 M1 保底冲突时展示服务端 `STATE_CONFLICT` 原因并刷新列表）。
   - 审计日志与成员事件采用只读 `<List>` + `<Datagrid>`，支持按操作类型、目标 UUID、操作人筛选，展开查看 `before` / `after` JSON 差异。

---

### Milestone D3-M4：真实浏览器 E2E、无障碍与安全扫描（D3-UI-X01 ~ X18）

使用 Playwright（或真实无头浏览器脚本）连接本地完整 Supabase 栈与 Vite 预览服务器，逐项实测并留存截图/日志证据：

- 验证 `D3-UI-X01` ~ `X18` 全部 18 项行为指标：
  - 未登录 / `aal1` 访问任意管理路由均被拦截（`X03`）；
  - `aal2` 会话内连续切换列表、翻页、打开详情，抓包确认 `auth/v1/user` 或 `mfa` 额外请求数为 0（`X04`）；
  - 检查浏览器持久化存储、应用缓存、URL、控制台/服务端日志、重复查询接口不存在明文或 `code_hash`；首次响应在开发者工具 Network 面板可见是必要事实，不得承诺删除浏览器网络历史；敏感响应应验证 `Cache-Control: no-store` 等可行措施（`X12`, `X14`）；
  - 模拟发码请求超时进入 `UNKNOWN` 状态，验证先查状态、分步撤销与重发闭环（`X13`）；
  - 键盘 `Tab` / `Enter` / `Escape` 焦点导航、表单错误关联、1280px/1440px/移动端窄屏响应式与对比度检查（`X01`, `X17`）；
  - 扫描 `apps/admin/dist/` 构建产物，确认零 `service_role` 或私密凭证泄露（`X18`）。

---

### D3 正式工程和秘密处理

- 前端代码唯一位于 `apps/admin/`，按 `src/app/`、`src/auth/`、`src/data/`、`src/resources/`、`src/types/` 等实际职责分组；不预建 `packages/admin` 或另一个根目录前端工程。锁文件在安装依赖时生成并提交，pnpm 程序仍只约束最低兼容版本。
- 首响明文仅当前响应与组件易失内存可以接触；刷新/重进不得重新获取，严禁缓存/持久化/日志泄露。首次 Network 响应对该会话可见是正常浏览器行为，并非测试失败。
- 正式 Auth 确认/重置密码路由由 `apps/admin/` 承载；单独验证 URL 参数、开放重定向、桌面与 SaaS 回跳。V6 只用于交互参考，不算生产安全与视觉签收。

## 3. 阶段 D3 退出门禁清单（Exit Gate Checklist）

- [x] `pnpm typecheck/build/lint/install --frozen-lockfile/audit --prod` 与 `dist/` 静态密钥扫描通过；Vite 8 按依赖分包最大约 428 KB，无原先的 500 KB 单包警告。
- [ ] 真实浏览器 E2E 测试覆盖 `D3-UI-X01` ~ `D3-UI-X18` 全部 18 项用例并取得 PASS 证据（不能用 V6 HTML 离线原型的模拟结果代替）。
- [ ] 向项目所有者展示真实 React-admin 页面截图/预览并获得正式视觉与交互评审确认。
- [x] 同步更新 `docs/Plans/aisencore-mvp/d3-admin-console.md` 验证记录与 `docs/Plans/TODO.md`，完整安全/视觉/发布门禁保持未完成。


---

## 4. 验证记录（Verification Log）

| 日期 | 命令或场景 | 退出码/结果 | 范围与限制 |
| --- | --- | --- | --- |
| 2026-10-24 | `docs/interaction-benchmarks/aisencore-mvp-interaction-lab.html`（V6 离线原型） | 28 项本地内存模型检查 | **仅作离线交互参考**，不连接真实后端，UI-G0A 视觉未签收，不计入正式代码 PASS |
| 2026-10-24 | `pnpm typecheck`、`pnpm build`、`pnpm lint` | `0` / **PASS** | React-admin 5 + MUI 9/Vite 8/TS6，构建 2324 模块；大于 500KB 的 JS 警告未解决，不等于浏览器 E2E |
| 2026-10-24 | `pnpm install --frozen-lockfile`、`pnpm audit --prod` | `0` / **PASS** | 锁文件可复现；已通过 pnpm 受控 override 将已知漏洞依赖 `decode-uri-component` 固定为 0.5.0，当前 0 已知生产依赖漏洞 |
| 2026-10-24 | `node scripts/test-d3-bundle-secrets.mjs` 与 `node scripts/test-d3-browser-smoke.mjs` | `0` / **PASS** | 构建 JS 静态扫描无服务端秘钥或兑换哈希列；真实本地 Chrome 加载未认证登录 DOM；不是实际管理员或安全浏览器 E2E |
| 2026-10-24 | `node scripts/test-d3-missing-config.mjs`，`node scripts/test-d3-browser-smoke.mjs`，`pnpm typecheck`，`pnpm lint`，`pnpm build` | `0` / **PASS** | 修复缺失 `apps/admin/.env.local` 时的白屏：入口先检查公共 Supabase URL/Key，缺失或错误时给出安全配置页；无配置 Chrome 首页和有测试公钥 Chrome 登录页均实测可见。仅 UI 初始化/构建，不等于管理员权限业务 E2E |
| 2026-10-24 | `pnpm run setup:local`、`git check-ignore -v apps/admin/.env.local`、`node scripts/test-d3-browser-smoke.mjs --local` | **PASS** | 从本地正在运行的 AisenCore Supabase status 生成仅含 API URL/Publishable Key 的 git-ignored 配置；重复运行确认一致；Chrome 隔离端口 3395 真实加载了这份配置并显示登录页，不等于已登录管理员 E2E |
| 2026-10-24 | `node scripts/test-d3-source-boundaries.mjs` | `0` / PASS | 12 个 TS/TSX 源模块：MFA、受保护 RPC、禁止直写、码明文内存；这是静态烟雾测试，**非构建、浏览器或权限验收** |
| 2026-10-24 | `pnpm run setup:dev-admin`、真实 GoTrue password grant、`admin_check_access` | **PASS** | 本地开发账号固定 `admin@aisencore.test` / `Admin123456!`，只通过本机验证的 GoTrue API 更新 Auth 密码哈希，不再维护随机凭据文件；实际固定密码登录 PASS，AAL1 仍被管理 RPC 拒绝。首次 TOTP 与完整浏览器管理员业务未验收；固定密码绝不可用于生产环境 |
| 2026-10-24 | `pnpm run seed:admin-demo` ×2 | **PASS** | 仅本机 55321/55322：24 合成 Auth 用户、4 产品/48 成员/26 Grants/3 批次/18 安全码摘要/6 核销/61 成员事件；重复不增长，保留原数据；无真实 SaaS |
| 2026-10-24 | `pnpm typecheck`、`pnpm lint`、`pnpm build`、真实 Chrome 登录 smoke | **PASS** | 第一版 Operator Studio：MUI Theme、分组导航、中文 i18n、真数据 Dashboard、产品页面、用户 360 入口；JS App chunk 仍大于 500KB，非全站签收 |
| 2026-10-24 | `node scripts/test-d3-authenticated-pages.mjs` | **局部 PASS** | 本地临时 GoTrue 账号完整 TOTP AAL2 + admin_check_access，隔离 Chrome 实测 Dashboard、产品页、用户 360、Pro 授权表单、兑换码发行表单，保存 1440px/1000px/390px 证据；真实图像复查修复了 390px 布局被表格撑至 810px 的问题，当前页面宽度与滚动宽度均为 390px。全 18 项 E2E 及八维视觉仍 NOT RUN |
| 2026-10-24 | `pnpm typecheck`/`lint`/`build`，扩展 `node scripts/test-d3-authenticated-pages.mjs` | **局部 PASS** | 10 个原未完成模块统一列表（真实查询、空/错态、筛选、分页、移动卡片）、8 类统一受保护详情、3 类操作表单均已编码；Chrome 真 TOTP/AAL2 逐路由读取、真实邮箱精确搜索、`aisenlens` 范围空态→点击恢复 48 条成员通过。完整危险写入 E2E、全部 WCAG 与视觉签收仍 **NOT RUN** |
| 2026-10-24 | `node scripts/test-d3-authenticated-pages.mjs` + `AISENCORE_UIQA_PREVIEW=1` 正式构建回归 | **局部真实写入 PASS** | 首先通过 GoTrue TOTP 达到 aal2，实际 UI 创建临时草稿产品、填写理由并启用产品、对临时用户授予 30 天 Pro、首次发行 1 条兑换码，验证明文确认清除，查库核对 Admin 审计。所有测试资源以随机 QA 产品 ID/用户 ID 精确清理，未截屏、打印明文码。仍需完整 UI-X01～X18 正负场景 |
| 2026-10-24 | Vite 8 Rolldown 分包 + `pnpm build` + 正式 `vite preview` Chrome 回归 | **PASS（限定范围）** | 从约 944 KB 的单个 Admin chunk 调整至主要 JS 216/308/366/428 KB，当前无 500 KB 单包警告；生产构建的独立 3396 端口上全部列表/详情与上述四个写入链路 PASS。不构成全面性能、WCAG、视觉签收 |
| 2026-10-24 | 长期 demo 数据环境下 `pnpm dlx supabase test db --local`、`python scripts/test-d1-concurrency.py`、`node scripts/test-d2-auth-api-mfa.mjs` | **286/286 pgTAP + 7/7 锁场景 + 真实 HTTP GoTrue/AAL2 PASS** | 修正原测试全库计数假设，保存长期演示数据和固定本地管理员；最后管理员 HTTP 409 的纯空名册前提仍须在另一个隔离实例测，不能改动固定开发管理员制造条件 |
| 2026-10-24 | 最新 `node scripts/test-d3-authenticated-pages.mjs` + production preview | **大范围局部 PASS** | 浏览器真实成员 active/left 暂停恢复、产品创建启停、Pro/码撤销、平台封禁/解封、管理员授予撤权、旧 JWT 服务端拒绝、UTF-8 TXT/CSV、UNKNOWN、实际 Chrome HTTP 503/429 注入（发现并修复 429 状态码丢失）与原 ID 安全重试、30 组响应式和 Tab/Escape、安全明文/哈希检查、严格 QA 清理；**不等于 WCAG/全部 18 项完成** |
| **待补齐** | D3-UI-X01～X18 完整合同、视觉与生产门禁 | **部分覆盖** | [逐项验收矩阵](./d3-acceptance-matrix.md) 明确通过/局部/未测；仍含生产规模 DEC-06、真实 429/断网和部分身份恢复，WCAG、设备/视觉签收与生产发布 |
