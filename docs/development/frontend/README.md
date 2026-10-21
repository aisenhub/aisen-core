# 前端开发指南

> 状态：已确定技术栈与复用原则；具体编码规范、工程目录及页面实现待实际开发阶段细化。

## 已确定的要求

- 内部 Admin 以 **React-admin 默认技术栈**开发，主要是 React / TypeScript、Material UI / Emotion、React Router、TanStack Query、React Hook Form、React-admin i18n；Vite 是已确认的优先构建路线。
- 优先复用 React-admin 的页面组件、资源和 Data Provider / Auth Provider 机制，不同时叠加另一套完整 UI、路由、表单、请求缓存或状态管理框架。
- Admin 前端托管于 **Cloudflare Pages**，高权限管理动作必须通过可信服务端授权 API，而非在浏览器直接操作高权限凭据。
- 用户与产品级权益、登录、订单和后台管理需求以[现行需求](../../spec/requirements.md)及[技术栈专项](../../architecture/tech-stack.md)为准。

## 官方参考

- [React-admin 官方文档](https://marmelab.com/react-admin/)
- [React-admin GitHub](https://github.com/marmelab/react-admin)
- [React-admin 的 Data Provider 说明](https://github.com/marmelab/react-admin/blob/master/docs/DataProviders.md)
- [React-admin 的 Auth Provider 说明](https://github.com/marmelab/react-admin/blob/master/docs/Authentication.md)
- [Cloudflare Pages 部署 React 应用](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)

具体项目目录、Lint/Formatter、测试库、页面命名及代码示例**尚未决定**；需要时再增设文件，不抢先创建一套平行规范。
