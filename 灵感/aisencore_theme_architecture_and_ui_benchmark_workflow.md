# AisenCore 前端换肤架构、AI 编码铁律与“单文件交互基准”开发总流程规范

> **文档用途**：本文将我们讨论确立的两大核心工程方法论——**① 基于 `react-admin` 的零成本无损换肤架构与编码铁律**、**② 为什么采用“单文件可交互 HTML（UI-G0A）”替代静态图/Figma/重型脚手架作为标准开发前置关口**——整理为可落地的架构设计与开发流程规范。
>
> **如何使用本文档**：本文按你仓库现有的四层文档体系（`AGENTS.md`、`docs/architecture/`、`docs/development/`、`docs/Plans/`）做好了拆分设计。你可以直接将对应章节复制粘贴到项目对应文件中。

## 一、 核心认知总结与文件落位建议

### 1.1 为什么“单文件可交互 HTML 基准页”比静态图片、Figma 和真实工程原型都好？

在 AI 辅助的单人全栈开发中，传统前端设计流程往往卡在两个极端：要么画**静态图**（看不出交互逻辑，上线后发现操作别扭），要么直接写**真实 React 工程**（搭环境、配路由、调类型极其笨重，改一个布局牵一发全身）。我们采用的 **“单文件可交互 HTML 基准页（Single-File Interactive Benchmark）”** 恰好解决了这个矛盾：

| 对比维度 | 方案 1：静态图片 (PNG/JPG) | 方案 2：Figma 传统设计稿 | 方案 3：直接写 React-admin 真实工程 | **方案 4：单文件可交互 HTML 基准页（推荐标准）** |
| :--- | :--- | :--- | :--- | :--- |
| **主要痛点** | **死图点不动**：看不出弹窗联动、状态切换、窄屏横滚，只能看个大概配色 | **维护重且与代码割裂**：要做真实字段联动（如顺延天数算日期）需极复杂的 Figma 变量连线，且 AI 读图转代码会有二次失真 | **试错成本太高**：需装包、起服务、配 TypeScript 和 DataProvider，想对比两套布局或改交互非常繁琐 | **零环境依赖 + 真交互 + 真数据契约**：1 个文件双击即开，既有真实业务交互，又能一键切皮肤和断点 |
| **能否测“操作顺手度”** | ❌ 不能，无法点击弹窗与Tab | ⚠️ 仅限简单连线，难模拟复杂业务状态 | ✅ 能，但修改极其缓慢 | **✅ 完美支持**：真实点击发码明文盒、三态直授切换、客诉场景切换 |
| **能否携带真实后端字段与业务规则** | ❌ 极易出现假数据（Lorem ipsum） | ⚠️ 靠人工手敲文本，易与数据库脱节 | ✅ 能，但前期写死后难改 | **✅ 100% 绑定**：直接内嵌真实 RPC 字段（如 `effective_ends_at`、`pre_suspend_status`）与 62 条 UX 规则 |
| **能否同屏秒切多套皮肤与响应式断点** | ❌ 每换一套风格要重画一张图 | ⚠️ 需配置复杂 Token Variable Modes | ⚠️ 需改代码编译刷新 | **✅ 顶栏一键秒切**：同屏切换 4 套官方主题 + 1440/1280/820/375px 四档视口 |
| **AI 转正式代码的准确度** | 低（靠视觉猜测组件） | 中（需 MCP 或截图解析） | 高（但前期返工多） | **极高（零失真）**：AI 直接读取 HTML 内的 CSS 变量生成 `theme.ts`，读取 DOM 结构映射为 `<Datagrid>` / `<SimpleForm>` |

> **关于 Figma 的结论**：对于多人专职 UI 团队，Figma 是协作标准；但对于你現在の **“单人架构师 + AI 编码”** 模式，**单文件可交互 HTML 就是你的“活体 Figma”**——它不仅能当视觉设计稿看，还能当交互原型点、当响应式测试器缩、当签收单存档，而且 AI 生成和修改它只需要几秒钟，完全不需要你去学复杂的 Figma 自动布局与变量系统。

### 1.2 建议放入项目各文件的拆分地图

为了符合你仓库 `docs/development/README.md` 中定义的“各目录职责分离”原则，建议将以下内容分别放入 3 个核心位置（无需改动 `spec/requirements.md`，因为这属于架构与工程实现方法，不属于新增产品业务需求）：

| 目标文件路径 | 放入内容 | 为什么放这里 |
| :--- | :--- | :--- |
| **1. `AGENTS.md`**（根目录） | **《AI 前端开发四条铁律》**（组件零手写、样式零硬编码、单文件基准先行、安全不靠前端隐藏） | AI 每次对话必读的第一入口。放最简练的红线，防止 AI 以后写代码时偷偷手写 CSS 或自己造表格组件，破坏一秒换肤能力。 |
| **2. `docs/architecture/applications/admin-ui-design-system.md`** | **《基于 React-admin 主题引擎的无损换肤架构与 UI-G0A 单文件基准规范》** | 这里是 L0~L2 视觉与组件唯一权威。用来解释“为什么能一秒换肤”、“4 套官方预设主题如何选”以及“UI-G0A 单文件交互基准的验收标准”。 |
| **3. `docs/development/frontend/README.md`**（或 `admin-design-guide.md`） | **《AisenCore 标准五步开发工作流与主题解耦编码规范（正反例对照）》** | 这里是开发实操指南。指导“先写架构契约 → 再出单文件 HTML 基准 → 签收后写 `theme.ts` 与胶水层 → 最后拼装页面”的标准流程及代码写法。 |

## 二、 放入根目录 `AGENTS.md` 的内容（可直接复制替换）

将根目录 `AGENTS.md` 从原来的 2 条扩充为以下 5 条核心铁律，专门约束 AI 助手的行为边界：

```markdown
已经放入
```

## 三、 放入 `docs/architecture/applications/admin-ui-design-system.md` 的内容

建议将该文档的第 1~2 节补充/更新为以下架构说明，明确 **“为什么我们的架构支持随心所欲换皮肤”** 以及 **“UI-G0A 单文件交互基准页的架构地位”**：

```markdown
## 1.5 基于 React-admin 主题引擎的“无损换肤”架构原理

AisenCore Admin 采用 **“业务组件骨架与视觉主题 Token 100% 解耦”** 的架构设计。

### （1）为什么可以“改一行代码换掉全站皮肤”？
在 `react-admin` + `@mui/material` 体系中，所有内置组件（`<Datagrid>`、`<SimpleForm>`、`<Button>`、`<Chip>`、`<Dialog>`、`<AppBar>`、`<Menu>`）内部均不包含写死的色值或尺寸，而是通过 React Context 实时读取注入到顶层 `<Admin theme={...} darkTheme={...}>` 的主题配置对象。

因此，AisenCore Admin 的视觉控制被严格收拢在唯一的 `apps/admin/src/theme.ts` 文件中，支持三个层级的零成本换肤：

| 换肤层级 | 适用场景 | 实现方式（无需修改任何业务页面代码） |
| :--- | :--- | :--- |
| **L1：整套预设皮肤直接切换** | 想要彻底改变视觉气质（如从现代立体风切换为极客紧凑风或极简黑白风） | 直接在 `App.tsx` 中导入 `react-admin` 官方内置主题：`radiantLightTheme`（明快现代立体风，默认推荐）、`defaultLightTheme`（清爽紧凑细边框风）、`nanoLightTheme`（极致高密度极客风）、`houseLightTheme`（柔和圆润风）、`bwLightTheme`（高对比黑白风）。 |
| **L2：运行时右上角一键换肤 / 亮暗切换** | 管理员希望白天用亮色立体风、夜间切暗黑模式，或在网页上直接点选不同预设皮肤 | 向 `<Admin>` 同时传入 `theme` 与 `darkTheme`（如 `radiantDarkTheme`），并在顶栏 `<AppBar>` 中放置官方内置的 `<ToggleThemeButton />` 或 `<ThemeSwapper />` 组件。 |
| **L3：基于预设皮肤做品牌微调** | 保留 `radiantLightTheme` 的立体阴影与圆角，但微调主色、圆角或表格默认行高 | 在 `theme.ts` 中使用 `deepmerge(radiantLightTheme, { palette: { primary: { main: '#4F46E5' } }, shape: { borderRadius: 12 } })` 覆盖少量 Token。 |

### （2）UI-G0A 单文件可交互 HTML 视觉基准工作台的定位
为避免“静态设计图看不出交互缺陷”与“直接写 React 工程修改成本过高”的两难问题，`UI-G0A` 阶段统一采用 **单文件自包含可交互 HTML 基准工作台（`aisencore_admin_ui_g0a_benchmark.html`）** 作为正式编码前的唯一签收载体：
1. **第一职责：测交互与防呆顺手度（70% 权重）**——验证顶栏产品上下文切换器、左侧双层导航分区、用户 360° 一屏诊断、发码一次性明文弹窗与 `UNKNOWN` 恢复横幅、套餐冻结克隆、人工直授三态互斥表单是否顺手无歧义。
2. **第二职责：测响应式与多皮肤参数（30% 权重）**——在单文件内通过 CSS 变量模拟 `radiantTheme` / `slate` / `nanoTheme` / `darkTheme` 四套皮肤及 `1440px / 1280px / 820px / 375px` 四档视口，确认无横向溢出与排版崩坏后，一键导出 `UI-G0A APPROVED` 签收记录。
```

## 四、 放入 `docs/development/frontend/README.md` 的内容（标准开发总流程与编码红线）

建议将以下章节加入 `docs/development/frontend/README.md`（或作为独立的 `docs/development/frontend/workflow-and-theming-rules.md`），作为你后续推进 MVP 及未来新产品开发的**标准作业程序（SOP）**：

```markdown
## AisenCore 前端与全栈标准五步开发总流程（SOP）

为了兼顾“架构严谨性”、“交互顺手度”与“极速开发”，所有后台模块及新功能的开发严格遵循以下五步法，绝不跳步：

### 第一步：锁定后端契约与数据库不变量（Database & RPC Contract First）
- 先明确表结构、状态机、锁顺序（`L0~L7`）及受保护 RPC 的入参/出参结构（如 `check_access`、`admin_create_codes`、`admin_grant_entitlement`）。
- **产出物**：SQL Migration 与 API 契约文档（确保前端字段名 100% 来源于真实后端契约，杜绝臆造字段）。

### 第二步：生成或更新“单文件可交互 HTML 基准页”（UI-G0A Interactive Benchmark）
- **不装任何前端包、不写 React 工程代码**，先用 1 个自包含的 `.html` 文件把核心业务页面、弹窗、异常状态（401/403/409/429/503/UNKNOWN）、四档响应式断点（1440/1280/820/375px）和候选主题皮肤全部跑通。
- 项目所有者在浏览器中亲自点击体验：
  1. 菜单分区清不清楚？高危操作会不会点错？
  2. 客诉排查能不能一屏看全？表单必填项与联动顺不顺手？
  3. 顶栏切换几套预设皮肤（如 `radiantTheme` vs `nanoTheme`），哪套最顺眼？
- **产出物**：经交互确认的 `aisencore_admin_ui_g0a_benchmark.html` 与 `UI-G0A APPROVED` 签收单。

### 第三步：编写唯一主题文件 `theme.ts` 与 Provider 胶水层（Infrastructure Glue）
- 初始化极简 Vite + TypeScript + `react-admin` + `ra-supabase` 工程。
- 编写 3 个核心底层文件（占全站自定义代码的 80%）：
  1. `src/theme.ts`：导入在第二步中看中的 `react-admin` 官方主题（如 `radiantLightTheme` / `radiantDarkTheme`），集中配置全局色彩、圆角与表格密度。
  2. `src/authProvider.ts`：基于 `supabaseAuthProvider` 挂载 TOTP `aal2` 门禁与 `admin_check_access` 校验。
  3. `src/dataProvider.ts`：将写操作路由至 `admin_*` RPC，并将 `getMany('users')` 路由至 `admin_lookup_users` 批量邮箱查询 RPC。

### 第四步：100% 复用 `react-admin` 标准组件拼装业务页（Zero-Handwritten-UI Assembly）
- 按照第二步 HTML 基准页确认的字段与布局，直接使用 `<List>`、`<Datagrid>`、`<ReferenceField>`、`<Show>`、`<TabbedShowLayout>`、`<ReferenceManyField>`、`<SimpleForm>`、`<FormDataConsumer>`、`<Confirm>` 拼装页面。
- **每个业务页面文件保持在 80~150 行纯声明式配置代码以内**，不写任何 CSS 样式表。

### 第五步：运行态多视口与安全回归验收（UI-G3 Runtime Verification）
- 在真实浏览器下连接本地或测试 Supabase 实例，核验 `aal1` 拦截、发码一次性明文销毁、跨表邮箱 1 次 RPC 聚合、多视口无溢出，完成上线前闭环。

## 保持“随时一秒换肤”的编码红线（正反例对照）

为了让项目永远保持“改一行 `theme.ts` 就能切换全站亮暗与皮肤风格”的能力，编写 `apps/admin` 代码时必须遵守以下正反例规范：

### 规则 1：严禁硬编码背景色、文字色与边框色（否则切暗黑模式或换肤必崩）
- ❌ **错误写法（写死十六进制颜色，切到暗黑模式或换皮肤时变成刺眼白块）**：
  ```tsx
  <Box style={{ backgroundColor: '#EFF6FF', color: '#1E3A8A', border: '1px solid #BFDBFE', padding: '12px', borderRadius: '6px' }}>
    当前默认 Free 版本：free_v1
  </Box>
```
- ✅ **正确写法（直接复用 MUI `<Alert>` 或使用主题语义变量 ` bgcolor="action.hover"`）**：
  ```tsx
  <Alert severity="info" variant="outlined">
    当前默认 Free 版本：free_v1
  </Alert>
  ```

### 规则 2：状态展示一律使用语义化 `<Chip>`，严禁手写 `<span>` 样式
- ❌ **错误写法**：
  ```tsx
  <span className="my-custom-green-badge">Active</span>
  ```
- ✅ **正确写法（复用 `react-admin` 的 `<ChipField>` 或 MUI `<Chip color="success" />`，随主题自动变圆角与配色）**：
  ```tsx
  <Chip label="✓ Active 正常" color="success" size="small" variant="outlined" />
  ```

### 规则 3：危险操作分级统一使用语义色 `warning` vs `error`
- **单产品级限制动作**（如暂停用户在 Aisenlens 的成员资格、撤销单个兑换码批次）：按钮与 `<Confirm>` 弹窗统一传 `color="warning"`。
- **全平台跨产品熔断动作**（如封禁平台账号 `admin_block_account`、撤销平台管理员）：按钮与 `<Confirm>` 弹窗统一传 `color="error"`。

### 规则 4：间距与圆角一律走主题比例，不写死像素值
- ❌ **错误写法**：`sx={{ marginBottom: '18px', borderRadius: '10px', padding: '16px 20px' }}`
- ✅ **正确写法**：`sx={{ mb: 2, p: 2.5 }}`（自动乘以当前主题的 `spacing` 基数；圆角直接由 `<Card>` / `<Paper>` 从 `theme.shape.borderRadius` 自动继承）。
```
