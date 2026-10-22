# Admin 标准组件准入、页面模式及任务保护

> 用途：把参考通用 `components/contract.md`、`controls.md`、`patterns/*.md` 的可复用思想映射到 AisenCore Admin；字段/业务动作仍以 [D3-UI](../../Plans/aisencore-mvp-d3-ui-admin-uiux-design.md)、[D3](../../Plans/aisencore-mvp-d3-admin-infrastructure-design.md)、[F05](../../Plans/aisencore-f05-f08-contract-compatibility-readiness-design.md) 为准，视觉数值见 [UI-G0](../../architecture/applications/admin-ui-design-system.md)。

## 组件准入和变更审核

**先复用 → 再组合/最小变体 → 真正缺口才自写**：

1. 确认真实 Admin 操作、输入输出/状态及权限。先查当前锁定 React-admin/MUI 组件 API 与相关业务已有组合。
2. 直接使用标准 List/Show/Create/Edit/Dialog/Input/Button/Menu/Tooltip/Notification 等的**语义和状态**；验证当前组件是否能满足焦点、输入法、长文本、禁用/加载及错误恢复。
3. 若不能满足，优先在一个 `AdminLayout` / shared template 或 MUI `components` Theme overrides 中做最小扩展，沿用原库交互/键盘模型，不 fork 组件库。
4. 仍缺少**有证据的共同能力**才开发自有控件。申请记录：用途、现有库缺口、适用页面/状态、替代/风险、可访问性、截图、批准人和测试；不要因重复两次就抽成万能表单/页面生成器。
5. **安全限制独立有效**：客户端隐藏/禁用按钮不构成鉴权，任何受保护写必须走现有可信 RPC/Edge，不能视觉重构成直接 CRUD。

标准组件定义的是*交互、状态、可访问能力和 Theme 消费*，不包含产品 OAuth、AI 调用、套餐价格/扣费、数据库返回状态、恢复策略等业务逻辑。无需因为使用 MUI 就创建第二套 token/路由/数据缓存。

## 控件行为检查

| 控件 | 必要检查 | AisenCore 示例 |
| --- | --- | --- |
| Button/IconButton | 明确提交/导航语义、键盘可用、焦点/disabled/pending、防误双击；小图标不等于小热区 | 发码确认按 `request_id` 幂等，不能仅靠按钮 disabled 防并发 |
| TextField/Select/Autocomplete | 显示真实标签、受控值、输入法组合/粘贴、错误关联；小枚举不需要强加搜索 | 管理员邮箱有界查询、套餐 key 选择 |
| Form / field group | 显式保存时草稿与正式值分离、取消恢复、失败保留输入；未保存离开保护 | `admin_upsert_plan` **完整字段**提交，不把未填值隐式变 NULL |
| Menu/Popover/Tooltip | 导航命令与选择值区分；Esc/外部取消与焦点返回、窄屏/边缘定位 | 批次筛选、用户操作菜单 |
| Dialog/Confirm | 有可访问名称/焦点约束/关闭返回/长内容滚动；不可逆动作描述目标与结果 | 撤销授权/码、封禁用户/撤 Admin |
| Status/Notice | 空态、无筛选结果、失败、无权/断线是不同事实；显示可执行下一步 | 403 权限撤销 vs 503 暂时故障 |
| DataGrid | 只读列白名单、过滤/分页/排序、长字符串可查看、虚拟化真实度量 | 不显示 `code_hash` / 明文/用户 R2 备份内容 |

危险确认按真实影响决定，**不强制所有低风险、可撤销操作弹窗确认**；正常成功不必一律 Toast，避免冗余标签/说明，按 `AGENTS.md` 的“布局本身说明任务”原则减少噪声。

## 页面模式契约

| 模式 | 页面组合 | 完整任务验收 |
| --- | --- | --- |
| **列表 → 详情** | 有界筛选、分页、选中对象、只读详情/允许动作 | 回列表保留合理筛选、分页、滚动、焦点；删除/撤权后失效详情不可继续操作 |
| **显式保存表单** | 有清晰标签的分组字段、真实草稿、确认/取消、错误定位 | 保存失败保留输入、取消不提交 RPC、并发 409 提示当前真值 |
| **受保护登录/MFA** | 无业务 Shell 的登录/Enroll/Challenge + 后端资格核验 | `aal1` 不展示管理资源、无需日常每操作再次 TOTP |
| **危险管理操作** | 选择目标 → 复核影响 → 确认 → 真实结果/未知状态 | M1 最后管理员保护、理由及冲突、取消后无写入 |
| **一次性结果** | 发码预览 → 确认 → 首次成功才在**当前临时内存**展示码 → 用户保存 → 清理 | 不把明文放路由/历史/缓存/日志，超时 UNKNOWN 用原 request ID 核验 |
| **只读查询/审计** | 当前范围/最小字段、详情、权限与错误状态 | 不建“全量 auth.users”浏览、不给日志编辑/历史码导出 |

模式是*推荐组织原则*，不是必须给每页增加卡片、小标题、固定 CTA 或状态徽章。页面的布局不应比真实操作更复杂。
