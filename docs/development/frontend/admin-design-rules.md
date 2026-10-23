# Admin 通用 UX 规则索引

[admin-design-rules.json](./admin-design-rules.json) 是唯一机器可读规则正文，共 62 条、ID 唯一（59 条 active，3 条 conditional）。本文件仅用于快速选择相关类别，不重复规则正文，不构成业务能力清单或已运行测试。

| 类别 | 关注点 |
| --- | --- |
| `a11y` | 键盘焦点、辅助技术名称、Dialog、缩放与操作目标 |
| `content` | 中英混排、长文本、数字、时间和可复制内容 |
| `feedback` | 加载/空态、提交结果、错误与恢复 |
| `forms` | 标签、校验、草稿、提交及输入保护 |
| `layout` | 内容重排、局部滚动、弹层层级与触达 |
| `motion` | 适度反馈、减少运动 |
| `navigation` | 导航当前位置、列表上下文与合理返回 |
| `performance` | 按需加载、缓存边界、请求与资源回收 |
| `visual` | 语义色、主题一致性、可读性和对比度 |
| `workflow` | 正常/异常流程、上下文保护、高风险操作 |

按任务查询 `id/title/summary/category/level/scope/applicability/review/adminGuidance`，不用一次性给 AI 加载全部 62 条。三条条件性规则 `UX-A11Y-DRAG-ALTERNATIVES`、`UX-MOTION-USER-CONTROL` 与 `UX-WORKFLOW-AI-SOURCE-COST-EGRESS` 只在对应功能真实存在时适用，不能因此新增功能。

`reviewMethodSuggestion` 是建议，`actualAisenCoreAutomatedGate: NOT_IMPLEMENTED` 不是已运行检查。原始来源 SHA256 仅用于追溯，不是当前代码依赖。旧 UI-G0 或 D3-UI-X 编号不代表具体布局、主题、表格高度或弹窗颜色仍是强制方案。

**使用顺序**：核对[需求及业务安全合同](../../architecture/applications/admin-console.md) → 选择本 JSON 中适用的通用规则 → 依[Admin 开发总纲](./admin-design-guide.md)复用 React-admin/MUI → 根据[原型与 AI 工作流](./interaction-benchmark-workflow.md)按需验证 → 实际测试有证据后再标 PASS。
