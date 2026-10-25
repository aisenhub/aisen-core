# AisenCore Admin 操作弹窗化实施方案（2026-10-25）

## 目标
四项操作弹窗化：新增 Pro 授权、发行兑换码、平台账号操作和新建产品；首页、列表、用户详情入口保持原页面上下文。受保护暂停/撤销保留原确认弹窗，详情/历史/检索保留独立页面。

## 改造与验收步骤
1. W0 读现有四种表单、入口和安全恢复状态；保存 dirty workspace，禁止修改 RPC/RLS/MFA。
2. W1 在 AdminLayout 安装单实例 OperationDialogProvider、OperationLink 和操作主 Dialog。普通点击打开弹窗，修饰键/新窗口及直接旧路由仍保留完整页面。
3. W2 四个原业务表单支持 embedded 模式，不复制业务逻辑；复用请求校验、reason、幂等 request ID 和安全确认。正常表单居中，手机全屏。
4. W3 安全关闭：忙碌禁止关闭；编辑后的放弃需确认；授权/发码 UNKNOWN 元数据持久化后允许显式稍后核查；明文未确认安全保存时禁止关闭。发码明文结果及批次撤销确认改为同一根弹窗内的状态面板，不允许嵌套弹窗。
5. W4 将 Dashboard 快捷操作、用户详情、10列表 action 和产品列表新建入口接到弹窗，保留原深链接和表格/筛选/滚动位置。
6. W5 编译、Lint、静态安全、构建包密钥、diff-check；真实登录 TOTP/AAL2 Chrome 回归，新增弹窗/直接路由/危险状态/320px 检查。
7. W6 同步 TODO 和原整改计划，未覆盖读屏、真实 200/400% 缩放、真机和八维人工设计签收不得自动写为通过。

## 安全边界
- UNKNOWN 结果不因弹窗隐藏而产生新请求 ID；只能只读核实后以原请求参数重试。
- 兑换码明文只展示一次，下载/复制后必须勾选已安全保存才能关闭结果。
- 账号操作保持受保护身份查找、账号邮箱、操作影响、理由、确认两步骤。
- 新建产品默认草稿，不更改产品状态/后端权限/审计逻辑。

## 状态
- [x] W1 共用 Dialog / Link
- [x] W2 业务状态接入
- [x] W3–W4 全入口与深链接
- [x] W5 自动化验证
- [x] W6 文档与未完成门槛（人工准出继续开放）

## 工程验收记录

- W1：在 `resources/OperationDialogs.tsx` 实现共享 Provider、OperationLink、单一根 Dialog，挂载于 AdminLayout。点击按钮保留原页面 URL、查询筛选及滚动上下文；Ctrl/Meta/新窗口和直接进入原4个URL仍走原完整页。
- W2：`ProductCreate.tsx`、`GrantCreate.tsx`、`IssueCodes.tsx`、`AccountActions.tsx` 仅增加 embedded、安全状态和成功回调，不复制或改写任何 RPC/MFA/幂等逻辑。普通成功后刷新当前列表并关闭，表单繁重解释和重复大标题不带进弹窗。
- W3：发码明文首次展示、TXT/CSV导出、UNKNOWN原编号核查、批次撤销均位于同一个根 Dialog；明文未确认安全保存前点击关闭，会得到错误提示且 Dialog 保持打开，不能叠加二级Dialog。UNKNOWN保持原request_id和只读核查/原参数重试，并支持明确“稍后恢复”。
- W4：`Dashboard.tsx` 快捷操作、`WorkspaceLists.tsx` 操作按钮、`lists.tsx` 产品新增、`UserShow.tsx` 账号治理与Pro入口已全部接入。用户详情触发的弹窗自动预填精确UUID，关闭后保留用户详情。
- W5：TS/Vite正式构建PASS，Oxlint 28模块**0 errors / 0 warnings**，源码边界27模块PASS、构建包静态秘密扫描PASS、`git diff --check` PASS。产品创建草稿Chip的axe对比度4.19:1问题已修正，新增弹窗自动axe扫描0违规，但有incomplete。
- W5：**真实TOTP/AAL2完整生产预览Chrome E2E最终exit 0**。专项验证了3个首页弹窗的唯一根节点/关闭后URL不变；2个用户详情弹窗的精确UUID；发码从列表弹窗实际新发、明文不能未保存关闭、真实TXT/CSV文件立即清理、URL/Storage无明文；UNKNOWN刷新后重开、已存在/不存在核对、同request ID唯一重试、批次撤销未嵌套Dialog。10类列表、8类详情、Pro 503/429、治理管理RPC、70组视口、匿名/AAL1拒绝和QA资源清理均PASS。
- W6：同步TODO、架构和第一阶段整改计划。保留全部未提交工作，不commit/push/deploy，不变更数据库、RLS、RPC、管理资格或长期演示资料。

## 尚未完成的人工门槛

NVDA/VoiceOver、完整键盘/Tab/关闭后焦点恢复、200/400%真实浏览器缩放、真机触控、axe incomplete以及八维视觉所有者签收仍OPEN。自动化PASS不代表第一阶段总签收。
