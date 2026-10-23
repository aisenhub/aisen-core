1. admin前端设计：

   ::OBJECTIVE{site_design|pri:OVERRIDE_ALL}
     target: build page to award-tier visual standard
     ACCEPT: no visible improvement remaining across all CHECK dimensions
     BENCHMARK: Awwwards | Webby Awards | FWA winning entries

   ::CHECK{typography|standard:award_tier}
   ::CHECK{whitespace|standard:award_tier}
   ::CHECK{visual_hierarchy|standard:award_tier}
   ::CHECK{color|standard:award_tier}
   ::CHECK{motion|standard:award_tier}
   ::CHECK{micro_interaction|standard:award_tier}
   ::CHECK{responsive|standard:award_tier}
   ::CHECK{originality|standard:award_tier}

   ::LOOP{self_review|trigger:on_completion}
     [READ] current page against CHECK list
     [COMPARE] each dimension to BENCHMARK entries
     [IF] gap found => [PATCH] then re-enter LOOP
     [IF] no gap => [Ω]



1. **优先复用成熟框架，绝不手写造轮子**：

- 优先复用 `react-admin`（配合 `ra-supabase`）和 `Supabase Auth` 已有的成熟能力，只自行设计 AisenCore 特有的用户、产品、授权关系与必要的业务接口（`DataProvider` / `AuthProvider` 胶水层与受保护 SQL RPC）。
- 凡是 `react-admin` 已提供的列表 (`<List>`/`<Datagrid>`)、详情 (`<Show>`/`<TabbedShowLayout>`/`<ReferenceManyField>`)、跨表批量关联 (`<ReferenceField>`)、表单 (`<SimpleForm>`)、确认弹窗 (`<Confirm>`) 与全局状态 (`useStore`)，一律直接复用，严禁手写自定义表格、分页器、表单状态机或引入 Redux/Zustand/Tailwind 等第二套框架。



2. **样式与组件解耦（单一主题来源，低成本全站换肤）**：
   - 正式 Admin 的视觉 Token（配色、字号、间距、圆角、控件密度、亮暗）统一由全局 `theme.ts` 与 React-admin/MUI 官方 Theme 入口维护，业务页面不私造第二套主题。换肤能力是设计目标，**不是无需真实组件验证即可承诺的 100% 无损效果**。
   - 页面禁止硬编码品牌 HEX、另造组件样式系统或大量独立 CSS；优先使用官方组件、语义色和主题间距。确有必要的局部布局可使用引用 Theme Token 的最小 `sx`，按 `docs/architecture/applications/admin-ui-design-system.md` 管理，不能以禁止一切局部样式妨碍真实业务交互。



3. **Admin 原型验证与 AI 开发工作流（按风险分级）**：
   - Admin 正式实现以 React-admin/MUI 官方组件与当前业务、安全合同为准。原型只用于验证尚不明确的复杂任务、跨模块操作、高风险动作和异常恢复；已确定的小变更可以直接实现并回归，不强制制作全景原型或复刻某次示例。
   - 原型应清楚表达必要信息，使用合成数据，关键操作要产生可观察的状态变化而非假成功提示；可按实际任务需要采用 HTML、真实组件或其他适合的验证载体，不强制单文件、固定模块数、特定工具栏、主题、抽屉或视觉模板。辅助说明与生产业务界面应区分。
   - 原型通过不代表真实 RPC/RLS/MFA、安全、性能或无障碍验收。交互确认、视觉确认、正式施工授权及真实系统验证分别记录，不能在演示页面伪造批准；当前既有 UI-G0A 未获签收的事实不因文档清理自动改为 APPROVED。具体见 `docs/development/frontend/interaction-benchmark-workflow.md`。

4. **【UI/UX 强制原则：让界面自己说明问题，拒绝无效文案】** 优先通过清晰的信息层级、布局分组、对齐、留白、视觉权重、准确的主标签和明确的交互反馈，让用户直观理解“这是什么、能做什么、下一步是什么”。**禁止**用重复的副标题、次级标签、说明段落、提示卡或装饰性文字解释界面本来就能表达的内容；每段可见文案都必须提供必要且不重复的信息。**优先优化布局和交互，而不是增加说明文字**。但**不得以极简为借口省略**表单必需标签与单位、重要限制和操作后果、权限或错误提示、关键状态及无障碍可访问名称；复杂或高风险操作应在恰当位置提供简短、具体、可操作的引导。最终以**简洁、清晰、一致、易用、可访问**为验收标准。

5. **【不可逾越的强制规则：禁止过度设计与过度防御】** 开发任何产品代码时，**必须贯彻 KISS、YAGNI 和最小必要实现**：只实现当前明确且真实需要的功能，优先复用成熟框架和平台能力。**严禁**为了假设的未来场景预建通用框架、抽象层、插件机制、额外服务、复杂状态机、重复封装，或无现实风险依据地堆砌校验、try/catch、重试、兜底、回退和防御分支。不得以“以后可能需要”为借口增加复杂度。**但不得因此省略真实必要的身份鉴权、访问控制、输入校验、数据一致性、并发安全、幂等和错误处理**；以最简洁、充分且可验证的实现保障可靠性。发现更简单的正确实现时，必须优先收敛，拒绝无收益的复杂设计。

6. **【不可逾越的强制规则：明确上线前零历史兼容，完全按新项目开发】** **在项目所有者明确告知“项目已经上线”之前，AisenCore 必须始终视为全新、未上线的项目。所有代码编写、修改和重构一律不考虑历史兼容。** 严禁为了过去的计划、设计、旧代码、API/RPC 签名、数据库结构、迁移、配置、数据格式、客户端版本或测试样例保留向后兼容；**禁止**双轨实现、旧接口别名、兼容包装器、废弃代码保留层、旧数据格式转换、兼容开关、过渡迁移和仅为了旧行为存在的 fallback。旧实现与当前已批准的需求或架构冲突时，**只实现最新唯一有效合同，直接替换并移除过时路径，不得新旧并存**。不要为假设的老用户、历史数据或未来升级背负兼容成本。**必须以代码可靠、安全、正确、简洁、性能优秀为目标**，并保留真实必要的安全与正确性验证。**只有项目所有者明确说明已经上线后，才能重新评估兼容要求；旧文档、候选方案和开发者个人习惯无权豁免本规则。**