# Admin 设计原则与 UI-G0/UI-G3 逐页面验收矩阵

> **设计检查的输入**：[机器可读 62 条规则](./admin-design-rules.json)、[唯一 UI-G0 规范](../../architecture/applications/admin-ui-design-system.md)、[D3-UI 页面规格](../../Plans/aisencore-mvp/aisencore-mvp-d3-ui-admin-uiux-design.md)、[交互优先工作流](./interaction-benchmark-workflow.md)。旧真实 React-admin/MUI G0B 原型及截图已删除；现已选定「任务场景优先的轻量 HTML + 同步体验引导」方法，`灵感/` 演示仅作候选。**UI-G0A NOT APPROVED**，任何旧截图、原型 Build PASS 或 HTML 内的自动签收文字都不是有效验收证据。

## 1. UI-G0：在正式 Admin 编码前准备的材料

| 基准页/场景 | 必须核对的设计问题 | 规则分类/具体原则样例 | 所需证据 |
| --- | --- | --- | --- |
| **登录 + TOTP MFA** | 字体角色、表单标签、输入法/粘贴、密码控制、错误/焦点、窄屏键盘和只在有效 `aal2` 后开放管理页 | `UX-FORM-INPUT-LABELS`, `UX-FORM-CREDENTIAL-REUSE`, `UX-A11Y-KEYBOARD-ESCAPE`, `UX-LAYOUT-DYNAMIC-VIEWPORT` | 真实高保真登录/MFA/失败/窄屏参考、字段/秘密处理说明、用户视觉签收 |
| **兑换码列表、发行与一次性结果** | 列宽、长 ID、表单、发码 UNKNOWN、仅首次码明文、高风险撤销、避免秘密进 URL | `UX-LAYOUT-HORIZONTAL-SCROLL-CONTAINMENT`, `UX-FORM-SUBMIT-FEEDBACK`, `UX-FEEDBACK-ERROR-RECOVERY`, `UX-NAV-DEEP-LINKING` | 列表/新建/成功/超时/撤销及 1440/375 设计对照，敏感数据边界明确 |
| **套餐/授权** | 全字段保存、引用冻结、30/365/永久文案、确认/冲突及保持草稿 | `UX-FORM-INLINE-VALIDATION`, `UX-WORKFLOW-CONTEXT-PRESERVATION`, `UX-FEEDBACK-CONFIRMATION`, `UX-CONTENT-FORMATTING-LOCALE` | 套餐表/表单/冻结/冲突参考和用户签收，不用已签发套餐原地 PATCH |
| **用户/产品成员** | 有界搜索、长邮箱、分页返回、空态与部分查询、blocked/left/恢复含义 | `UX-CONTENT-TRUNCATION-EXPAND`, `UX-FEEDBACK-EMPTY-STATES`, `UX-NAV-HISTORY-PREDICTABLE`, `UX-VISUAL-STATUS-MEANING` | 用户查询/成员详情/有界搜索/禁用态及数据最小化参考 |
| **共用 Shell 与组件状态** | 单一 AppBar/Sidebar/Header、主/次/危险操作、表格/输入/Dialog、加载/403/503、字体/图标/边距/圆角 | `UX-VISUAL-SEMANTIC-TOKENS`, `UX-VISUAL-CONTRAST`, `UX-A11Y-FOCUS-VISIBLE`, `UX-LAYOUT-ZINDEX-SYSTEM` | 一份 Token 冻结版、全局组件状态板、1440/1280/820/375/320 对照、用户明确签收 |

**UI-G0A 优先验证的是任务旅程，而不是漂亮截图**：对需要模拟的场景，查看「起点 → 跨模块跳转/上下文保持 → 关键操作 → 正常或异常分支 → 下一步」是否自然，检查高风险动作的影响范围、失败恢复与表单防错。视觉辅助检查内容主次、弹窗、操作位置和窄屏布局；约 80%/20% 是评审精力建议，不替代可访问性底线。候选示例不必每个模块单独建 HTML，也不强制恢复真实 React-admin/MUI 旧原型。

**原型交付前的最小检查**：①模拟按钮确实有对应状态/分支，②至少包含当前最关键正常和异常/高危路径，③明确标注「模拟，不会修改真实数据」，④**同期提供可执行「怎么体验」引导**（默认对话文字，或在网页内做可返回业务场景的引导页，转交时可单独成文档），说明实际点击顺序、每步要观察什么、视觉关注点与反馈方式；⑤不预填 `PASS/APPROVED`，不将自动核对勾选视为人已审查。具体见[工作流第 4 节](./interaction-benchmark-workflow.md)。

## 2. UI-G3：正式 Admin 代码完成以后才能真实执行的检查

| 组 | 浏览器/运行中必须验证 | 真实 PASS 证据 |
| --- | --- | --- |
| 设计 Token/组件一致性 | 同语义按钮字号/高度/颜色一致；List/Show/Form/Popover 均消费 Theme；无第二个 `createTheme` 或任意页面魔法值 | 与 UI-G0 批准版对照截图 + 必要计算样式检查 |
| 字体与缩放 | 中文、英文、混排、长 UUID/邮箱、font fallback、字体加载失败、200%/400% 重排 | 实际设备与浏览器截图/DOM，记录被截断内容是否有合法全文途径 |
| 布局/滚动/弹层 | 1440/1280/820/375/320px、抽屉、表格局部滚动、虚拟键盘、Dialog/Tooltip 位置与焦点恢复 | 不溢出/遮挡的截图+键盘操作记录 |
| 交互与保存恢复 | 筛选 → 详情 → 返回，草稿 → 失败 → 保留，未保存关闭，409 冲突、401/403/429/503 真实差异 | E2E 操作轨迹/错误注入及后端数据核对 |
| 交互原型→正式行为一致性 | 按已确认的跨模块旅程重放操作与异常分支；真实代码不应因映射 React-admin 组件而丢上下文、漏确认或假报成功 | 关键「初始状态 → 用户操作 → 期望结果」用例与浏览器可复核轨迹 |
| 敏感信息/权限 | TOTP `aal2`、Admin 实时资格、首发明文内存态、登出清空与历史不回取，所有危险写受可信校验 | 权限负向 E2E + Network/缓存/路由/日志检查，绝不打印实际凭据/明文 |
| 无障碍/性能 | WCAG 2.2 AA 适用条款，键盘/焦点/对比度、减少动效、表格性能/查询预算与 P50/P95 | 适用自动检查+真实人工审核，注明设备/浏览器和未覆盖范围 |

**注意**：源规则有 `reviewMethodSuggestion` 只是建议，**AisenCore 目前没有规则扫描器或自动化 UI 门禁**；未来建立时必须对每条可检测规则提供正反例/命令/覆盖范围，视觉审查无法由 grep/构建通过代替。

## 3. 缺陷与审批工作流

- **阻塞**：无法执行核心任务、泄露码/凭据、错误授权、丢正式数据、无法退出 MFA/弹窗、UI-G0 尚无用户认可的品牌参考。
- **必须整改**：导航位置和筛选丢失、显式保存草稿无提示、窄屏按钮遮挡/不可操作、关键信息仅靠颜色、字号或控件样式跨页不一致。
- **候选体验优化**：微动效、个别非关键视觉细节、第二主题/密度预设；不得用作 MVP 强制新增业务。
- 重要问题沿用现有任务/Plans 记录「场景与步骤、影响、期望和实际、修复与复核结果、原型版本」。可以关联 `UX-*`/UI-G0 规则，无需为每个原型再建审批表。**业务交互认可、视觉/Token 签收和正式施工许可分开记录**；UI-G0 正式批准只能由项目所有者在看过必要代表性基准及真实评审结果后明确作出。原型中的「体验完成」不是授权，UI-G3 自动化测试通过也不自动批准上线。
