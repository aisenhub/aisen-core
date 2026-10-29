# Admin 全局滚动架构验收（2026-10-29）

## 背景与目标

用户报告长表格滚动时，页面整体、顶部顶栏及左侧导航背景一并移动。生产级目标：顶部 AppBar、桌面侧栏、列表页标题与筛选、操作工具条、表头和分页不随数据滚动。仅表格数据行在表格区域独立滚动。详情页及表单页没有数据表格，允许工作区内部滚动；窄屏保留触屏友好布局。

## 实施

1. `apps/admin/src/App.tsx`：RA Layout、appFrame、contentWithSidebar 设置为闭环视口高度（100dvh/64px），浏览器文档不再作为 Admin 滚动容器；工作区有自己的 overflowY，侧栏整个背景与菜单在固定外框内。
2. 列表页标记 `.aisen-admin-list-page`，桌面宽度 >=900px 的列表工作区关闭整页滚动；列表根容器 flex column、minHeight:0，标题/筛选/操作及分页放数据区以外，数据区 flex:1 且独立滚动。
3. RA `.RaDatagrid-tableWrapper` 是滚动层，表头 sticky；`ResourceWorkspace` 的 MUI `TableContainer` 是滚动层，Table 设置 stickyHeader；反馈三队列共用相同结构。
4. 根因补充：已安装 React-admin 5.15.5 的原生 ListView 根层实际 class 为 `.list-page`，不是 `.RaList-root`。只约束内层会让产品列表依然展开全部行；本次新增正确 class 约束和所有子级 minHeight:0，保证表格可收缩。

## 验证与限制

- Build、Lint 0 错误、`scripts/test-admin-sidebar-scroll.mjs` 静态合同、git diff --check 均 PASS。
- **真实本地 Chrome+AAL2**：`node scripts/test-admin-perf-aal2-readonly.mjs --scroll` EXIT0，覆盖管理审计、反馈收件箱和产品目录。测试仅在浏览器 DOM 中克隆行以模拟长表，均实现 table scrollTop=350px、window.scrollY=0、main scrollTop=0；顶栏、侧栏、工具按钮及表头前后坐标差 <=2px，数据行向上滚动超过 100px。脚本创建的临时 QA 管理员已由 finally 完全删除，不修改原有业务记录。
- 无敏感数据的数值证据：`docs/Plans/aisencore-mvp/ui-evidence/admin-global-table-scroll-2026-10-29.json`。
- 尚未覆盖远程站点、用户本人已登录窗口的实机视觉、各类弹窗/无表格详情及小屏断点人工签收。未提交 Git、未推送、未部署。
