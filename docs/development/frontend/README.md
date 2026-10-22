# 前端开发指南

> **前端开发唯一目录入口**：React-admin 技术栈、Admin UI/UX 设计方法、62 条结构化规则、组件和页面模式、真实验收说明均由 `docs/development/frontend/` 统一索引管理，不再设独立的 `development/admindesign` 文件夹。全局品牌/字号/布局 Token 的**唯一权威仍是 [UI-G0 架构规范](../../architecture/applications/admin-ui-design-system.md)**。
>
> 状态：开发与设计规范已整理；**Admin 正式前端编码前的 UI-G0 视觉签收仍是强制关口，目前 NOT APPROVED / BLOCKED**。高保真视觉、可执行前端主题代码和真实浏览器测试未完成。

## 本目录的 Admin 设计规范文件

| 文件 | 内容与使用顺序 |
| --- | --- |
| [Admin 设计使用指南](./admin-design-guide.md) | 从业务/D3-UI 到 UI-G0/组件/规则/验收的阅读路线、例外审批与 AI 开发约束 |
| [字体、色彩与布局基础](./admin-design-foundations.md) | 中文混排、字号角色、空间/密度、图标、浮层、动效的**使用方法**；不维护第二套 Token 数值 |
| [标准组件与页面模式](./admin-design-components-and-patterns.md) | React-admin/MUI 优先复用、列表详情返回、表单草稿、MFA、一次性发码、安全确认 |
| [UX 设计原则与适用性](./admin-design-rules.md) | 十类规则的检索与适用范围 |
| [62 条结构化规则 JSON](./admin-design-rules.json) | **机器可读的唯一规则数据**，59 条直接适用、3 条条件适用；无已实现的自动化 gate |
| [UI-G0/UI-G3 验证矩阵](./admin-design-verification.md) | 四类高保真基准页审批与开发后浏览器/键盘/权限实测 |
| [来源与迁移取舍](./admin-design-migration-record.md) | 原始参考材料、排除项、规则核对结果及从旧 `admindesign` 目录收敛的记录 |

**阅读顺序**：先读本页的开发硬约束和 [UI-G0](../../architecture/applications/admin-ui-design-system.md) 当前状态，再结合 [D3-UI 页面设计](../../Plans/aisencore-mvp-d3-ui-admin-uiux-design.md) 按任务查对应基础/组件/UX 规则，最后依据验证矩阵提交真实证据。不要为了单页任务加载整个长规则库。

## 已确定的要求

- 内部 Admin 以 **React-admin 默认技术栈**开发，主要是 React / TypeScript、Material UI / Emotion、React Router、TanStack Query、React Hook Form、React-admin i18n；Vite 是已确认的优先构建路线。
- 优先复用 React-admin 的页面组件、资源和 Data Provider / Auth Provider 机制，不同时叠加另一套完整 UI、路由、表单、请求缓存或状态管理框架。
- Admin 前端托管于 **Cloudflare Pages**，高权限管理动作必须通过可信服务端授权 API，而非在浏览器直接操作高权限凭据。
- 用户与产品级权益、登录、订单和后台管理需求以[现行需求](../../spec/requirements.md)为准；Admin 页面/资源、数据接入与安全交互以[Admin 管理前端架构](../../architecture/applications/admin-console.md)为准，框架选型以[技术栈专项](../../architecture/infrastructure/tech-stack.md)为准。
- **UI-G0 前置准入（必须检查，不能省略）**：先按 [Admin 全局设计系统权威](../../architecture/applications/admin-ui-design-system.md) 完成字体/字号、MUI 单一 Theme、语义色、8px 间距、断点/全局 Layout、共享列表/表单/详情/弹窗组件模板，产生**登录/MFA、发码、套餐、用户/成员四类高保真视觉参考与宽窄屏状态**，取得用户明确签收、版本和日期并标记 `UI-G0 APPROVED`；**否则不能新建正式 Admin 主题、布局或任何业务页面源代码**。D3-UI 文字线框或 UI-G0 文档完成不算批准。
- **页面开发时的规则路由**：优先按本目录上方索引查业务/页面 → UI-G0 Token → React-admin/MUI 标准组件与页面模式 → 实际有关的 UX 规则 → 逐屏核验；严禁引用另项目 Tailwind/Base UI、主题或旧测试命令。**规则已整理不等于 UI-G0 批准或已建立自动化门禁**。

## Admin 未来编码时的统一视觉约束（本轮未实现代码）

1. **单一全局主题**：ThemeProvider / React-admin 正式 Theme 注入一处统一 `palette/typography/spacing/breakpoints/components`；所有页面只能引用已经批准的 Design Token，禁止逐 Resource 重建 Theme 或手动选不同字体、按钮高度、边距。
2. **优先共享 Layout 与模板**：AppBar/Sidebar/Content、`PageHeader`、List/Show/Form、按钮/字段/Dialog/Status/AsyncState 均按 [唯一设计系统](../../architecture/applications/admin-ui-design-system.md) 的组件/页面模板合同复用；低必要的局部 `sx` 可以引用 token，不允许未审查的硬编码与大量页面级视觉覆写。
3. **基准与回归**：正式编码**之后**逐页对照已经批准的高保真参考，实际浏览器至少审查 1440/1280/820/375/320px、浏览器缩放、中文长字段、键盘焦点及错误/空状态；这属于后续 UI-G3/D3-UI-X 运行验收，UI-G0 签收不等于代码已达标。
4. **视觉不能替代安全**：隐藏按钮不等于服务端允许/拒绝，Admin `aal2`、F05 受保护 RPC、M3 一次性码明文不得因新增样式系统改变。

## 官方参考

- [React-admin 官方文档](https://marmelab.com/react-admin/)
- [React-admin GitHub](https://github.com/marmelab/react-admin)
- [React-admin 的 Data Provider 说明](https://github.com/marmelab/react-admin/blob/master/docs/DataProviders.md)
- [React-admin 的 Auth Provider 说明](https://github.com/marmelab/react-admin/blob/master/docs/Authentication.md)
- [Cloudflare Pages 部署 React 应用](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)

具体实际 Admin App 工程目录、Lint/Formatter、测试库与代码示例**尚未决定**；本目录的开发设计文档已经统一归档，不额外创建另一套设计系统。
