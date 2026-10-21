# 应用与产品接入架构（applications）

本分类说明**各类客户端、统一登录体验、内部 React-admin 管理应用与本地优先策略**，不替代公共 API 或服务器安全授权。

- [Admin 管理前端架构](./admin-console.md)：React-admin 的首版页面/资源、权限与数据接入、管理操作时序及验收边界。
- [统一登录与多 SaaS 会话](./auth-and-multi-saas-sessions.md)：浏览器、桌面端和内部 Admin 的 Auth 会话与跨产品登录边界。
- [本地优先 SaaS](./local-first.md)：以拉片为例的本地业务数据、第三方 AI 直连、私有配置备份与 Pro 在线复核。

**职责权威**：Admin 页面与交互见 [Admin 管理前端](./admin-console.md)；框架技术选型见 [技术栈](../infrastructure/tech-stack.md)；管理员业务授权见 [平台管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)；可信写入见 [后端](../backend/README.md)。不在应用文档中重复整套技术依赖清单。
