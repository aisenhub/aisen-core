# 参考设计系统 → AisenCore Admin 规范：迁移取舍与来源记录

> 原始参考来源（**不是新规范运行依赖**）：项目根曾存在 `参考/design`，2026-10-22 用户授权选择性迁入 62 条规则并删除临时参考副本。第一次整理时保存在 `docs/development/admindesign`；用户随后明确要求**全部并入现有 `docs/development/frontend`，不保留独立设计目录**，当前以 [frontend/README.md](./README.md) 为唯一入口。
>
> **不等于视觉批准**：迁移后的规则、文档、检查矩阵只是计划和规范；没有高保真设计页、MUI 运行样式、浏览器实测或用户确认，**UI-G0 NOT APPROVED / BLOCKED**。

## 1. 原材料事实（删除前核对）

源树共 **56 个文件**：Markdown **35**、TypeScript **12**（其中 10 个规则分类模块 + 1 个 schema + 1 个 index）、JSON **5**、PNG **4**。设计原则共 **62 条唯一 ID**，分为 visual/layout/content/navigation/forms/feedback/motion/a11y/performance/workflow 十类。

原目录入口 `README.md`、`foundations`、`components`、`patterns` 和 `rules` 是通用方法；`products/aisenlens` 包含另一个项目选定的深色默认、主题与轮廓、字体/双语、视频工作流等产品选择，不是 Admin 已批准的产品视觉。

**迁入物与对应来源**

| 管理目的 | 新唯一落点 | 来源材料采用边界 |
| --- | --- | --- |
| 原 62 条原则 ID/摘要/强度/场景/建议检查问题 | [admin-design-rules.json](./admin-design-rules.json) | 以**静态 JSON 数据解码**从 10 个 `.ts` 规则列表提取，不执行 TS；删掉旧项目 `adaptation`、示例代码、原仓库 `enforcement.gate` |
| AI/开发者按需分类查询 | [admin-design-rules.md](./admin-design-rules.md) | 用 JSON 分类/适用性检索，不迁入另一个项目生成的大型 `MANUAL.md` |
| 颜色、排版、间距、浮层/动效使用原则 | [admin-design-foundations.md](./admin-design-foundations.md) | 角色和验证法；**具体 Token 不复制**，以现行 UI-G0 为准 |
| 控件准入和页面模式 | [admin-design-components-and-patterns.md](./admin-design-components-and-patterns.md) | 先用 React-admin/MUI，再组合/扩展；交互与保存依据 AisenCore RPC/权限 |
| 四类高保真页及真实 E2E 检查 | [admin-design-verification.md](./admin-design-verification.md) | 规则到登录/发码/套餐/用户/成员映射，区分 UI-G0 审批和 UI-G3 浏览器验收 |

## 2. 刻意不迁入的技术和业务

- **AisenLens 产品固有内容**：当前 WebApp/Tailwind/Base UI/shadcn 的源码、文档指令、CSS 类名、历史运行证据、项目密度三档/偏好、深色默认、视频/时间轴/报告导出/AI 工作区、专属字段、主题图。
- **4 张 PNG**：仅代表原产品已选风格或候选对比，不是 Admin 基准高保真页，删除临时副本后不重新引用/复用。
- **生成/安装工具**：`@google/design.md` 版本、`pnpm` 工作区路径、原项目 `verify:docs`、设计规则 CLI 和 TS 编译能力。Admin 未安装或运行这些命令。
- **参考中无效的跨仓库链接**：原 `README.md` / `products` / `MANUAL.md` 有大量指向未复制 spec/apps/plans 的相对引用；不照搬为 AisenCore 文档断链。
- **历史测试声称**：原设计中“通过”的 CSS/浏览器/中英文/密度与字体证据仅属于原产品，不转记为 Admin 通过。
- **不提前添加功能**：62 条中三条标为 `conditional`，不意味着 Admin MVP 需要拖拽、自动轮播/持续运动或 AI 提供商操作。
- **不再搭一套配色规范**：Admin 全局品牌/数字 Token/UI-G0 gate 仍由 [architecture 单一权威](../../architecture/applications/admin-ui-design-system.md) 维护；此目录不与它冲突。

## 3. 来源身份、验证和迁移后治理

`admin-design-rules.json` 的 `sourceRuleFiles` 记录迁移前 10 个规则分类模块内容 SHA256，以便追踪原 62 条；但不需要保存原 `.ts`、运行原工具或以产品源码路径追溯已删除副本。

| 核对项 | 当前结论 |
| --- | --- |
| 62 条规则的原 ID | 原迁移已逐条比对唯一 ID/分类/强度和检查问题；二次目录合并必须原 JSON 字节不变 |
| 技术栈污染 | 应无 AisenLens/Tailwind/Base UI 运行依赖或旧项目命令/软链接 |
| UI-G0 视觉批准状态 | **NOT APPROVED / BLOCKED** |
| 原 55/12/10/18/12 项历史和新增测试 | 仍均 NOT RUN，不能因为规则迁移当作通过 |
| 目录删除 | 原 `参考/design` 已在前次验证通过后删除；本轮仅在二次验证通过后删除旧 `development/admindesign`，保留当前 `frontend` |

**备注**：这些规范仍需与 AisenCore 真实代码/浏览器实施和用户视觉基线批准连接。若以后有第二个实际消费者，可重新讨论“跨产品共享包”；现在本目录只服务 Admin。
