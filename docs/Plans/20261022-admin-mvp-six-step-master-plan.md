# Admin MVP 设计收敛与实施状态

> 当前正式 Admin/SQL/Auth/云端施工仍需用户明确授权。旧 UI-G0A 全景原型未获签收，也未找到当前可运行的已签收原型。历史原型形态不再强制约束新任务。

## 保留的业务与安全合同

- Admin 管理公共产品、身份和产品成员、Pro 资格和期限、兑换码/核销、管理员限制及审计，具体以[需求](../spec/requirements.md)、[Admin 应用架构](../architecture/applications/admin-console.md)与后端领域合同为准。
- 管理权限要求可信 `aal2`、M1 最后管理员保护及产品/全局范围正确；`left → suspended → left` 精确恢复，DEC-06 邮箱查询/UUID 降级不变。
- 码明文只在首次成功响应临时显示；`UNKNOWN` 继续按原产品和 `request_id` 核查，必要时独立确认撤销和重新发码。
- 最新[会员职责边界](../architecture/domains/membership-qualification-boundary.md)规定 Core 只管理 Pro 资格与时间，不管理 SaaS 的功能、业务额度和套餐功能版本。

## 前端与验证原则

- 正式 Admin 使用 React-admin/MUI/TypeScript、一个全局 Theme 和最小 Provider 适配；导航、配色、密度、页面结构由当前任务及用户评审决定。
- 原型工作流见[开发规范](../development/frontend/interaction-benchmark-workflow.md)：根据实际风险选择场景，不再要求固定六模块、48px Studio Bar、四主题、五剧本、用户四区布局或 DOM 1:1 映射。
- 交互认可、视觉确认、正式开发授权及真实后端/浏览器测试分别留痕。旧原型测试或 Markdown 不等于通过。

## 未完成事项

- [ ] 根据实际前端任务确认需要演示的交互与视觉方案（历史 UI-G0A：NOT APPROVED）。
- [ ] 用户明确许可后实施正式 React-admin 或其他后端工作；真实安全 E2E / UI-G3 未运行前保持 NOT RUN。
- [ ] 行为验收沿用[Admin 应用架构 X01～X18 索引](../architecture/applications/admin-console.md)，其中历史套餐克隆/冻结测试已取消。

此前 development/G0B 原型已删除的事实不变，不得因为本计划而恢复旧工程。
