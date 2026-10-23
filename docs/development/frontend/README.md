# 前端开发规范索引

本目录集中管理通用 Admin 开发原则与 AI 工作流。**正式业务、安全、数据库、RPC 仍以 [需求](../../spec/requirements.md)与[架构](../../architecture/README.md)为准。** 本 README 不重复规则正文，也不定义固定的导航、页面布局、主题或像素。

| 工作任务 | 单一入口 |
| --- | --- |
| React-admin/MUI 技术框架、组件复用、通用前端实施规则 | [Admin 前端开发总纲](./admin-design-guide.md) |
| 全局单 Theme、样式一致性、可访问性与设计自由度 | [Admin 统一 UI 质量规范](../../architecture/applications/admin-ui-design-system.md) |
| 结构化通用 UX 审核 | [规则索引](./admin-design-rules.md)及 [62 条 JSON 规则](./admin-design-rules.json) |
| 如何决定何时制作原型、怎样进行用户比选和 AI 开发交接 | [原型与 AI 开发工作流](./interaction-benchmark-workflow.md) |
| 本次交互原型需要包含的最小验证场景和交付证据 | [原型产物规范](./interaction-benchmark-spec.md) |
| 产品/权限/数据范围与前端可观察的业务行为 | [Admin 应用层架构及验收索引](../../architecture/applications/admin-console.md) |
| 原型文件及版本入口 | [interaction-benchmarks](../../interaction-benchmarks/README.md) |

**权威边界**：旧 UI-G0A 原型尚未签收，历史固定色板、四主题、六模块、组件 1:1 映射、特定导航与抽屉样式等已取消为全局强制项。新的设计按任务审阅并明确决定；文档整理不自动授权正式前端、后端、SQL 或部署。
