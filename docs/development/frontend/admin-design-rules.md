# Admin 设计原则目录｜结构化规则唯一来源

> **唯一机器可读正文**：[admin-design-rules.json](./admin-design-rules.json)，本入口仅分类路由与适配说明，不复制规则正文或旧项目脚本。当前 **62 个来源 ID 已逐条迁入**，标注 Admin 适用范围和 `active/conditional` 状态；**规则本身没有通过浏览器测试，实际自动化门禁 `NOT_IMPLEMENTED`**。`UI-G0 = NOT APPROVED / BLOCKED`。

## 选择性阅读/按任务检索

| `category` | 适用于 Admin 的典型问题 |
| --- | --- |
| `visual` | MUI 单一 Theme、语义色、实际对比度和状态意义 |
| `layout` | 固定 AppBar/Sidebar、局部横向滚动、z-index/Portal、窄屏 |
| `content` | 字体角色、中文/英文/UUID/日期、长文本与可复制 |
| `navigation` | 菜单活动项、列表筛选/分页恢复、非秘密 URL 状态 |
| `forms` | MFA、套餐全字段表单、标签、可见错误、提交保护 |
| `feedback` | 401/403/409/429/503、UNKNOWN 发码、成功与空态 |
| `motion` | 弹层过渡、减少动态效果、动效不得驱动业务成功 |
| `a11y` | 键盘焦点、Dialog、读屏、缩放、点击目标 |
| `performance` | 列表按需加载、UI/Session 缓存、监听回收、网络资源 |
| `workflow` | 发码/撤销、数据修改、草稿、幂等、批量任务保护 |

阅读/评审时先按分类与页面筛出规则，检查字段 `id/title/summary/level/scope/adminGuidance/review`。不要为了一个表单任务一次性引用全部 62 条，也不要把另一产品的编程示例当可部署实现。

## 结构化规则字段契约

- `id`：保留原 `UX-...` ID，避免将来追踪时失去来源；不同于 AisenCore 自有的 `UI-G0-Gxx`、`D3-UI-Xxx` 验收编号。
- `category/level`：唯一分类及 `must/should`；强度不同于缺陷严重程度和实现优先级。
- `scope`：上游的一般适用平台/表面/条件，**不代表本项目有所有产品功能**；对 Admin 的实际开关以 `applicability` 和 `activationCondition` 为准。
- `applicability`：`active` 表示可直接用于已确定 Admin 页面审核；`conditional` 表示**仅当未来确实存在该操作时**应用，不作为新增 MVP 需求。
- `adminGuidance`：针对 React-admin/MUI 的实施解释或已核实的通用原则，不引入 Tailwind/Base UI/WebApp 源码。业务权威始终为 D3/D3-UI/F01～F08。
- `review.requiredStates/checklistQuestions`：**建议评审项目**，不等于实际执行或结果通过。
- `reviewMethodSuggestion`：预期适合人工、浏览器或单元等方式；不会主动运行。
- `actualAisenCoreAutomatedGate: NOT_IMPLEMENTED`：来源中曾出现的本地 `pnpm verify:...` gate 不属于 AisenCore，**没有迁入或执行**；直到 AisenCore 真有具体命令/测试资产/正负例证明才能更改状态。
- `sourceRuleFiles`：迁移前 10 份来源类别文件的 SHA256 清单，可验证规则源的标识；**不是依赖原目录继续存在**。

## 三条条件性规则（不增加 MVP 功能）

- `UX-A11Y-DRAG-ALTERNATIVES`：只有之后确实引入拖拽交互才审查。
- `UX-MOTION-USER-CONTROL`：只有存在自动/持续运动内容才审查。
- `UX-WORKFLOW-AI-SOURCE-COST-EGRESS`：Admin 当前没有用户 AI 支付/供应商操作，不借此新增 AI 网关、成本页或 AI 业务。

另外，虚拟化、复杂动态主题等通用原则不意味着**当前就要添加组件**；没有该模式则检查项可记为不适用，而不是新建功能。

## 在未来编码/验收中使用

1. 先确认 [UI-G0 唯一视觉规范](../../architecture/applications/admin-ui-design-system.md) 及真实视觉签收状态；未获批，不开始正式页面代码。
2. 再从 `admin-design-rules.json` 按 `category` / `id` 筛选与页面相关的原则，记录适用/例外/验证方法；结合 [组件与页面模式](./admin-design-components-and-patterns.md) 选择 React-admin/MUI。
3. 依据 [页面与验证映射](./admin-design-verification.md) 生成测试任务，真实浏览器/安全 RPC 验证后按用例保存证据；**不能用规则数、文档检查、截图单帧证明全部功能通过**。
4. 若规则需要修订，维护本 JSON 的唯一正文、更新相应迁移/规则索引与验证说明，不复制另一份 `MANUAL.md` 平行来源。
