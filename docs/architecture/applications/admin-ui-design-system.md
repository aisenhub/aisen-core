# AisenCore Admin｜全局 UI 设计系统与视觉基线控制规范（UI-G0）

> **权威地位**：AisenCore **Admin Web 专属的全局视觉/布局/组件唯一规范**，支撑 [D3-UI 页面与交互设计](../../Plans/aisencore-mvp-d3-ui-admin-uiux-design.md)。**业务/权限/路由/字段仍遵循 spec、D3、D3-UI、F01～F08**，本文只规范如何视觉一致地呈现，不审批新接口或运营策略。
>
> **双状态（2026-10-22）**：**规范正文 = DRAFT FOR VISUAL APPROVAL（已形成文本设计候选）**；**UI-G0 关口 = NOT APPROVED / BLOCKED**。当前尚无真实高保真基准页面、截图/设计画板及运营者明确签收证据，因此**不得开始正式 Admin 前端页面/主题/布局编码**。**本轮文档静态通过不等于 UI-G0 PASS**。详情及检查见 [UI-G0 设计正文](./admin-ui-design-system.md)。
>
> **技术适用范围**：React-admin + Material UI 的 AisenCore **Admin Web**，默认简体中文、桌面优先、单人运营。Aisenlens 是本地优先独立客户端，可将来复用品牌层，不强制复用此 Web 组件库。正式包版本及 CSS/JS API 以未来锁定的 React-admin/MUI 文档核对。
>
> **开发规则集补充（2026-10-22）**：已从用户提供的临时外部项目设计目录**选择性改编** [Admin 开发设计规范](../../development/frontend/admin-design-guide.md)、[62 条结构化规则](../../development/frontend/admin-design-rules.json)、[字体/布局/组件和页面模式指南](../../development/frontend/admin-design-foundations.md)及[逐页校验矩阵](../../development/frontend/admin-design-verification.md)。**本文件仍是全局 Token/视觉签收唯一权威**；开发规则说明何时、如何使用和核验，不反向将另项目主题、Tailwind/Base UI、历史截图/测试结果变成 Admin 当前事实。规则迁入**不构成**真实高保真参考/用户视觉签收，UI-G0 **仍 NOT APPROVED / BLOCKED**。
>
> **前端规范目录收敛**：上述开发规范均从旧独立目录归并 [`docs/development/frontend/README.md` 统一入口](../../development/frontend/README.md)，原 `admindesign` 已按用户要求移除；没有增加另一套 Token 维护来源、设计运行服务或实际前端代码。

## 1. 四级设计权威和治理原则

| 层级 | 单一来源 | 职责 |
| --- | --- | --- |
| **L0 品牌和设计 Token** | **本文件**（未来代码只映射一个全局 theme） | 色彩语义、Typography、spacing、shape、层级、断点、动效 |
| **L1 全局外壳与共享组件** | 本文件组件合同；实施后一个 Admin Layout/Theme/组件层 | AppBar/Sidebar/内容容器、按钮、输入框、表格、确认框、提示 |
| **L2 页面模板** | 本文件模板合同；[D3-UI](../../Plans/aisencore-mvp-d3-ui-admin-uiux-design.md) 给每页字段/任务 | 列表/详情/创建编辑/登录 MFA/一次性发行结果/错误与空态 |
| **L3 具体业务页面** | [D3-UI 页面规格](../../Plans/aisencore-mvp-d3-ui-admin-uiux-design.md)及可信 API 契约 | 组合共享模板、不得另起一套字体/按钮/间距 |

**禁止视觉漂移**：严禁每页自行声明 `font-family`、主题色十六进制、任意新字号、不同表单边框高度或全局媒体查询；也不允许散落大量未审批的 `sx={{...}}` 魔法数。局部 `sx` 仅限布局组合所需且引用 theme token，特殊例外需在此文件中登记“理由、范围、测试、批准者”，优先抽为共享组件/variant。严禁以复制整个 Material UI 组件源码或自建第二套样式框架绕过此规范。

**扩展前的强制复用审查**：新增普通组件/业务页面时，先按[标准组件与模式](../../development/frontend/admin-design-components-and-patterns.md)核验 React-admin/MUI 是否能直接复用，再组合现有能力或作最小变体，确实缺口才单独批准自研；不允许为了视觉“更高级”另引第二套控件。UI 应避免无必要的次级标签、重复解释与装饰性空态——具体任务与例外依[开发设计规范](../../development/frontend/admin-design-guide.md)。新增 `UX-*` 原则 ID 只用于设计评审，不代替下面的 UI-G0-G01～G12 正式视觉审批证据。

**技术注释**：MUI `createTheme`/ThemeProvider（或当前 React-admin 正式支持的单一 Theme 注入）、`palette/typography/spacing/breakpoints/components.defaultProps/styleOverrides` 为预期实现路径；**本次没有写 TypeScript/CSS**。使用 React-admin 官方 List/Show/Create、DataGrid/List、Layout/Menu、Dialog 等能复用则优先复用，不因换肤重写权限逻辑。

## 2. 全局 Token 规范（当前均为 UI 实施候选，未冻结）

### 2.1 颜色、背景与状态

**品牌视觉候选**：浅色优先、低饱和冷中性色（近白背景/白色卡片）与克制的蓝色主操作。**用户尚未选定品牌色，故不写死 HEX 为最终颜色。** 只有在第 8 节签收后，才能把 token 固化进全局主题。

| Token（语义名） | 预期用途 | 必须遵守 |
| --- | --- | --- |
| `color.primary` / `primaryHover` | 主 CTA、选中菜单、焦点色 | 页面不得另行选择不统一的品牌主色 |
| `color.text.primary/secondary/disabled` | 标题/正文/辅助/禁用态 | 文本对比度经基线验证，不因浅灰过度降低可读性 |
| `color.surface.page/panel/raised` | 页面、卡片/表格、弹层 | 视觉层级由背景/边界/有限阴影呈现，减少重度渐变 |
| `color.border.default/focus` | 分割线、输入框边界、键盘焦点 | 焦点必须可见，不能仅靠颜色 |
| `color.status.success/warning/error/info` | 发码成功、提醒、封禁/撤销/限流和帮助 | 必须配文字与图标，不能只靠颜色区分 |
| `color.action.danger` | 撤销码、封禁、撤管理员资格 | 危险按钮不与默认主按钮使用同色同强调级别 |

**不允许**无后端依据的“绿色代表已支付/永久已保证”或仿造真实统计信息；真实永久仅表示没有自然截止日，仍可撤销或 blocked。

### 2.2 统一字体与字号（候选基线）

字体族用**系统字体栈**，不打包商业字体，不分发字体文件：

`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif`

| 语义 Token | 建议 font-size / 字重 / line-height | 场景 |
| --- | --- | --- |
| `type.pageTitle` | **24px / 600 / 1.35** | 页面一级标题，仅页头一个 |
| `type.sectionTitle` | **20px / 600 / 1.4** | 卡片组/页面主区域标题 |
| `type.panelTitle` | **18px / 600 / 1.4** | Dialog 标题、表单字段组 |
| `type.body` | **14px / 400 / 1.55**（候选舒适阅读可调到 16px） | 表格正文、帮助短句、按钮邻近文本 |
| `type.formLabel` | **14px / 500 / 1.5** | 字段标签与必填状态 |
| `type.caption` | **12～13px / 400 / 1.5** | 时间/ID 注释/帮助，**不可作为重要错误的唯一呈现** |
| `type.button` | **14px / 600 / 1.45** | 操作按钮，不使用全大写转换 |
| `type.data` | **14px / 400 / 1.5** + tabular-nums | 数量、日期、UUID 局部等宽数字 |

固定中文与英文 fallback 同源，字体切换不得造成按钮尺寸跳变；允许浏览器缩放/系统字体放大，**不得禁止系统缩放**。全局标题和正文使用 MUI Typography variant 映射，不允许某页临时使用 `fontSize: 17`、另页 25 等任意魔法数。

### 2.3 统一空间/圆角/边框/阴影

| Token / 规则 | 当前建议 |
| --- | --- |
| `space.unit` | **8px 主基线**；精细紧凑处可使用 **4px 半单位**，统一通过 `theme.spacing()` |
| `space.pageHorizontal` | 宽屏 **24～32px**；中屏 16～24px；窄屏 **16px** |
| `space.cardPadding` | 16～24px，列表/表单模板按 variant 统一 |
| `space.formGap` | 一组字段之间 16px、分组之间 24px（候选） |
| `shape.controlRadius` | **8px**；同尺寸输入/按钮/下拉/工具条 |
| `shape.cardRadius` | **12px**，表格容器/详情卡片统一 |
| `shape.dialogRadius` | **12px**；弹窗边框/阴影主题统一 |
| `border.width` | 1px 标准边界、焦点需专用 outline，危险操作不靠阴影 |
| `elevation` | 主页面通常 0～1，popover/dialog 使用固定层级；不得每卡随机阴影 |
| `icon.size` | 16/20/24px 固定尺寸档位，不在列表里混用多个高度 |

MUI 官方默认 `spacing` 是 8px 比例；实际主题可覆盖，但**UI-G0 一次冻结后所有页面保持同一比例**。<https://mui.com/material-ui/customization/spacing/>

## 3. 唯一全局布局（Admin App Shell）

### 3.1 导航外壳

| 区域 | UI 实施候选 | 校验方式 |
| --- | --- | --- |
| 顶部 `AppBar` | 高 **64px**（紧凑视图可 56px）；左应用名、中部按 D3-UI 许可的面包屑、右环境标记/会话/用户菜单和退出 | 所有页面一致；无 JWT/token/密钥；登录 MFA 页不展示管理员业务 Shell |
| 左侧导航 `Sidebar` | 展开宽 **240px**，可收起；一级分组“工作台/产品与用户/权益运营/安全与审计” | 选中态一致、主项路由/键盘可访问；窄屏变 Drawer |
| 内容容器 `Content` | 最大宽 **1440px**，内部页边距 24～32px，超宽屏限制行长 | 页头、筛选条、表格、表单边缘按同一竖向基线对齐 |
| `PageHeader` | 位置：面包屑 → 24px 一级标题 → 一行辅助说明 → 右侧**一个主要 CTA** | 禁止每页把保存/创建/危险按钮放不同位置 |
| 反馈区域 | 通用 Snackbar/Alert 与局部表单错误 | 成功确认只在真实服务端提交后显示，未知状态不可假报 |

### 3.2 响应式与尺寸断点（保证和 D3-UI 一致）

**业务布局档位**：小屏 `<768px`、中屏 `768～1199px`、宽屏 `≥1200px`；页面设计推荐检验 **1440、1280、820、375、320 px**。实现时可在统一主题中定义这几个自定义断点，或明确使用 MUI 默认 `xs/sm/md/lg/xl`（默认 0/600/900/1200/1536px）映射为一致的业务档位；**禁止页面自己决定“同一尺寸下菜单折叠方式不同”**。

| 档位 | 页面布局与表格 | 操作要求 |
| --- | --- | --- |
| 宽屏 ≥1200px | 240px 左菜单、页头/筛选横排，卡片/表格可多列 | 列按数据重要度设置合理宽度，原表格分页 25/50 条是候选，不盲查全量 |
| 中屏 768～1199px | Sidebar 折叠或改 Drawer（**选一种并于 G0 冻结**），筛选折行，详情 1～2 列 | 操作 CTA 保持可见、不能发生遮盖 |
| 窄屏 <768px | AppBar + 临时 Drawer、详情纵向、筛选折叠、按钮纵向全宽 | 复杂表格**仅表格容器内部允许横向滚动**；不能整页溢出 |
| 极窄 320～375px | 1 列内容，允许辅助信息折叠 | Login/MFA、拒绝/错误、登出等必须完整可操作；过于复杂的批量发码可提示桌面，但后端权限不变 |

### 3.3 数据密度与排版原则

- 统一表格列顺序：关键对象（名称/ID）→ 所属产品/套餐 → 状态 → 时间 → 行尾操作；采用**统一行高、单元格上下边距、表头字号与颜色**。
- 过滤区总在表格上方：标签与表单对齐，右侧一个主要操作、其他控件按统一模板；分页组件统一位置/布局。
- UUID 和超长文本省略**仅影响视觉**，点击/复制仍提供完整合法值；不以长字符串撑破弹窗/列表。
- 例外字段（发行码明文、TOTP secret）**绝不放普通查询列表或普通缓存**；单独的临时敏感结果视图保持纯内存/受控生命周期。

## 4. 共享组件与标准页面模板（禁止每页随意自行实现）

### 4.1 最小共享组件目录（未来编码实现，当前未创建代码）

| 组件/模板 | 统一要求 | 不可破坏的业务/安全规则 |
| --- | --- | --- |
| `AdminLayout`、`AdminPageHeader`、`NavigationGroup` | 统一 AppBar/侧栏/标题/面包屑/主 CTA | 非 `aal2` 不渲染管理资源 |
| `AdminListPage` / `FilterToolbar` / `DataTable` | 统一过滤/空态/加载/分页/排序/状态列与行尾操作 | 安全列白名单、不可私下 `select=*` 或直接写表 |
| `AdminShowPage` / `DetailSection` | 统一信息分组、时间和复制 ID、关联跳转 | 客户端展示的用户身份仅来自允许的 Edge/DB |
| `AdminFormPage` / `FormField` / `FormActions` | labels/说明/校验/取消/确认、未保存离开提醒、禁止双击 | 套餐全字段提交、NULL/default/冻结依原 F05 |
| `PrimaryAction` / `SecondaryAction` / `DangerAction` | 主操作一处、次要操作中性、危险操作需确认 | 最后管理员不可撤、后台写均可信 RPC |
| `ConfirmDangerDialog` | 重述目标/影响/原因、可取消、默认焦点**不在危险按钮** | 禁止“前端确认通过便跳过真实角色校验” |
| `StatusLabel` | 字色+图标+文本固定映射，状态词统一 | blocked/revoked/expired/left 不混淆 |
| `AsyncState` / `AdminNotice` | skeleton/empty/401/403/409/429/503/UNKNOWN 组件 | UNKNOWN 写不能假报成功或新建另一 request_id |
| `MfaEntryTemplate` | 简洁中轴登录/TOTP 页面，不显示管理资源 | 必须真实 `aal2` + 当前 admin 才可进入 |
| `OneTimeCodeResult` | 单独页面局部临时结果，复制/主动下载并提示失效 | 明文不得进 URL、历史、通用 Query 缓存/日志/后补导出 |

共享组件是**设计合同，不是要求额外引入组件库**。优先在 React-admin/MUI 自有组件层封装最少业务差异，不创造第二套 DataGrid/Router/Permission 系统。

### 4.2 全局页面模板分类

- **列表页**：`PageHeader → FilterToolbar → DataTable → Pagination/Empty/Error`，用于产品/成员/套餐/授权/兑换/审计。
- **详情页**：`PageHeader + MetadataSummary + DetailSections + PermittedActions`，用于用户、会员、发码批次等。
- **创建/编辑页**：`PageHeader + 分组 FormField + Sticky/页底 FormActions`，表单布局以套餐冻结规则/产品 RPC 权威为准。
- **登录/MFA 页面**：无 Admin Shell，响应式居中不窄于实际可操作区，状态一致，错误不泄漏用户信息。
- **危险确认页/Dialog**：信息准确、原因字段正确、不可逆提醒、二次确认回显真实对象。
- **一次性明文结果**：仅发行请求第一次成功的**本地临时 UI 状态**；关闭/卸载清理，不设计可重访的明文详情路由。

## 5. 全局可访问性、交互、性能约束

- **验收目标 WCAG 2.2 AA**（目标非已测事实）：文本对比度通常至少 4.5:1，大号文本至少 3:1，关键非文字 UI 边界/状态至少 3:1（按适用情形实测）；不能仅靠颜色表达状态。优先目标约 **44×44 CSS px** 可触控区域，此为体验建议而非把 WCAG 2.2 AA 的最小目标尺寸误写成 44px。
- 键盘 Tab/Shift+Tab 顺序与视觉阅读顺序一致，焦点可见，打开 Dialog 管理焦点并在关闭后返回原触发控件；异步状态用适当 `aria-live`、表单错误关联标签/字段说明。
- **不限制浏览器放大**；检查 200%/400% 缩放与中文、英文、长 UUID 的重排；不能因为表格宽度变长导致页面整体横向溢出。
- 反馈规范：全局 Success 仅在真实提交成功后；`401` 回登录、`403` 清 UI 管理资格、`409` 显冲突、`429` 显退避、`503` 显不可用、写请求超时标 `UNKNOWN`。不得对发码/授权 UNKNOWN 创建不同 request_id 重试。
- **低请求量**：MFA 在建立/降级恢复 `aal2` 时验证；日常表格请求内部 RLS/RPC 判权，不在每次 UI 绘制/导航额外发 `getUser` 或 TOTP challenge。页面组件外观改动不能增加新的后端读取/敏感数据曝光。
- 用户运营资料与秘密严格最小化；Admin 不默认浏览 R2 私有备份、AI 密钥/用户视频；发行码明文首次临时展示与 MFA QR/secret 只在合法临时视图，不进 telemetry/浏览器历史。
- **视觉一致性不能覆盖真实安全检查**：只靠隐藏按钮或样式禁用不构成权限隔离。

## 6. 防漂移和审查制度（未来开发约束）

1. **单一 Theme 来源**：正式 Admin 代码应仅有一套权威 MUI theme/tokens，经 React-admin `Admin theme` / 官方 ThemeProvider 或当前版本推荐方式注入；页面不能重新 `createTheme` 或引入不同的字体/css framework。
2. **统一外壳来源**：`AdminLayout` 管顶部/导航/内容；Resource 页面不渲染自己独立的顶栏/侧栏和根容器。
3. **共享模板强制优先**：新页面优先复用列表/表单/详情/错误/确认模板，仅填业务列和动作；无法复用须记录设计例外并审查。
4. **Theme 变更版本化**：颜色/字号/间距/断点或组件状态变更先更新本文件和视觉参考版本，影响页面逐个审查后再合入；未经用户认可的新视觉方向不得自行替换整体基线。
5. **最小 CSS 例外规则**：允许引用 token 的局部布局 `sx`；禁止大量自定义绝对定位、任意 magic pixel、页面级全局 CSS 覆写、隐藏无障碍信息来“看起来整齐”。
6. **设计/代码一致性测试**：未来 CI/代码审查对主题 token 与共享组件/绕过行为做 lint/静态扫描（工具和规则待实际版本锁定），真正浏览器截图差异及可访问性检查独立执行，不以静态 grep = 视觉已通过。
7. **默认浅色主题**：首版不要求同时开发深色模式；暗色/品牌换肤需求单独决定，并须重新审核语义颜色对比度，不从本规范推断自动批准。

## 7. UI-G0 硬关口：正式 Admin 编码的必要前提

### 7.1 明确阶段与硬阻断

```text
D3 技术/Provider 设计         → 已有文档（不代表前端代码）
D3-UI 页面 IA/线框设计         → 已有文本规格（不代表品牌视觉批准）
          ↓
UI-G0a：统一 Token/布局/组件规范草案       ← 本文件已建立候选
UI-G0b：四类代表性高保真参考页面实物 + 多宽度变体（未制作）
UI-G0c：操作者明确审阅/选择并批准视觉基线（未签收）
          ↓ 只有三项真实全部 PASS 才可签 UI-G0 = APPROVED
**Admin 正式前端编码：Theme/Layout/共享模板/业务页面**
          ↓
UI-G3：逐页面真实浏览器视觉/交互/无障碍、权限 E2E 验收
          ↓
Admin MVP 正式交付
```

**禁止绕过的规则**：**在 UI-G0 尚未 APPROVED 时，不得启动 `apps/admin` 的正式主题、布局、共享组件或业务页面开发，也不得因“已有 D3-UI 文档”“MUI 有默认样式”或“某人已经开始写代码”而把 gate 判为 PASS。** 本门槛**只约束 Admin 前端正式编码**，不自动阻断按独立授权可并行的数据库/非前端后端设计/测试。紧急安全修复的例外必须单独记录批准及回归，不能默默绕过。

### 7.2 视觉批准所需的真实证据

| 必须有的证据 | 要求 | 当前 |
| --- | --- | --- |
| **Token 锁定记录** | 最终字体族/字号、primary/neutral/status 语义配色、表格/表单高度、间距/圆角/断点、浅深色首发、品牌显示名/Logo 策略由用户明确认可 | **NOT APPROVED** |
| **代表性高保真设计画面** | **登录/TOTP、兑换码列表+发行与一次性结果、套餐列表/编辑冻结、用户/成员列表与详情**四类参考；不能用抽象线框冒充高保真 | **NOT CREATED** |
| **宽度覆盖** | 至少每类代表页有 **桌面 1440px 和窄屏 375px** 参考，以及共用 Shell 的 1280、820、320px 重排评估；需实际可见图片/画板/可靠导出 | **NOT CREATED** |
| **组件状态参考** | 主/次/危险按钮、表格/表单、Dialog、loading/empty/error、MFA/一次性明文的正常与错误变体 | **NOT CREATED** |
| **视觉质量检查** | 字体/字号一致、标题/内容对齐、按钮和输入框同高、内容不裁剪/溢出、弹窗和状态可读；有问题清单及解决结论 | **NOT RUN** |
| **用户明确签收** | 项目运营者在真实看到基准设计后明确选中/认可**唯一方案**，留日期、画板/文件引用、版号与决议，不能推断“没反对就是批准” | **NOT APPROVED** |
| **追溯/冻结** | 明确文件/画板版本 ID、审阅日期、参与人、token 版本、例外清单、未解决问题、批准/驳回结论 | **NOT RECORDED** |

**审批记录模板（不得在没有证据时填 PASS）**：

```text
UI-G0 Review ID: [待实际生成]
Global Theme / Token Version: [未冻结]
High-fidelity Reference IDs + version: [尚不存在]
Viewports + states reviewed: [未执行]
Accessibility / overflow findings: [未验证]
Open blockers: [品牌视觉、真实参考、高保真/多宽度、用户确认]
Review owner: [项目所有者，未签收]
Decision: NOT APPROVED
Approved at / confirmation reference: [无]
Release to start apps/admin formal frontend code: NO
```

**最终状态规则**：规范文件完成 = `SPEC PREPARED`；只有用户见到真实视觉稿、作出明确认可且在批准记录中附上可追溯证据 = `UI-G0 APPROVED`。其余情况包括 `NEEDS REVISION`、`BLOCKED`，**都不能启动 Admin 前端正式编码**。

## 8. UI-G0 真实验收矩阵（全部 NOT RUN）

| ID | 待验证内容 | PASS 证据 | 状态 |
| --- | --- | --- | --- |
| **UI-G0-G01** | 单一全局 Token/字体层级/语义颜色和命名规则已统一 | 版本化 Token 清单及用户批准 | NOT RUN |
| **UI-G0-G02** | Layout 统一 AppBar/Sidebar/Header/Content 多页对齐 | 高保真参考及对齐审查记录 | NOT RUN |
| **UI-G0-G03** | 统一表格/详情/表单/确认/提示/登录/发码结果组件库存与变体 | 标注清单、参考图或设计画板 | NOT RUN |
| **UI-G0-G04** | 1440/1280/820/375/320px 共用壳/四类基准页正确重排 | 可见画板/静态多宽度对照及审查结果 | NOT RUN |
| **UI-G0-G05** | 字体 24/20/18/14/12–13 与浏览器放大时合理排版 | 视觉对照、可读性/缩放审查 | NOT RUN |
| **UI-G0-G06** | 间距/控件高度/圆角/列对齐和语义状态在四类基准页统一 | 基准组件标注与差异清单 | NOT RUN |
| **UI-G0-G07** | TOTP、兑换码一次性明文、UNKNOWN/冲突/危险确认在参考页可理解 | 完整正常/异常态高保真画面与交互说明 | NOT RUN |
| **UI-G0-G08** | WCAG 2.2 AA 目标、文字/非文字对比/焦点与键盘可访问性设计已审核 | 设计阶段检查记录；真正运行 WCAG 后续 UI-G3 验证 | NOT RUN |
| **UI-G0-G09** | 用户明确认可唯一视觉方向及正式品牌色/字体/组件样式 | 有日期、版本和真实参考 ID 的明确签收 | NOT RUN |
| **UI-G0-G10** | Admin 编码没有在批准之前开始；没有逐页不同 Theme 逃逸 | Git/change 记录与 UI-G0 批准时点顺序审查 | NOT RUN |
| **UI-G0-G11** | 前端开始时已记录 React-admin/MUI 兼容版本与全局 Theme 注入方案 | 版本锁/设计映射 review（批准阶段尚无代码） | NOT RUN |
| **UI-G0-G12** | 变更/例外与回退规则、未决问题、签收登记齐全 | 版号/例外清单/最终批准状态 | NOT RUN |

这些**不是已经通过的检查**；UI-G0 视觉审批和开发后 UI-G3 的浏览器 E2E 是两个阶段，不能拿一份 Markdown 或初步高保真替代真实软件的最终视觉/可用性验收。

## 9. 与现有 Admin 页面详细设计的关系

- [D3-UI](../../Plans/aisencore-mvp-d3-ui-admin-uiux-design.md) 中已有文字线框/路由/页面任务与部分 **候选**像素值继续有效，但凡字体/布局/组件类规则**以本文 UI-G0 全局规范为优先权威**；出现冲突必须在 UI-G0 审核时统一，不允许两种实现并存。
- D3-UI 中旧的“视觉实施默认候选”不能因本文件被创建就自动提升为已批准 Token。确认用户最终视觉方向之后应回写冻结值、引用标识、对应版号。
- **安全/功能业务规则不是此规范的可变参数**：TOTP `aal2`、发码一次性明文、M1 最后管理员、M2 套餐冻结、F05 幂等、Pro 30/365/永久、Cloudflare/Supabase/R2 信任边界仍以既有需求/业务文档为准。
- **真实上线路径**：规范草案 → 四类可见高保真基准参考 → 用户签收 UI-G0 → 正式 Admin Theme/Layout/页面开发 → D3-UI-X01～X18 与 UI-G3 真实浏览器截图/安全测试 → 最终 MVP 交付。

## 10. 官方参考与非事实边界

- [Material UI Theming](https://mui.com/material-ui/customization/theming/)：主题统一 `palette`、`typography`、`spacing`、`breakpoints`、`components`。
- [Material UI Components Theme Overrides](https://mui.com/material-ui/customization/theme-components/)：`defaultProps` 与 `styleOverrides` 统一状态/尺寸。
- [Material UI Spacing](https://mui.com/material-ui/customization/spacing/)：8px 默认 spacing 比例与自定义契约。
- [Material UI Breakpoints](https://mui.com/material-ui/customization/breakpoints/)：默认断点和值、主题自定义的条件。
- [React-admin Theming](https://marmelab.com/react-admin/Theming.html) 与 [Layout](https://marmelab.com/react-admin/Layout)：全局主题与 Layout/AppBar/Menu/Sidebar 扩展入口。
- **MUI 版本、React-admin 版本、页面可视截图、高保真参考、用户视觉签收及真实 WCAG/交互/兼容性均未实测**。本文件只是待通过 UI-G0 视觉决策的规范候选，不得用于绕过正式准入。
