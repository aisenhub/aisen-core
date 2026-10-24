# 阶段 D3 执行计划：React-admin 正式管理前端、单一 MUI Theme 与高危动作恢复

- **阶段代号**：`PHASE-D3`
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

- [ ] `pnpm typecheck` 与 `pnpm build` 100% 零报错通过，`dist/` 产物静态密钥扫描通过。
- [ ] 真实浏览器 E2E 测试覆盖 `D3-UI-X01` ~ `D3-UI-X18` 全部 18 项用例并取得 PASS 证据（不能用 V6 HTML 离线原型的模拟结果代替）。
- [ ] 向项目所有者展示真实 React-admin 页面截图/预览并获得正式视觉与交互评审确认。
- [ ] 同步更新 `docs/Plans/aisencore-mvp/d3-admin-console.md` 验证记录与 `docs/Plans/TODO.md`。


---

## 4. 验证记录（Verification Log）

| 日期 | 命令或场景 | 退出码/结果 | 范围与限制 |
| --- | --- | --- | --- |
| 2026-10-24 | `docs/interaction-benchmarks/aisencore-mvp-interaction-lab.html`（V6 离线原型） | 28 项本地内存模型检查 | **仅作离线交互参考**，不连接真实后端，UI-G0A 视觉未签收，不计入正式代码 PASS |
| 待执行 | 正式 React-admin 工程 `pnpm typecheck` & `pnpm build` & 产物密钥扫描 | `NOT RUN` | 须在 D2 退出门禁 100% PASS 后执行 |
| 待执行 | 真实浏览器 E2E（`D3-UI-X01` ~ `D3-UI-X18`）与所有者视觉评审 | `NOT RUN` | 覆盖真实 MFA、首响明文阅后即焚、UNKNOWN 恢复与 WCAG 无障碍 |
