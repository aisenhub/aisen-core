# AisenCore × AisenLens｜本地对接总执行计划

> **2026-10-27｜状态：所有者明确进入第二阶段本地联合开发。** Core 本地测试数据先备份后清理，仅保留管理员与 `aisenhub`/`aisenlens` 两个 active 产品；R-16/F06 两个迁移已应用到本地 55322，209/209 pgTAP 在回滚事务内复验通过，真实 GoTrue JWT→Edge→PostgreSQL 零图反馈已通过。Lens 正式身份/反馈客户端未完成，1～2图/私有 R2 测试仍未验；第一阶段遗留人工验收仍 OPEN，第三阶段云端部署未获授权。本文是本次双仓对接的总执行入口，**隶属[MVP总计划](../aisencore-mvp/00-mvp-master-plan.md)**，不另建第二份平台总计划或需求真源。

## 1. 目标、完成定义与权威

本次完成的结果：使用AisenLens正常WebApp入口，真实调用AisenCore的Auth、成员、产品资格/安全历史、兑换、单向反馈和完整分析模板私有备份；Core/Admin能够核对同一用户、产品、Grant、反馈及对象状态，异常和响应丢失可恢复，原本地项目和免费工作流不受损。

业务/安全以[Core需求](../../spec/requirements.md)、[API](../../architecture/backend/api-contract-and-mvp-acceptance.md)、[身份会话](../../architecture/applications/auth-and-multi-saas-sessions.md)、[计费](../../architecture/domains/billing-and-entitlements.md)、[反馈](../../architecture/domains/user-feedback.md)、[文件备份](../../architecture/database/product-data-and-files.md)为准；Lens目标见其仓库 `docs/spec/account-and-cloud-settings.md` r5。[双仓审查F01～F08及10项决定](./2026-10-27-cross-repository-audit-and-integration-plan.md)提供问题证据，代码决定实施现状，不反向推翻已确认需求。

**本次不实现**AI Pro业务门槛、视频去水印、第二项目登录门槛、支付/爱发电、桌面/移动壳、SSO、项目云同步、反馈中心/历史/进度/回复页。它们不能计入本轮PASS；发布也不能宣称排除项已实现。允许必要登出/切号凭据锁定、会话Key释放、任务收尾或明确取消、旧响应失效，不改AI/Provider/项目算法。

## 2. 基线与实际差距

| 项目 | 本次规划的静态输入 | 不能据此声称 |
| --- | --- | --- |
| Core | `E:\Projects\Aisencore`，HEAD 4f698d5；已有Auth/RLS/成员/Grant/兑换及反馈SQL/Edge/Admin；工作区还有未提交文档和并行代码修改 | 当前环境已运行、第一阶段已签收、所有合同已实现 |
| Lens | `E:\Projects\Aisenlens`，HEAD 1c678df；当前Auth/反馈仍为测试回调，完整分析模板本地导出/个人恢复已有实现；有未提交文档 | 已持有Core会话、云操作或新Pro业务门槛已落地 |
| 已确认、待实施 | 同产品有效永久Pro拒兑其他码且不耗码；Auth昵称；最小生命周期接线；20份备份、到期取回、完整个人恢复 | 新SQL保护、专属备份服务或真实联调已通过 |
| 已采纳、待实测 | 单份5MiB；本地权益快照暂按最多15分钟；反馈当前大小/频率/短URL参数先用于隔离测试 | 参数已经达到生产运行指标或成为离线许可证 |
| 第一阶段余项 | GATE/UI/PERF/AUTH/DB/FB实际待办及审查F05/F07等独立缺陷 | 用历史测试数量、构建成功或当前文档确认代替验收 |

每个工作包开工重新记录两仓HEAD、工作区差异、所用运行版本和环境身份；以上是规划快照，**不是固定到旧提交开发**。保留现有未提交/并行工作，不reset/clean，不回退其他人的代码。

## 3. 三阶段及文档分工

| 交付阶段 | 详细执行入口 | 对应唯一TODO | 准出 |
| --- | --- | --- | --- |
| 第一阶段：Core/Admin独立交付与签收 | [01 对接前准备与验收](./01-stage1-core-readiness.md) | GATE-01、UI-01/02、PERF-01、AUTH-01、DB-01、FB-01，及LENS-02/04的独立后端修正 | 独立功能/安全/视觉/WCAG/响应式/性能全部有证据，所有者正式签收 |
| 第二阶段A：身份、成员、资料与生命周期 | [02 身份与成员](./02-stage2-auth-and-membership.md) | LENS-01～03 | 正常Lens入口真实Auth/RPC闭环，登录不自动加入，切号不串数据 |
| 第二阶段B：资格/历史与兑换 | [03 权益与兑换](./03-stage2-entitlements-and-redemption.md) | LENS-04 | 真Grant/安全历史与UI一致；业务拒绝、同码恢复、R-16和并发通过 |
| 第二阶段C：单向反馈 | [04 反馈](./04-stage2-feedback.md) | LENS-05、FB-01跨端部分 | 0/1/2图到Admin V3、原号恢复、私图/ZIP及故障闭环 |
| 第二阶段D：完整模板私有备份 | [05 模板备份](./05-stage2-template-backup.md) | LENS-06 | 专属服务、20份/权限/条件写/对账/个人恢复及5MiB实测 |
| 第二阶段E：全链路回归与签收 | [06 综合回归](./06-stage2-integration-acceptance.md) | LENS-07 | 本轮范围真实双端与适用I/R/REV通过，所有者签收 |
| 第三阶段：经授权的线上验证 | [07 云端与发布](./07-stage3-cloud-and-release.md) | DEPLOY-01～03、对应DEC项 | 单独云端许可后完成部署端验证，公开上线再获独立批准 |

第二阶段A～E是同一交付阶段内的工作包，不是额外五个交付阶段。旧D1/D2/D3/S1/D4仍为技术索引，不改变[三阶段门禁](../aisencore-mvp/three-stage-delivery-gates.md)。

## 4. 依赖、顺序与首个可交付切片

执行顺序：第一阶段独立修验/签收 → A身份 → B权益兑换 → C反馈 → D备份 → E总验收 → 第三阶段许可与实施。C不依赖Pro购买或active成员，D依赖可信资格；A通过后，C/D的独立服务端工作在不冲突、且实施任务有明确边界时可交错推进，资源紧张默认串行，不以并行跳过门禁。

第一阶段签收前可以做：静态合同/差异、测试设计、Core单端隔离修复与验证、独立环境准备、Lens离线基线记录；不能开始Lens→Core正式业务联调。本轮仅启动第一阶段 R-16 Core 独立修复与回滚式 pgTAP 验证；Lens→Core 正式业务联调及其他工作包均未启动。

**第一阶段之后的首个双端切片**：Lens正常入口注册→Mailpit确认→登录→读取真实本人会话；确认注册/登录/只读查询不建成员；local登出后另一应用会话仍有效，本地项目/模板不变。成员RPC先用真实本人JWT独立验证，首次真实业务建成员在B兑换或D主动云操作中验收，反馈例外在C验证；不为演示加入而新增测试按钮或把后续模块作为A的隐含依赖。

## 5. 两仓责任与修改范围

| 责任方 | 负责 | 允许修改的典型位置 |
| --- | --- | --- |
| Core后端 | 身份/产品/成员/Pro事实、可信兑换/RLS、反馈和专属备份的安全/幂等/配额/对象一致性 | `supabase/migrations/`、`supabase/functions/`、`supabase/tests/database/`、必要测试脚本与权威文档 |
| Core Admin | 真实产品/成员/Grant/发码、反馈V3与私图/ZIP，单一React-admin/MUI主题 | `apps/admin/src/auth/`、`data/`、相关`resources/`与`theme.ts`；不另建UI框架 |
| Lens集成 | 官方Auth会话、后端DTO/错误映射、正常页面最小接线、云适配/恢复与账号隔离 | `features/auth/`、`feedback/`、`config-backup/`，`app/App.tsx`、`features/editor/components/WorkspaceSettingsDialog.tsx`必要接线 |
| Lens边界例外 | 登出/切号复用现有保险库lock/会话Key释放和任务完成/取消入口 | 仅所需调用者与测试；不得增加AI权限门控、重写Provider、任务或项目存储 |
| 所有者 | 第一/二阶段正式签收，正式运营参数、注销渠道和第三阶段/公开上线许可 | 只对具体结果/风险及范围作决定；不重复审批已确认的20份等业务方向 |

不创建Node中转、通用权限/上传/备份框架、第二套JWT或全局状态库。不兼容测试RPC/包格式；代码/文档/调用者/测试同次收敛。现有依赖优先，实际新增依赖前按对应仓规范核验，不在计划期安装软件。

## 6. 环境、数据与命令约束

- Core常用本地API55321、Admin3000、Mailpit55324；Lens默认8443为HTTP。必须核对实际实例/端口/issuer/签名键/公开key/allowlist/CORS；不因端口号当成HTTPS，不把Admin默认site_url盲改成Lens。
- 两仓包管理版本分别按各自packageManager（Core pnpm12.15.0，Lens pnpm11.24.0）；不统一升级。安装支持自选路径时用 `D:\APP\Codex\<软件>`，缓存 `E:\AppData\<工具>`；不得主动安装到C盘/默认目录。
- 测试前列出合成身份/产品/对象前缀及清理边界。第二阶段数据须由Lens实际操作产生，可用测试账号，但不能用seed冒充业务结果。已有本地/用户数据不删除、不reset；测试清理只涉及本包明确创建的QA对象。
- 密钥/JWT/明文码/用户JSON/私图URL不进文档、截图日志或前端构建。客户端仅公开URL/publishable key，可信服务端保管秘密。
- 对工具/CLI先核对安装与help，命令可用才执行，不用临时拉取最新版替代环境复现。本轮 R-16 已在已运行的本地数据库上以整笔回滚事务执行 005 pgTAP；不重置数据、不启动未知服务；真实 JWT/HTTP 与其余工程测试未执行。

| 已存在的验证入口 | 使用条件 |
| --- | --- |
| 两仓各自 `pnpm typecheck`、`pnpm lint`；Core `pnpm build` | 代码实施后按受影响范围执行，记录工作目录/退出码 |
| Lens `pnpm build:webapp`、`pnpm verify:webapp` | UI改动执行既有WebApp构建门；预算/入口检查按现有脚本，不降低阈值 |
| Core现有SQL/HTTP/Chrome/Edge测试 | 每个详细计划列出可复用入口；有身份/数据副作用的脚本先读前置环境与清理范围 |
| Core `node scripts/check-doc-links.mjs` | 文档相对链接/锚点检查 |
| Lens `node scripts/verify-docs.mjs` | 文档文件链接检查，不验证锚点；必要时加相关目录锚点检查 |
| 两仓 `git diff --check` | 每个工作包交付前，不替代真实运行 |

## 7. 交付、证据和失败处理

每包按“权威文档→先失败的可观察测试→最小实现→删除已证实无用路径→复验”执行。测试应覆盖用户结果、数据库/对象实际事实和拒绝副作用，不靠源码字符串证明鉴权/幂等；Mock只定位故障，不代替签名JWT和真实客户端。

涉及运行性能的包按[测试规范](../../development/testing/README.md#性能判定与基线)在开工前固定场景/测量口径并取基线，正式实现前冻结目标和允许退化范围；[综合验收](./06-stage2-integration-acceptance.md)汇总复测，不到验收时补造基线或阈值。

证据最小字段：任务/用例ID、日期、两仓HEAD与未提交差异、运行版本/环境标识、测试身份类别、步骤及脱敏请求/响应、DB/对象/审计断言、故障注入与恢复、命令/退出码、证据路径、PASS/FAIL/NOT RUN、未覆盖项、验收人。后续证据复用现有测试报告/截图目录，不在本次预建一套证据平台或空目录。

- 业务拒绝与服务故障分开；HTTP200需看allowed/ok；反馈首次201/重放200；读失败不可核验，写结果不明才UNKNOWN。
- 恢复按接口：成员看当前关系；兑换同用户/产品/码；反馈本人/产品/原request_id/原参数；备份同号状态与hash/参数。不能通用添加request_id、换号盲重试或伪造成功。
- 发现权限绕过、重复消费、误删、串号、秘密泄漏即停止对应包准出；先定位最小原因，复验后继续。不放宽测试、不隐藏警告、不把故障当Free。
- 回退先保留工作和证据，停止本包入口/测试流程并只修本次变更；不得以清库、重置全仓、删除整个bucket作为回退。具体代码/DB回退以实施时真实差异和数据影响审查。

## 8. 状态、决定与计划生命周期

**唯一开放任务清单仍是[TODO](../TODO.md)**；本文及各阶段的编号仅定位步骤/验收，不建立第二份勾选台账。执行结果写回各详细计划的验证记录，再由TODO链接；仅 R-16 回滚事务中的 SQL pgTAP 已执行；其余新增场景 NOT RUN。

已定：范围、20份/正常服务留存/到期取回、单向附件反馈、有效永久Pro拒兑、Auth昵称及最小生命周期接线。5MiB/15分钟已采纳待实测，具体白名单/错误字段由实现前合同固化；不重复询问这些业务方向。

待相应阶段决定：正式发码数量/有效期/永久码权限、反馈正式留存/回收/反刷、价格/爱发电、域名/SMTP/真实R2、备用管理恢复责任；**注销具体渠道留待上线前确定，未定不开放成功申请按钮**。缺哪项只阻塞对应能力，不能阻塞已确定的本地Auth/兑换/反馈准备。

完成的包先将长期规则/可复测证据和剩余工作放回正确权威位置，再收缩或移除失效施工步骤；保护真实迁移/测试及唯一证据。计划创建不授予Git提交/推送、云连接、部署、公开上线或数据删除权限。
