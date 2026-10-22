# 交互基准产物目录（不属于第五层文档权威）

本目录与 `docs/Plans/`、`docs/architecture/`、`docs/development/` 并列，**只保存实际授权制作的可交互验证网页**，不是业务契约、Theme 权威、正式前端工程或额外审批系统。本次仅建立放置规则和索引，不预创建任何模拟网页。

- **产物规范**：[交互基准产物规格](../development/frontend/interaction-benchmark-spec.md)、[原型→正式实现与分级测试](../development/frontend/prototype-to-production-rules.md)、[流程](../development/frontend/interaction-benchmark-workflow.md)。
- **业务/视觉来源**：必须引用 [架构](../architecture/README.md)、[UI-G0 Design System](../architecture/applications/admin-ui-design-system.md)；已批准交互及未决问题只在现有 [Plans](../Plans/README.md) 的任务记录里登记。
- **命名与文件**：真正有需求才建 `docs/interaction-benchmarks/<stable-task-slug>/index.html`（例如未来的 `admin-codes-unknown/index.html`），场景名使用英文小写加短横线；不预建空目录/页面。默认一个自包含 HTML，需离线交接且网页内引导不便时才补 `guide.md`。
- **适用边界**：网页模拟任务状态，必须能按实际控件完成核心正常/异常路径，显示「仅演示、不会修改真实数据」；不得调用生产 Auth/API，不保存真实用户信息、令牌或明文，不造可误认为真实操作通过的审批功能。
- **引导与反馈**：默认在交付网页的聊天消息提供「怎么体验」；网页脱离聊天/多人评审才把引导做成独立页或面板。用户认可/视觉冻结/正式授权不在网页内自动生成，而是写回 Plans。
- **版本与清理**：修改同一场景文件，由 Git commit/hash 标识实际评审版本，不创建 `v1-v2-v3` 副本。被 UI-G0/有效任务签收引用的版本必须仍可恢复；正式实现稳定且无引用需求的探索稿可依 Plans 清理规则删除，不长期维护 HTML 与 React 两套代码。
- **当前状态**：项目根 `灵感/` 的原始 HTML 仍为候选参考，不自动迁移，也不是已批准版本；`UI-G0A NOT APPROVED`、正式业务开发未获授权。

只有出现真实原型时才在此 README 或相关 Plans 任务中链接它；不维护第二套项目任务列表。
