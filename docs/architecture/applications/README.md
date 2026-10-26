# 应用与产品接入架构（applications）

本分类说明**各类客户端、统一登录体验、内部 React-admin 管理应用与本地优先策略**，不替代公共 API 或服务器安全授权。

- [Admin 管理前端架构](./admin-console.md)：React-admin 的首版页面/资源、权限与数据接入、管理操作时序及验收边界。
- [跨 SaaS 用户反馈业务合同](../domains/user-feedback.md)：Admin 用户反馈列表/详情的真实领域边界、权限和用户可见回复；目前前端列表/详情/处理初版已编码并通过 TypeScript/构建，完整浏览器交付验收尚未完成。
- [Admin 统一 Theme 与通用 UX 规范](./admin-ui-design-system.md)：React-admin 共享 Theme、主题消费、可访问性与设计验证原则；不再包含固定配色、尺寸、页面结构或正式编码前旧四页硬门槛。
- [交互基准 HTML 产物规范](../../development/frontend/interaction-benchmark-spec.md)：依照 Admin 业务合同与上述设计系统验证模块衔接/状态/危险操作和必要的字体/布局/主题；原型文件位于 [interaction-benchmarks](../../interaction-benchmarks/README.md)，**无权重新定义视觉 Token 或业务权限**。
- [统一登录与多 SaaS 会话](./auth-and-multi-saas-sessions.md)：浏览器、桌面端和内部 Admin 的 Auth 会话与跨产品登录边界。
- [本地优先 SaaS](./local-first.md)：以拉片为例的本地业务数据、第三方 AI 直连、私有配置备份与 Pro 在线复核。

**职责权威**：Admin 业务/权限及原 D3-UI-X 验收编号见[Admin 应用架构](./admin-console.md)；正式界面的布局、导航与主题由当前设计任务和用户确认决定。全局 Theme 参见[UI 质量规范](./admin-ui-design-system.md)，技术栈和安全信任边界仍见[技术栈](../infrastructure/tech-stack.md)、[管理员生命周期](../domains/platform-admin-and-account-lifecycle.md)与[后端](../backend/README.md)。
