# 前端开发规范索引

本 README **只负责导航，不复制规则正文**。需求见 [spec](../../spec/requirements.md)，业务与 RPC/权限见 [architecture](../../architecture/README.md)，全局 Theme/视觉唯一权威是 [UI-G0](../../architecture/applications/admin-ui-design-system.md)，页面行为参考 [D3-UI](../../Plans/aisencore-mvp/aisencore-mvp-d3-ui-admin-uiux-design.md)，交互网页统一放 [interaction-benchmarks](../../interaction-benchmarks/README.md)。

> 当前：**交互优先方法已选，UI-G0A NOT APPROVED，Theme 未冻结，正式业务代码/SQL/云端施工未授权**。此目录文档不代表已建成前端、验收工具或 CI 门禁。

## 按工作任务读取哪份规范

| 遇到的问题 | 唯一执行规范入口 |
| --- | --- |
| 需不需要原型？人怎样参与，哪一步才正式开发？ | [交互优先工作流](./interaction-benchmark-workflow.md) |
| 原型具体要有哪些业务状态、跨模块路径、错误和视觉覆盖？怎样引导体验？ | [交互基准产物规范](./interaction-benchmark-spec.md) |
| 哪些原型成果可复用？何时做轻量测试、何时做真实 E2E？ | [原型→正式实现与分级测试规则](./prototype-to-production-rules.md) |
| Admin 当前技术约束、规则阅读顺序和例外？ | [Admin 开发设计使用指南](./admin-design-guide.md) |
| 字体/布局的使用方法、组件如何复用？ | [设计基础](./admin-design-foundations.md)、[组件与页面模式](./admin-design-components-and-patterns.md) |
| 有哪些通用 UX 规则？ | [规则适用性目录](./admin-design-rules.md)、[62 条机器规则](./admin-design-rules.json) |
| UI-G0 签收与 UI-G3 真实浏览器该检查什么？ | [逐页面验证矩阵](./admin-design-verification.md) |

**读法**：先查 [项目 AGENTS.md](../../../AGENTS.md) 与相关业务合同，再按本次任务选择上表**一两份**规范；不应为小任务全文加载全部规则。正式 React-admin/MUI 的组件、主题、版本和必要 Provider 仍遵循 [Admin 设计指南](./admin-design-guide.md) 与架构，不从 HTML 原型反向推导数据库/RPC。
