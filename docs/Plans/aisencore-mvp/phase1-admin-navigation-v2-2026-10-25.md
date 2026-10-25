# Admin 五入口 / 单工作区导航重组（2026-10-25）

## 背景与最终决策

用户审阅真实 AisenCore Admin 后明确指示：把「平台治理」改名为**「平台管理」**；把「产品」从侧栏一级移到「平台管理」的二级导航，与「管理审计、账号限制、管理员权限」并列；删除「业务管理」分组，并把其三个业务项与概览放到**唯一「工作区」分组**。本文件是当前导航的单一施工说明，替代[原六入口版本](./phase1-admin-navigation-redesign.md)。

## 当前 IA 和路由合同

| 位置 | 显示顺序 | 现有 Resource 路由 |
|---|---|---|
| 一级｜工作区（唯一分组） | 概览、用户、权益、兑换码、平台管理 | `/`、`/memberships`、`/grants`、`/code-batches`、`/audit-logs` |
| 用户二级 | 成员关系、查找账号 | `/memberships`、`/users` |
| 兑换码二级 | 发行批次、兑换码记录、核销记录 | `/code-batches`、`/codes`、`/redemptions` |
| 平台管理二级 | 产品、管理审计、账号限制、管理员权限 | `/products`、`/audit-logs`、`/restrictions`、`/admins` |

一级导航「权益」对应的是授权与期限记录，不等于产品成员身份或付费会员；具体 Pro 操作与风险说明保留完整业务名称。一级导航「用户」仍有「成员关系、查找账号」两视图。「平台管理」一级导航仍以管理审计为默认入口，产品的创建和详情继续使用 `/products/create` 与 `/products/:id/show`。产品状态、成员身份、Pro 权益、审计、封禁仍由原后端授权决定。顶栏产品范围是阅读过滤条件，不会变更管理审计及平台权限，也不新增其他产品查阅权。保留成员事件 `/membership-events`、高危命令 `/grant-new`、`/issue-codes`、`/account-actions`、所有详情 URI 和关联深链。

## 2026-10-25 补充：一级导航名称收敛

- 用户指定「用户与成员」缩写为「用户」；「Pro 权益」更名为「权益」，避免导航中的产品档次术语与成员身份混用。
- 具体授权资源在页面中称「授权记录」，具体动作仍称「授予 Pro 权益」；`/grants` URL、授权时间与来源、数据库对象及安全检查都不变。
- 关联的领域 aria-label「用户二级导航」、详情页面包屑/返回链接、资源 i18n、浏览器测试断言已同步；各旧名称仅保留在历史记录中。
- 顶栏产品范围的对齐变更见 [浅色工作台外壳整改记录](./phase1-admin-shell-light-surfaces-2026-10-25.md)。

**本轮最新实证（2026-10-25）**：一级「用户 / 权益」更名及业务资源语义分离，正式 Vite/TS Build、Oxlint 零错误/警告；真实 Chrome 完整管理员 AAL2 E2E **exit 0**，`NAV_PRIMARY` 确认五个短名称、`NAV_SECONDARY` 确认「用户→查找账号」、业务记录、70组视口与受保护写入不回退，测试用临时资源清理通过。该更新不代表 NVDA/VoiceOver、400%缩放和八维人工视觉签收完成。

## 本轮施工分解

- [x] 代码：`App.tsx` 删除「产品」一级、去掉「业务管理」分类、统一只保留「工作区」，导航改名「平台管理」，支持所有产品/审计/限制/管理员及相关操作的一级当前域高亮。
- [x] 代码：拆出可复用 `resources/DomainNavigation.tsx` 与 `domainNavigationModel.ts`，保持 URL 唯一选中真源，既有用户/兑换码二级导航行为不变。
- [x] 代码：`resources/lists.tsx` 产品列表增加「平台管理」四子项导航；`WorkspaceLists.tsx` 和 `WorkspaceDetails.tsx` 同步领域与面包屑命名。
- [x] 测试：`scripts/test-d3-authenticated-pages.mjs` 修订侧栏五入口、唯一工作区、产品四子项、产品→审计实际点击、刷新选中、320px 产品 / 390px 管理移动布局断言。
- [x] 代码静态门禁：正式 TS/Vite build 和 Oxlint 0 warnings / 0 errors。
- [x] **真实 Chrome 正式构建全回归 exit 0**：真实邮箱/密码→TOTP→AAL2、10类列表/8类详情、Pro/发码/治理高危 RPC 与503/429恢复、70组视口/页面、QA产品与账号彻底清理；25状态 axe 无自动识别到的违规但有 incomplete。新增 `NAV_PRIMARY PASS` 单「工作区」五入口、`NAV_MANAGEMENT PASS` 产品→管理审计二级点击/刷新选中、`NAV_MOBILE PASS` 320产品和兑换码、390平台管理无整页横向溢出。
- [ ] 人工门禁：键盘完整菜单、读屏、真机、200%/400% 缩放、用户八维视觉签收。这些不能以自动化 axe 0 代替。

## 生产预览验证记录（2026-10-25）

- `pnpm build`：TypeScript + Vite **PASS**。
- `pnpm lint`：27 个 Admin 源模块，**0 errors / 0 warnings**。
- `scripts/test-d3-authenticated-pages.mjs`：真实生产预览 Chrome 完整退出码 **0**，上述导航专项、实际授权与敏感写入、强制 MFA/AAL2/匿名拒绝、列表查询/排序、相关 UUID 深链和自动化 QA 清理均通过。
- 相应截图：`ui-evidence/operator-products-1440.png`、`operator-navigation-management-390.png`、`operator-navigation-management-products-320.png`。旧 `operator-navigation-governance-390.png` 保留为历史旧版截图，不代表当前 UI。
- 正式人工验收仍未完成：完整 Tab/焦点恢复、NVDA/VoiceOver、真机触摸、浏览器真实 200/400% 缩放、axe incomplete 与八维视觉所有者签收。

## 风险、回滚与证据

不更改任何 DB migration、RLS/RPC、authProvider、dataProvider、角色、数据授权和路由定义；旧的 `/products` 直达链接和跨模块链接必须继续工作。任何测试数据只由现有 QA 脚本按其清理契约处理。旧导航的截图/记录保留用于历史对比，最新截图由真实生产预览 Chrome 回归生成在 `ui-evidence/operator-navigation-management-390.png` 和 `ui-evidence/operator-navigation-management-products-320.png`。未提交、推送或部署。
