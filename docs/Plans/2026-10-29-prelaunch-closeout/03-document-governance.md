# 03｜文档真源更新、过期清理与索引治理

- **状态**：PLANNED；**本文件只安排清理，不代表下面文件已经更新/删除**。
- **依据**：[审查报告 P1 文档/P2 历史污染](../../reviews/2026-10-29-aisencore-prelaunch-closeout-audit.md)、[文档治理规则](../../prompt/cleanup-outdated-docs.md)、[AGENTS](../../../AGENTS.md)、[唯一 TODO](../TODO.md)。
- **目标**：读者只接触一个当前业务/安全合同；本地已安装、已编码、真实运行、人工签收、云端 NOT RUN 必须明确区别。

## D01｜建立现行事实对照表（先于删除）

执行者再次确认当前 HEAD、本地迁移列表、实际 RPC/catalog/Edge/前端行为、关键测试结果。将每个被审查指出的断言分类：
- **CURRENT**：唯一现行需求/安全规则，写入 `docs/spec/`、`docs/architecture/`。
- **IMPLEMENTED LOCAL**：代码和本地迁移已存在，但需区分源码、SQL、真实 JWT/Chrome 证据。
- **OPEN/BLOCKED**：真实未关闭项进入 `docs/Plans/TODO.md`，专项只描述步骤和证明方式。
- **HISTORICAL EVIDENCE**：可保留测试日志/截图/必要安全不变量，但从“当前实施合同”退出。
- **OBSOLETE**：已由最新唯一决定取代且证据已转移，删除或仅靠 Git 历史回溯。

本审查确认的初始事实：`main@b715a32`、39 迁移在**本地**有记录（V4 `20261029210000` 已安装）、本地联调有多个历史真实切片 PASS；尚未签收完整第一/第二阶段，也没有远端部署/公开批准。执行时必须用**最新观察**更新，不将这段快照当永久真源。

## D02｜必须同步修订的当前文档

| 排序 | 文件与核查位置 | 具体修订任务 | 修订后的校验 |
| --- | --- | --- | --- |
| 1 | `README.md`：阶段状态、迁移数量、D2/D3 基线、`Current status` | 移除“准备第二阶段/真 Lens 尚未接线”等过期句；给出最新本地工程和明确的未签收/云端 NOT RUN；不要堆载完整历史日志 | 入口与 TODO/当前代码一致，不再宣称冻结安装 PASS |
| 2 | `docs/README.md`：旧 2026-10-24 工程状态 | 用短的当前事实摘要与最新审查/收尾计划链接替代过期计数和旧阶段描述 | 读者可跳转最新计划，不需读一串旧报告 |
| 3 | `docs/Plans/aisencore-mvp/00-mvp-master-plan.md`、`AGENTS.md`：Stage2 准备状态 | 更新核心阶段事实，保留“三阶段”和未签收不能当 PASS 的纪律；总计划不变成第二套 TODO | 不出现互相矛盾的“准备中/已联调” |
| 4 | `docs/Plans/TODO.md`：文件头基准 `92e7c03`、FB-02、重复历史日志 | 更新实际修复轮次/迁移状态：V4 本地已安装，真实删除 E2E/云端仍 OPEN；将 E01/E02/E03 无单独 ID 的阻塞映射为精简任务；成功历史移回专项证据 | 只留下 OPEN/BLOCKED、优先级/责任/退出定义/证据链接；不要标未运行项 PASS |
| 5 | `docs/spec/requirements.md:117–125` | 保留 V4 三队列、五类、永久删除单一合同；修正“删除迁移尚未持久安装” | spec 只描述已批准需求，事实标记精确 |
| 6 | `docs/architecture/domains/user-feedback.md` | 当前 V4 队列、RPC/Edge/图片删除/联系邮箱/最小审计与旧公开回复退场一致；不得继续说“当前 V3” | 与数据库实际权限、已批准 V4 和接口一致 |
| 7 | `docs/architecture/backend/public-api-and-saas-integration.md` | 移除 F06/R16 未安装、真 Lens 未接线、V3 为当前等过期描述；分离本地 S3/真 R2 的证据 | 唯一 API 真源和当前代码匹配 |
| 8 | `docs/architecture/current-main-architecture.md`、`docs/architecture/database/product-data-and-files.md`、`docs/architecture/infrastructure/tech-stack.md` | 修订 V3、R2/Edge 未做等过期状态；保留长期存储一致性/权限合同 | 不能将历史单图零图 Mock PASS 写成当前 Cloud PASS |
| 9 | `docs/Plans/README.md` 和 `docs/Plans/aisenlens-aisencore-local-integration/README.md` | 唯一活动入口调整为本收尾专项和当前 V4，旧 V3/V2仅列历史依据；更正第二阶段“所有工作包未跑”式过时状态 | 索引不出现多个当前合同/活动主控 |
| 10 | `docs/Plans/aisencore-mvp/2026-10-29-feedback-admin-ux-bulk-delete-remediation-plan.md` | 第 40 行“本地已安装”与第 42 行“尚未持久安装”矛盾；留下当前真实 E2E 未完成和新证明 | 不把 Deno check 或静态合同冒充删除 E2E |
| 11 | `docs/Plans/aisenlens-aisencore-local-integration/CORE-FEEDBACK-001-contact-email-design.md:3` | 将旧需求 V3 标题锚点换成现行 V4 章节锚点 | 全仓文档链接检查 0 错误 |

按具体修改任务逐文件复查，不凭这份计划盲目全文替换；更新作者/状态不能凭主观“看起来已经做了”。执行时受影响的 `apps/admin/README.md`、`docs/development/testing` 和 API 错误清单也需要按实际修改补齐。

## D03｜过期过程材料（先抽取、再收敛、最后删除）

**第一组：优先退出活动计划索引**：
- `docs/Plans/aisencore-mvp/fb-v2-inbox-workbench.md`：V2 五态/公开回复/旧 ZIP 过程，只保留不可替代的权限、ZIP 安全负例和历史测试出处。
- `docs/Plans/aisencore-mvp/feedback-v3-lightweight-implementation.md`：旧 P4“缩略图未做”、V3 四队列、旧客户端兼容等陈述已失效；真实 R2/读屏/性能仍 OPEN 要转至 TODO 与 V4 当前计划。
- `docs/Plans/aisencore-mvp/phase-transition-optimization-plan-2026-10-27.md`、`phase2-core-integration-contract-inventory-2026-10-27.md`：在新的唯一 API/执行细则中提炼仍有效的欠账与源码证据，历史阶段过渡不再主导日常开发。
- `docs/Plans/aisenlens-aisencore-local-integration/2026-10-27-cross-repository-audit-and-integration-plan.md`：所有者仍有效的决定在 spec/architecture、未测项在 TODO；审查快照保留引用或以 Git 历史追溯。
- `docs/development/testing/document-governance-audit-2026-10-27.md`：如没有唯一复现/安全事实，可从主入口退出，历史归档而不是业务规范。

**第二组：代码/测试命名候选，不在纯文档清理时强行删除**：
- `apps/admin/src/resources/FeedbackV2.tsx` 与 `FeedbackV3Editor.tsx`：当前代码仍有实际 V4 逻辑，先查 import/路由引用再决定改名，名称旧**不等于**可直接删。
- `apps/admin/src/resources/useFeedbackTags.ts`、旧 `admin_feedback_tags`、旧 `reply_to_feedback`/`admin_update_feedback`、`admin_screen_feedback`：先依据 [E02](./01-engineering-security-remediation.md) 取得 DB catalog、运行时与调用图证据，再决定删除或收窄；不为历史兼容保留可写旧路径。
- 既有 SQL 迁移和测试记录不按年代删除；如旧测试与新合同冲突，应将必要安全负例迁移到当前测试后再移除失效断言。

**第三组：证据资产**：`docs/Plans/aisencore-mvp/ui-evidence/` 下不同日期/版本的 JSON、PNG/JPEG，建立最小索引“当前准出依赖/历史对比/不可替代异常复现”；无来源证据不要仅因大而删。禁止删除未纳入 Git 的唯一工作文件。

每项建议删除的文件在实施记录中写：`原路径 → 仍有效内容 → 新权威落点 → 引用清单 → 保留/删除决定 → Git diff`；不凭“文件很旧”“还没有人读”直接删。

## D04｜文档校验门禁

1. `node scripts/check-doc-links.mjs` 全仓应 0 错，包含新增文件的相对路径与锚点；原审查 94 文档/889 文件链接/17 锚点/1 错，仅是旧基线，不能照搬当前总数。
2. 搜索“当前 V3”“第二阶段准备”“F06/R16 未安装”“尚未持久安装”“旧回复/标签仍是功能”等明确冲突，逐处区分历史引文与误导性当前声明。
3. 对照实际 API 签名、Edge 名称/路径、迁移版本、本地/云端状态与测试脚本；所有删除后引用、根/主题索引、TODO 链接必须更新。
4. `git diff --check`、检查 Markdown 表格/行尾/UTF-8/过宽路径；只在本次改代码时跑对应构建或测试，不用文档修改触发数据库写入。
5. 形成完成记录：实际更新/合并/删除/保留的清单；仍有歧义和 NOT RUN 项；用户/安全合同可复测；完成后**不保留一份新的永久重复任务台账**。

## D05｜完成定义

- `spec/architecture/development/Plans` 各有唯一责任，索引中只有真实活动计划；TODO 保留真实 OPEN。
- 此报告可作为历史基线留在 `docs/reviews/`，但不能在以后被当成实时项目事实。
- 0 个失效有效链接；对每一个建议删除文件都有可逆 Git diff 与已转移的有效内容证据。
- 不在缺少当前实现和权限核验时通过文档单独宣称旧 RPC 已关闭或生产已通过。
