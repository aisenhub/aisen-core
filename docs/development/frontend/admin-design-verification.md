# Admin 设计原则与 UI-G0/UI-G3 逐页面验收矩阵

> **设计检查的输入**：[机器可读 62 条规则](./admin-design-rules.json)、[单一 UI-G0 Token 规范](../../architecture/applications/admin-ui-design-system.md)、[D3-UI 逐页面业务规范与 X01～X18](../../Plans/aisencore-mvp-d3-ui-admin-uiux-design.md)。**所有真实基准视觉、浏览器、键盘、网络和运行证据均未执行（NOT RUN）**；UI-G0 仍 `NOT APPROVED / BLOCKED`。

## 1. UI-G0：在正式 Admin 编码前准备的材料

| 基准页/场景 | 必须核对的设计问题 | 规则分类/具体原则样例 | 所需证据 |
| --- | --- | --- | --- |
| **登录 + TOTP MFA** | 字体角色、表单标签、输入法/粘贴、密码控制、错误/焦点、窄屏键盘和只在有效 `aal2` 后开放管理页 | `UX-FORM-INPUT-LABELS`, `UX-FORM-CREDENTIAL-REUSE`, `UX-A11Y-KEYBOARD-ESCAPE`, `UX-LAYOUT-DYNAMIC-VIEWPORT` | 真实高保真登录/MFA/失败/窄屏参考、字段/秘密处理说明、用户视觉签收 |
| **兑换码列表、发行与一次性结果** | 列宽、长 ID、表单、发码 UNKNOWN、仅首次码明文、高风险撤销、避免秘密进 URL | `UX-LAYOUT-HORIZONTAL-SCROLL-CONTAINMENT`, `UX-FORM-SUBMIT-FEEDBACK`, `UX-FEEDBACK-ERROR-RECOVERY`, `UX-NAV-DEEP-LINKING` | 列表/新建/成功/超时/撤销及 1440/375 设计对照，敏感数据边界明确 |
| **套餐/授权** | 全字段保存、引用冻结、30/365/永久文案、确认/冲突及保持草稿 | `UX-FORM-INLINE-VALIDATION`, `UX-WORKFLOW-CONTEXT-PRESERVATION`, `UX-FEEDBACK-CONFIRMATION`, `UX-CONTENT-FORMATTING-LOCALE` | 套餐表/表单/冻结/冲突参考和用户签收，不用已签发套餐原地 PATCH |
| **用户/产品成员** | 有界搜索、长邮箱、分页返回、空态与部分查询、blocked/left/恢复含义 | `UX-CONTENT-TRUNCATION-EXPAND`, `UX-FEEDBACK-EMPTY-STATES`, `UX-NAV-HISTORY-PREDICTABLE`, `UX-VISUAL-STATUS-MEANING` | 用户查询/成员详情/有界搜索/禁用态及数据最小化参考 |
| **共用 Shell 与组件状态** | 单一 AppBar/Sidebar/Header、主/次/危险操作、表格/输入/Dialog、加载/403/503、字体/图标/边距/圆角 | `UX-VISUAL-SEMANTIC-TOKENS`, `UX-VISUAL-CONTRAST`, `UX-A11Y-FOCUS-VISIBLE`, `UX-LAYOUT-ZINDEX-SYSTEM` | 一份 Token 冻结版、全局组件状态板、1440/1280/820/375/320 对照、用户明确签收 |

**最小审核输入组合**：同一字体层级与实际文字内容；正常/加载/空态/字段错误/禁用/权限拒绝/超时状态；常规点击、键盘焦点、Dialog 关闭恢复；桌面和窄屏；成功和危险操作真实文案。**静态设计稿只验证视觉与意图，不证明 JWT/RLS/RPC 真实鉴权。**

## 2. UI-G3：正式 Admin 代码完成以后才能真实执行的检查

| 组 | 浏览器/运行中必须验证 | 真实 PASS 证据 |
| --- | --- | --- |
| 设计 Token/组件一致性 | 同语义按钮字号/高度/颜色一致；List/Show/Form/Popover 均消费 Theme；无第二个 `createTheme` 或任意页面魔法值 | 与 UI-G0 批准版对照截图 + 必要计算样式检查 |
| 字体与缩放 | 中文、英文、混排、长 UUID/邮箱、font fallback、字体加载失败、200%/400% 重排 | 实际设备与浏览器截图/DOM，记录被截断内容是否有合法全文途径 |
| 布局/滚动/弹层 | 1440/1280/820/375/320px、抽屉、表格局部滚动、虚拟键盘、Dialog/Tooltip 位置与焦点恢复 | 不溢出/遮挡的截图+键盘操作记录 |
| 交互与保存恢复 | 筛选 → 详情 → 返回，草稿 → 失败 → 保留，未保存关闭，409 冲突、401/403/429/503 真实差异 | E2E 操作轨迹/错误注入及后端数据核对 |
| 敏感信息/权限 | TOTP `aal2`、Admin 实时资格、首发明文内存态、登出清空与历史不回取，所有危险写受可信校验 | 权限负向 E2E + Network/缓存/路由/日志检查，绝不打印实际凭据/明文 |
| 无障碍/性能 | WCAG 2.2 AA 适用条款，键盘/焦点/对比度、减少动效、表格性能/查询预算与 P50/P95 | 适用自动检查+真实人工审核，注明设备/浏览器和未覆盖范围 |

**注意**：源规则有 `reviewMethodSuggestion` 只是建议，**AisenCore 目前没有规则扫描器或自动化 UI 门禁**；未来建立时必须对每条可检测规则提供正反例/命令/覆盖范围，视觉审查无法由 grep/构建通过代替。

## 3. 缺陷与审批工作流

- **阻塞**：无法执行核心任务、泄露码/凭据、错误授权、丢正式数据、无法退出 MFA/弹窗、UI-G0 尚无用户认可的品牌参考。
- **必须整改**：导航位置和筛选丢失、显式保存草稿无提示、窄屏按钮遮挡/不可操作、关键信息仅靠颜色、字号或控件样式跨页不一致。
- **候选体验优化**：微动效、个别非关键视觉细节、第二主题/密度预设；不得用作 MVP 强制新增业务。
- 每个问题记录：`rule_id`、页面/状态、影响、证据路径、预期与实际、责任/处理、复核结果、UI-G0 视觉参考版号（如有）。**UI-G0 的正式批准仅能由项目所有者在真正看到高保真基线后明确决定并记录。**
