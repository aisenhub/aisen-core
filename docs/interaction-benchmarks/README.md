# Admin MVP 离线交互预览

**当前唯一可运行原型**：[Admin MVP V6 离线 HTML Demo](./aisencore-mvp-interaction-lab.html)。在 GitHub 下载 Raw HTML 后以 Chrome 或 Edge 打开；无需安装依赖或连接 Supabase。

## 当前版本展示什么

- **全平台治理 / 单产品运营空间**：全局产品及用户治理，单产品空间内的产品概览、用户（含成员筛选、暂停/恢复）、Pro 授权、兑换码、反馈、产品操作记录。
- 通过合成数据测试 `left→suspended→left` 精确恢复、跨产品隔离、一次性发码明文与 UNKNOWN 安全恢复、用户反馈和审计反馈。
- 31 张演示场景卡：**28 项浏览器内模拟模型检查**、3 项实际环境或人工验收。原型测试 PASS 不表示当前生产代码或真实认证已通过。

## 权威和风险边界

- 本文件是**交互评审产物**，不是功能需求、技术迁移计划或已批准的视觉/后端合同。[Admin 架构](../architecture/applications/admin-console.md)和 [MUI Theme/UX 规范](../architecture/applications/admin-ui-design-system.md)是实施依据。
- **正式反馈合同已独立确定**：[跨 SaaS 用户反馈架构](../architecture/domains/user-feedback.md)采用五态、0～2 张私有图片、受保护 RPC/Edge/R2。V6 内存模拟仍沿用早期六态（含 `triaged`），没有真实图片上传，**只能作历史交互参考，不能决定正式业务或权限规则**。
- 所有用户、Pro 授权、兑换码、身份验证、管理操作均为浏览器内存中的模拟状态，刷新后重置；**不访问** Supabase Auth、PostgreSQL、RLS/RPC、Edge、R2。
- 请勿输入真实凭证或兑换码。正式 React-admin 需独立通过浏览器、键盘/无障碍、API、SQL/并发和 MFA 测试。
- 早期 V2～V5 的样式变化、导航调整与工作区改造流程已收敛至 V6，不作为当前编码指令；过去过程保留在 Git 历史。
