# AisenCore Admin Design｜前端开发设计专题指南

> **定位**：面向以后 AisenCore Admin React-admin/MUI 开发的**设计原则与具体执行指南**；源自对临时参考 `参考/design` 的有边界重构，**不是直接复制 AisenLens 的设计系统或已完成的前端代码**。
>
> **状态（2026-10-22）**：规范已建立，**未完成高保真设计、用户视觉签收、真实浏览器与组件运行验收**。`UI-G0A = NOT APPROVED / BLOCKED`；此目录存在不能释放 Admin 正式 Theme/Layout/业务页面编码。
>
> **技术选型**：Admin 继续使用 React-admin + MUI + TypeScript，保留 [Admin 业务设计](../../Plans/aisencore-mvp/aisencore-mvp-d3-ui-admin-uiux-design.md) 与 [D3 Resource/Provider](../../Plans/aisencore-mvp/aisencore-mvp-d3-admin-infrastructure-design.md)；不从参考项目引入 Tailwind、Base UI、shadcn、独立数据缓存/路由框架、AisenLens 专属主题和产品功能。
>
> **当前统一入口**：[frontend/README.md](./README.md)。本文件是其 Admin 设计专题细则，而非单独设计系统目录入口；字体/颜色/尺寸仍只由 [UI-G0](../../architecture/applications/admin-ui-design-system.md) 决定。

## 阅读顺序与单一权威

| 要解决的问题 | 唯一主入口 | 本目录如何使用 |
| --- | --- | --- |
| Admin 功能范围/权限/安全合同 | [正式需求](../../spec/requirements.md)、[D3](../../Plans/aisencore-mvp/aisencore-mvp-d3-admin-infrastructure-design.md) | 不通过 UI/规则改写业务状态、数据模型或 API |
| **品牌、字体字号精确候选、全局 Theme/布局/组件 Token、UI-G0 门槛** | **[Admin UI-G0 全局唯一视觉权威](../../architecture/applications/admin-ui-design-system.md)** | 这里不维护第二套 HEX、px 配色、主题运行值 |
| Admin 页面 IA/路由/业务动作 | [D3-UI 页面详细规格](../../Plans/aisencore-mvp/aisencore-mvp-d3-ui-admin-uiux-design.md) | 把规则映射到真实业务场景 |
| 设计原则/适用条件/验证问题 | [规则目录](./admin-design-rules.md)与机器可读 [admin-design-rules.json](./admin-design-rules.json) | 先按实际页面读取有关分类；保持原 `UX-*` ID 可追踪 |
| 文字/色彩/布局/密度/图标/动效的**通用方法** | [设计基础](./admin-design-foundations.md) | 细化“如何使用”而不是再定义 Token |
| 标准组件/列表详情/设置表单与保存模型 | [组件与页面模式](./admin-design-components-and-patterns.md) | 优先 React-admin/MUI，最小扩展，不写平行控件 |
| UI-G0 高保真前门禁 / UI-G3 真实浏览器验收 | [规则与页面验证矩阵](./admin-design-verification.md) | 标明证据/阶段/权威数据，不把设计或构建当视觉通过 |

### 基本执行协议

1. **先确认 UI-G0 实际批准状态**。截至本轮 NOT APPROVED / BLOCKED，只能进行设计、评审、参考稿准备；禁止正式 Admin Theme/Layout/业务页面编码。
2. 有具体任务时先读现有业务合同与 D3-UI，再查询本目录相关规则，最后检查 UI-G0 精确 Token、已批准视觉基准及版本。**不要无差别加载长篇设计原则手册**。
3. 对每个交互优先使用 React-admin/MUI **当前版本已有组件与能力**；其次组合/有限变体；真实缺口记录理由后才自行实现。原则上不建第二套组件/路由/表单/数据缓存。
4. **AI 不得自行更改全局字号/配色/密度/导航布局**。如需求违反规则：记录例外、范围、视觉/无障碍/安全影响，由项目运营者明确批准并同步 UI-G0 视觉参考版本。
5. 组件完成不等于页面完成，静态规则命中不等于浏览器体验通过。按 [verification](./admin-design-verification.md) 提交真实 screenshot/DOM/键盘/焦点/网络证据；在此之前保持 NOT RUN。
6. 遵守仓库根 `AGENTS.md`：**尽量通过布局本身表达信息，避免冗余次要标签、重复说明及过度装饰**。只有帮助操作/错误恢复所必需的说明才显示。

## 管理与未来维护

- `admin-design-rules.json` 是迁入的**机器可读规则唯一维护源**，`admin-design-rules.md` 仅维护分类路由，不重复 62 条规则正文；编辑需验证 ID 唯一、实际强度、适用范围及检查清单，不能把外部历史 `gate` 当 AisenCore 已启用的测试。
- 本目录不建立新主题编译器、npm 工具链、自动生成 `MANUAL.md` 或 Figma 文件。确实需要持续自动检查时，先锁真实 Admin SDK/运行版本，并增设有**可验证合法/违规案例**的本地检查；未实现前不能声称已部署 CI。
- 配色/字号/布局若改变，先更新 UI-G0 唯一规范及高保真参考，再同步真实 Theme 实现与相关截图；此处只更新通用规则/开发流程，不另写“参考项目的另一份主题”。
- 参考规则中 `must/should` 与缺陷优先级、`recommended` 不混淆。标注 `conditional` 的条目只在确有该功能时需要验收，**不因此给 MVP 新增 AI 代理、动画屏、拖拽、视频/导出等功能**。
