# Admin 页面布局重构施工跟踪（2026-10-25）

依据：用户确认的 `AisenCore_Admin_页面布局重构实施方案_2026-10-25.md`。此文件为代码执行记录，**不改变第一阶段准出标准**。范围：UI 表示层；不修改数据库、Auth/RPC、路由与权限。工作区包含上一轮未提交改动，所有变更原位增量编辑；不 commit/push/deploy。

| 包 | 当前任务 | 代码位置 | 验收 |
| --- | --- | --- | --- |
| W0 | 读取布局合同、确认旧页面与业务能力、复用已有生产预览截图基线 | 旧截图见 `ui-evidence/operator-*-1440.png`，新增浏览器几何门禁 | 旧表头和第一行 y 值另需实测；避免宣称无依据的基线改进 |
| W1 | 顶栏品牌左置，桌面取消品牌左方菜单按钮；中文分组、尺寸/间距/激活态、footer，移动抽屉开关品牌后 | `App.tsx`, `theme.ts` | AC-03/04/05/06 |
| W2 | 消除 Workspace 列表 Hero、英文标签、冗余范围白卡/第二个切换按钮；二级视图 + 单页 H1、数据工具栏；空状态不重复切全平台 | `WorkspaceLists.tsx`, `lists.tsx` | AC-01/02/05/07/10 |
| W3 | 精简详情页标题、ID/状态和返回路径，保留业务交叉链接与风险操作 | `WorkspaceDetails.tsx`, `UserShow.tsx` | AC-08/10 |
| W4 | 操作页压缩装饰性标题/侧栏，但保留所有表单内验证、UNKNOWN、发码明文和二次确认 | `OperationLayout.tsx`, 既有操作表单 | AC-09/10 |
| W5 | Build/typecheck/lint、安全扫描、真实 AAL2 Chrome；记录 1440px 首行位置、320/390/768/1024/1440 视口；失败修补 | `scripts/test-d3-authenticated-pages.mjs` | AC-01～11 自动部分 |
| W6 | 更新架构和 TODO/整改日志，分清实测与人工签收 | `docs/Plans/TODO.md` 等 | AC-12 人工未自动完成 |

**不删原则**：字段、排序/过滤/分页、错误/加载/空态、成员事件、账号精确查找、审计、高危确认、MFA、独立查询与一次性安全码。全局范围仅由顶栏切换；列表、空态均不再重复提供第二个全局切换入口。若无法完成完整读屏、真机、200/400% 缩放，应保留 OPEN，不冒称完成。

## 本轮实施记录

- **W0 完成**：比对用户提供的 1440/320 截图与 `App.tsx`、`WorkspaceLists.tsx`、`lists.tsx`，沿用本地真实 AAL2 Chrome 检查，保留其他 dirty workspace 工作。
- **W1 实施并实测**：品牌改为顶栏最左可视项，手机折叠按钮移到品牌后；桌面隐藏无意义的汉堡按钮，恢复旧会话下可能记忆的“侧栏关闭”；分组只显示「工作区」「业务管理」，移除中英双语；6项导航 15px/46px 和统一 32px 图标槽，底部环境缩成一行。**第二轮真实截图人工复核**发现手机 320px 的汉堡仍显示在 AC 前，已强化 `.aisencore-brand` 的 flex order，缩短手机 scope 文字；正式 Chrome `AC03_MOBILE_BRAND PASS`：logo 左12px，右边界53.59px，抽屉按钮起点55.19px/触控44px，选择器显示完整「全平台」。
- **W2 实施**：`WorkspaceLists.tsx` 删除装饰性英文 Eyebrow / 大段描述、重复的产品范围卡片和「查看全平台」按钮，压缩为领域内二级页签、单一页面标题（视觉使用当前页签；可访问 H1 保留）、行数+筛选+查询+主要操作，直接进入表格；空状态提示使用顶栏切换。`lists.tsx` 产品列表改为小型计数筛选按钮和紧凑查询控件。
- **W3 实施**：`WorkspaceDetails.tsx` 移除渐变大 Hero，改为面包屑、明确标题、记录编号及具名返回；保留实体关联跳转和全部高危 RPC 确认；User360 信息布局保留。
- **W4 实施**：`OperationLayout.tsx` 不再使用大幅英文宣传/安全操作侧卡，表单保持显著；额外操作流程收进语义化 `details`，各自危险操作 Alert/理由/UNKNOWN 一律保留。
- **W5 自动门禁 PASS**：TypeScript/Vite build 退出码0，Oxlint 0 warnings / 0 errors，源码边界 23 模块与 JS 静态密钥扫描 PASS，`git diff --check` PASS。**最新正式构建、真实管理员 TOTP/AAL2 Chrome 完整业务回归退出码 0**，25页/状态 axe 没有被自动检测出的违规（仍有 incomplete），70组视口/路由无整页横向溢出，原有 Pro/发码/治理 RPC、异常/幂等恢复、QA 数据清理继续 PASS。桌面 1440px 运营页表头 173–182px、首行 221–230px（优于 AC-02 的不晚于 440/520px）；左顶栏桌面原折叠按钮宽 0、品牌位于其右侧且为**首个可见**导航锚点。初次真实 Chrome 发现 320px 横向多出 16px，元素测量定位隐藏 H1 的 MUI `sx width:1` 实为100%和手机顶栏拥挤；修成 `width:'1px'` 并在 xs 视口隐藏非核心的全局 LoadingIndicator 后完整回归退出码 0。业务列表及移动导航的本地截图保存在 `ui-evidence/operator-memberships-1440.png`、`operator-grants-1440.png`、`operator-code-batches-1440.png`、`operator-navigation-redemption-320.png` 等。**移动 Logo 顺序修复后第二轮生产预览完整 AAL2 Chrome 回归仍 exit 0**，没有新增自动 axe 违规，QA 账号/产品均完成清理。

- **W6 工程记录已同步，人工验收仍开放**：已经记录上述截图路径与 E2E 几何证据，完成 TODO/第一阶段整改日志同步；手工读屏（包括 axe incomplete）、浏览器 200/400% 真实缩放、真机手势以及所有业务状态的八维视觉所有者签收仍 OPEN。此次不构成第一阶段准入第二阶段的许可。
