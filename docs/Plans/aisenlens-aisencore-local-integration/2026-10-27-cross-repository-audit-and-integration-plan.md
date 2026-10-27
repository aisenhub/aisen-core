# AisenLens × AisenCore｜双仓审查结论与本地对接实施方案

> **日期**：2026-10-27；**状态**：静态双仓审查 + 单点本地检查完成；**真实双端业务联调：NOT RUN**。
>
> **所有者最新决定（强制）**：AisenLens 现有后端相关页面、接口调用及其数据只是测试/预备实现，不要求 AisenCore 兼容这些临时实现。身份、成员、产品权益、兑换、反馈和云备份统一**以 AisenCore 的现行有效后端合同、数据模型、权限及真实结果为准**。当已确认的产品需求与旧设计/代码矛盾时，先在 Core 正式需求/架构中收敛唯一合同，再调整 Lens 的**后端相关**实现；不根据测试 UI 反向设计 Core。
>
> **修改边界**：Lens 仅允许后端集成有关模块和必要接线；严禁重构视频、AI、分镜、镜头校准、时间轴、播放器、导出、项目数据等其他业务。Core 是主优化对象。本文是审查及执行方案，不替代需求/API 真源、不授权代码/数据库/生产变更。

## 一、审查范围与现状

| 内容 | AisenLens | AisenCore |
| --- | --- | --- |
| 本地目录 | `E:\Projects\Aisenlens` | `E:\Projects\Aisencore` |
| 审查基线 | `main` / `c83de232` | `main` / `7735052e` |
| 技术结构 | React / Vite / TypeScript；本地优先；桌面/移动壳及引擎 | React-admin / Vite / TypeScript；Supabase Auth、PostgreSQL/RLS/RPC、Edge、可选 R2 |
| 已有后端相关实现 | 账号、权益、反馈、模板备份测试 UI；尚无 Core 实际会话适配 | Auth/成员/Pro/兑换和反馈 V3 已有 SQL/Edge；模板云备份未编码 |
| 工作区 | 已有未提交改动 | 已有未提交改动 |

直接审查过的主要文件包括 Lens 的 `apps/webapp/src/features/auth/`、`features/feedback/`、`features/config-backup/`、`App.tsx`、`WorkspaceSettingsDialog.tsx`、`vite.config.ts` 与当前账号需求；Core 的 `supabase/config.toml`、核心/兑换/反馈 SQL 迁移、三个反馈 Edge、Admin 配置和阶段文档。**CODED（静态有代码）≠ RUNNING（服务启动）≠ E2E PASS（双端业务通过）**。

上一轮实际只读探测（历史现场，不承诺现在持续相同）：`127.0.0.1:55321/auth/v1/health` 返回 HTTP 200、Lens `127.0.0.1:8443/` 返回 HTTP 200、Core Admin `127.0.0.1:3000/` 当时未监听。两仓分别运行 `pnpm run typecheck`、`pnpm run lint` 和 `git diff --check` 均通过。**未运行本轮真实 Lens→Core Auth/邮件/RPC/Edge/R2/E2E、数据库 pgTAP 重跑或完整性能验收**；历史测试报告不能冒充本轮结果。

## 二、推荐架构和分工

`AisenLens（本地业务） → Supabase 官方 Auth SDK / 最小 RPC 与 Edge 适配 → AisenCore Supabase（Auth、RLS、可信 RPC、Edge） → PostgreSQL / 私有 R2`。

- **Core 拥有**：统一身份、平台限制、产品成员、产品级 Free/Pro 事实、Grant/兑换、反馈与管理员权限、云备份鉴权/配额/存储一致性、正式错误码及 DTO。管理操作只对当前有效管理员和 AAL2 开放。
- **Lens 拥有**：不依赖云端的本地项目/媒体/视频/时间轴/分析/AI/模板编辑与导出；后端相关页面仅消费 Core 的可信结果。Core 不存拉片视频、项目、时间轴、AI 请求结果或用户 API Key，也不承载 Lens 的具体功能额度。
- **单轨合同**：不新增 Node 中转后端、第二套 JWT/会员权限、旧 RPC 签名别名或为模拟页面保留兼容层。产品级 Pro 由 Core 确定；需要在 Lens 的 AI/导出/项目创建等**非后端业务入口**实际设置权限门槛时，必须先提出越界影响与最小改动并单独获得授权。

## 三、审查发现与优先级

| 等级 | 已核实发现及文件证据 | 对接整改 |
| --- | --- | --- |
| P0 | Lens `features/auth/AuthForm.tsx` 的 `onSubmit` 可选；`AuthPage.tsx`、`AccountSettingsContent.tsx` 未提供正式后端回调 | 只替换后端接线/会话；按 Core Supabase Auth 的真实状态执行 |
| P0 | Core `supabase/config.toml` 的邮件 `site_url`/`additional_redirect_urls` 覆盖 Admin `localhost:3000`，未覆盖 Lens 默认 `8443` | 增加精确 Lens 回调，验证注册确认/找回密码 |
| P0 | Lens `AccountSettingsContent.tsx` 传给权益面板的 `access`、`onRedeem`、`onRefresh` 未连接服务 | 以 Core `check_access` 与 `redeem_code` 真实响应为准 |
| P0 | Core 只有 `feedback-submit`、`feedback-image-access`、`feedback-export` Edge，未有 AisenLens 模板备份专用 Edge/RPC | Core 实现专属安全备份服务，不误用反馈图片通道 |
| P0 | Lens `configPackage.ts` 当前模板包 `aisenlens-analysis-template` v1，本地限制 5 MiB；旧 Core S1 仍出现多类别恢复、不同云端限额候选 | Core 先冻结正式云端单一合同；Lens 当前测试 UI 不能单独决定云端参数 |
| P1 | Lens `WorkspaceSettingsDialog.tsx` 的正式 `FeedbackForm` 未传 `onSubmit`；`FeedbackForm.tsx` 尚无 0/1/2 图 | 先零图，后含图，连接 Core V3 实际收件与本人查询 |
| P1 | Core `functions/_shared/feedback.ts` 从 `R2_ACCOUNT_ID`/密钥直连 R2，虽有 S3 测试辅助 | 为本地含图联调设隔离对象存储，审计失败/孤儿/重放，不泄露密钥 |
| P1 | Lens `ConfigBackupPanel.tsx` 的 `CloudBackupItem` 持有整个 `ConfigPackage` | 云端列表只取小型元数据，选中版本再下载正文，保留既有本地恢复 |
| P1 | Core 早期联调资料还写着“AisenLens 代码未核实” | 本次已核实双仓路径、主要测试组件和静态入口；真实互通仍 NOT RUN，后续需更新旧叙述 |

### Core 现有真实函数签名（本地源码静态核对）

| 接口 | 当前合同重点 |
| --- | --- |
| `get_my_products()` | 本人已加入产品概览，不自动创建成员 |
| `ensure_membership(p_product_key)` | 首次合法接入；`left`、`suspended`、`blocked` 不自动恢复 |
| `check_access(p_product_key)` | HTTP 200 可包含 `allowed:false`；只返回产品级准入与 Free/Pro，不接受 Lens `capability` |
| `leave_product(p_product_key)` / `rejoin_product(p_product_key)` | 本人明确退出/重入，不等于登录/登出或自动恢复 Pro |
| `redeem_code(p_product_key,p_code)` | **两参**；HTTP 200 可包含 `ok:false,code`；不是 HTTP 失败 |
| `my_feedback(p_request_id?)` / `my_feedback_events(p_feedback_id)` | 本人有限反馈 DTO，不暴露 R2 key 或内部管理备注 |
| `feedback-submit` Edge | JWT、邮箱已确认、`product_key`、UUID `request_id`、`content`、`category`、最多两图 |
| `feedback-image-access` Edge | 有权限的本人/管理员临时图片读取 |
| `feedback-export` Edge / `admin_feedback_v3` RPC | 仅 AAL2 Admin，可受控处理四队列与 ZIP；普通 Lens 禁止调用 |
| 模板备份 | 专用可信 Edge/RPC **未实现** |

具体 SQL 证据：`supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql`、`20261024033040_redemption_and_grant_rpcs.sql`、`20261025131845_feedback_trusted_rpcs.sql`。唯一 API 权威为[公共 API 契约](../../architecture/backend/api-contract-and-mvp-acceptance.md)；更完整的已有签名盘点见[Core 静态清单](../aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md)。

### 统一错误语义

| 场景 | 后端为准的 Lens 行为 |
| --- | --- |
| HTTP 200 + `allowed:true` / `ok:true` | 才可展示该业务成功 |
| HTTP 200 + `allowed:false` / `ok:false` | 展示可信拒绝 reason/code，不误判网络异常 |
| 401 / 403 | 会话或权限拒绝；保留本地项目和模板 |
| 409 | 读取最新状态/冲突版本，不能覆盖 |
| 429 | 依据 Core 限流/重试约束 |
| 503 / 超时 / 无响应 | 标记不可核验或 UNKNOWN，不能当成 Free、已取消 Pro 或写入失败；关键写操作应按同一 `request_id` 查询/恢复 |
| 无网/匿名 Free | 本地免费业务不应因 Core 故障被锁死；不在启动时强制创建云用户 |

## 四、AisenCore 必须重点修改的位置

| 路径 | 改动建议 | 优先级 |
| --- | --- | --- |
| `supabase/config.toml` | 本地 Lens 8443 邮件回调、URL 与服务隔离，绝不下发 secret | P0 |
| `supabase/migrations/` | 安全确认成员/Pro/兑换/权限、实现备份 owner/配额/幂等/版本/事务 RPC | P0 |
| `supabase/functions/` | 模板云备份专属 Edge、大小/类型/完整性校验、安全对象操作 | P0 |
| `supabase/functions/_shared/feedback.ts` | 本地存储隔离、条件写、授权读、重试/孤儿对象对账 | P1 |
| `apps/admin/` | 真产品 key、管理发码与撤权、反馈 V3 Admin 交叉验证 | P1 |
| `supabase/tests/database/` | RLS/错误状态、并发、跨产品/跨用户、撤权、幂等 | P0 |
| `supabase/functions/tests/` | 反馈/备份 0/1/2 图、对象故障、未知完成状态与重放 | P0 |
| `docs/spec/`、`docs/architecture/`、`docs/Plans/TODO.md` | 决策与实际代码/验收结果同步唯一合同，不保留冲突的旧文档 | P0 |

### 私有模板云备份推荐最小链路

1. Lens 从当前上下文读取一套完整**已生效分析模板**，复用本地 `configPackage.ts` 的正式包；任何测试 UI 包字段不得成为 Core 权威。
2. Core 确认 JWT、blocked、产品成员、Pro、允许的格式/字段、对象大小/散列；服务端只处理安全必要的数据合同。
3. 可信 RPC 在数据库中按本人、产品、`request_id` 原子验证配额与幂等，创建 `pending` 预留。
4. 私有 R2 对象唯一写 `If-None-Match: *`，成功后可信 RPC 转 `ready`；失败明确释放预留或登记待对账。
5. 数据库和 R2 不是同一 ACID 事务：覆盖 R2 写成功/DB finalize 失败、DB 已提交/HTTP 响应丢失、重复同号与异参冲突、孤儿不可读与定期安全回收。
6. 云列表返回名称/时间/字节数/版本/状态等少量元数据；选中才申请私有短期下载，Lens 使用现有本地解析、完整模板差异预览和个人模板恢复，不改现有项目快照、媒体、答案、AI Key 或本机其它设置。
7. **尚待 Core 定案**：U09/U10/U11、JSON 白名单、云端最大字节数、版本数/保留期、离线 Pro 允许启动什么任务、到期后取回/删除、撤权窗口。Lens 本地包当前 5 MiB、其 r4 需求目标 20 份，以及旧 Core 计划的 256 KiB/10 份等均是需对照的输入，**不是本方案擅自冻结的新云端正式政策**。旧 Core “多类别勾选/分类恢复”不应反向覆盖已确认的分析模板唯一备份范围；冲突在 Core 当前合同裁定并同步。

## 五、AisenLens 严格修改边界

**可改且仅限后端对接**：

- `apps/webapp/src/features/auth/`：官方 Supabase Auth SDK、Session 与当前产品成员、权益、兑换适配；可替换临时状态/测试回调。
- `apps/webapp/src/features/feedback/`：真实反馈提交、上传图像、本人受限查询、明确失败/重试。
- `apps/webapp/src/features/config-backup/`：云元数据、创建/列举/取回/删除的适配；**不可改变已验证的本地模板存储语义**。
- 单一后端网络服务、`.env.example` 中公开的 Supabase URL/Publishable Key、契约测试、`app/App.tsx` 与设置弹窗内必要的 Auth/后端接线。
- 现有 `AccountPreviewPage.tsx` 是 DEV 模拟预览，不能把其假成功当成真后端证据。

**严禁未经另行授权触碰**：视频播放/解码、自动分镜、镜头校准、时间轴与编辑器状态、AI 执行和 Provider 管理、项目数据库结构/保存、视频/结果导出算法、其他非后端业务界面。游客第二项目登录门槛、AI Pro 执行限制、视频去水印等若必须改这些模块，应先列出越界点和最小方案，**不得将仅“UI 显示 Pro”虚报为功能权限已落地**。

## 六、六批实施路径和退出门禁

| 批次 | Core 主导工作 | Lens 的最小接入 | 实际准出 |
| --- | --- | --- | --- |
| 0. 环境与合同 | 固定两仓版本、JWT/URL/key/CORS/回调与隔离数据库，冻结共享 DTO/错误及备份未决参数 | 本地 `8443`、前端 env、真实页面接线点复核 | 无生产秘密、合同唯一且运行实例身份清楚 |
| 1. Auth/成员 | Supabase 邮件/刷新/RLS/blocked/成员 RPC 负例完善 | 官方 SDK、注册/确认/登录/登出、合法首次加入 | Lens 实际操作 → Core Auth/RPC/DB，401/旧会话/切号/离线通过 |
| 2. Pro/兑换 | Grant、到期/撤销、`check_access`/`redeem_code`、限流/同号恢复 | 真实权益数据、兑换与不可核验状态 | Admin 授权撤销后 Lens 正确，拒绝和故障均可复现 |
| 3. 反馈 | Edge + 隔离对象存储 + Admin V3 与失败对账 | 先零图，再 1/2 图、本人查看 | 上传/私图/四队列/ZIP、跨账号、403/409/429/503、重试 |
| 4. 模板云备份 | Core 专属 RPC/Edge、配额、条件写、对账/删除 | 仅接入云操作，复用现有模板包和恢复 | 上传/列表/下载/恢复/删除/版本冲突/断网重放 |
| 5. 总回归 | RLS/JWT/DB/Edge/性能、P0/P1 处置和证据整理 | 后端相关页面回归；验证原拉片核心不受损 | I/R/REV 适用用例和所有者签收，不以 Mock 代替真 E2E |

建议**首轮代码实施先完成批次 0 + 1**：用 Lens 正式页面注册登录，获得 JWT，合法执行 `ensure_membership('aisenlens')`，调用 `check_access('aisenlens')`，登出后原有本地项目保持完整。阶段切换仍须遵守[三阶段交付门禁](../aisencore-mvp/three-stage-delivery-gates.md)：第一阶段尚有正式签收/遗留问题；第二阶段真实双端尚未执行；第三阶段才允许另行授权后配置云环境和部署。

## 七、联调最低验收矩阵

| 场景 | 正向结果 | 必测反例 |
| --- | --- | --- |
| 匿名 Free | 原本地工作流独立可用 | Core 离线不能破坏项目或强制上传素材 |
| Auth | 注册/确认/登录/刷新/恢复/登出 | 失效邮件、过期/旧 JWT、切号、迟到响应 |
| 成员 | 首次加入幂等、本人产品概览 | left、suspended、blocked、跨产品越权 |
| Pro | 授权、撤权、到期、实时复核 | 200+`allowed:false`、503/UNKNOWN、跨账号旧缓存 |
| 兑换 | 合法码、重复处理 | 错码、限流、HTTP 200+`ok:false`、响应丢失 |
| 反馈 | Lens 0/1/2 图 → Core → Admin V3 | 本人权限、附件私有、重放、R2 失败、ZIP/回收 |
| 云备份 | 完整单包上传/列举/取回/恢复/删除 | Key/视频拒绝、配额、同号冲突、R2/DB 部分失败 |
| 不回归 | 原项目、分析、模板本地导入导出、免费导出保持原样 | 登出/注册/云故障不能重写、删除本地内容 |

每项记录两端版本、运行时配置、隔离测试账号、操作步骤、脱敏 HTTP/RPC 摘要、数据库/Edge 状态、错误注入、PASS/FAIL/NOT RUN、测试数据清理界限。现有已记录的 pgTAP/Chrome/Mock PASS 只作背景，不替代本次真实联调。

## 八、文档责任和本次状态

- 本文保留**审查结论与实施顺序**；[`docs/Plans/TODO.md`](../TODO.md) `LENS-01～07` 是唯一未完成任务清单，不在本文件创建第二份可勾选任务账本。
- 长期接口、产品及安全权威仍是 [当前需求](../../spec/requirements.md)、[架构](../../architecture/README.md)、[公共 API 合同](../../architecture/backend/api-contract-and-mvp-acceptance.md)；如需变更，先更新它们与真实实现。早期[Core 侧盘点](../aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md)记录的是单仓审查时 Lens 尚未核对的旧事实。
- 本次仅保存 Markdown 资料并维护索引；未清理两仓已存在未提交文件、未改代码、未迁移/重置数据库、未调用生产服务、未提交/推送或部署。
