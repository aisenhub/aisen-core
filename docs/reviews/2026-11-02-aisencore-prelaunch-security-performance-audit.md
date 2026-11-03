# AisenCore 上线测试前安全、性能与缺陷审查报告

> **最近复核**：2026-11-03；源码基线 `f4f0ec3`，本地新增整改迁移 `20261103090000`、`20261103100000`，共 43 项。沿用原文件路径，正文为复核后的有效结论与本地整改状态。
> **复核范围**：相关现行需求、架构、TODO、SQL 迁移与运行态函数、PostgreSQL 权限目录、4 个反馈 Edge Functions、Admin 调用者、测试、`supabase/config.toml` 及保留的本地容器日志。未重新执行全仓安全审计或生产验收。
> **权威依据**：[现行需求](../spec/requirements.md)、[开发约束](../../AGENTS.md)、[受保护 RPC 与锁序](../architecture/database/rpc-security-and-locking-contract.md)、[API 合同](../architecture/backend/api-contract-and-mvp-acceptance.md)、[反馈领域](../architecture/domains/user-feedback.md)、[唯一 TODO](../Plans/TODO.md)。
> **交付边界**：本次仅更新审查结论与项目修改建议，未修改业务代码、数据库权限、配置或数据。建议不代表已修复、阶段已签收，亦不授权云操作或发布。

## 1. 总体结论与证据边界

复核确认的问题已完成本地整改：序列及表/视图的多余权限已收紧，反馈重放不再生成无用缩略图且删除中错误已明确，产品创建和反馈预检已统一稳定错误。批次统计已完成一次聚合优化。真实云端、人工签收和部署门禁仍不因本地迁移通过而关闭。

通配 CORS 仍属于部署来源策略；授权恢复当前不依赖综合到期字段；邮箱大规模退化未证实；本地 502 的函数处理根因未复现，但启动阶段就绪竞态已有证据。这些内容不能全部计为已确认漏洞。

本次目录检查确认 `public/private` 共 88 个函数均固定空 `search_path`，但该配置不能单独证明所有对象劫持、授权或并发风险已消除。既有后端修复及历史 SQL 验证见[后端审查](./2026-11-02-aisencore-backend-supabase-audit.md)和[实施证据](../Plans/2026-11-02-backend-audit-remediation.md)；本次完成 554 项本地回滚断言，但未重跑完整锁序、JWT/RLS 或云端测试。

## 2. 复核结果与建议优先级

编号用于关联讨论，不表示每行均为已确认缺陷。P2 为应安排修复或调查的问题，P3 为低影响一致性或优化项；发布前权限收紧优先完成。

| 编号 | 当前结论 | 建议级别 | 项目动作 |
| --- | --- | --- | --- |
| S-01 | 序列 `UPDATE` 残留已确认；本地迁移已收紧现有及默认权限 | 已整改，本地待云端复核 | 回归有效权限/继承、反馈编号和 Pro 写入 |
| S-02 | 视图和基表 `Dxtm` 残留已确认；本地迁移已收紧 | 已整改，本地待云端复核 | 回归默认拒绝、匿名列白名单和管理读取 |
| S-03 | 预检前读取请求体、重放前生成缩略图；本地已跳过重放缩略图 | 已整改，本地待容量测量 | 保留最终配额与入口防刷验收 |
| S-04 | 通配 CORS 属实，未证实可独立绕过鉴权 | 第三阶段配置决策 | 按实际接入来源确定策略 |
| B-01 | 删除中的提交错误被映射为 `REQUEST_CONFLICT`，已复现；本地已返回 `DELETE_PENDING` | 已整改，本地竞态待补证 | 覆盖查询后删除竞态与客户端处理 |
| B-02 | 产品创建返回原生约束异常，已复现；本地已统一 PT422/PT409 | 已整改，本地待真实调用回归 | 保持名称 1～160 字现行合同 |
| B-03 | 两组只读 RPC 为 `VOLATILE`；本地已改 `STABLE`，恢复不依赖到期字段 | 已整改，本地待真实核查回归 | 不扩展无调用需求字段 |
| B-04 | 非法产品键在预检返回产品不可用，已复现；本地已统一 PT422 | 已整改，本地待真实调用回归 | 保留合法不存在产品的 PT409 |
| P-01 | 启动阶段 502/连接拒绝已在真实套件中复现；监听后函数请求未复现 502 | 启动竞态开放 | 核对目标就绪信号，不增加产品重试 |
| P-02 | 批次重复统计属实；本地已改为当页一次聚合；邮箱大规模退化未证实 | 批次已整改，邮箱待测量 | 保留大小写无关语义 |

## 3. 权限与请求资源开销

### S-01：序列残留 `UPDATE` 权限

**证据与影响**：运行态 `pg_class.relacl` 显示：

- `public.pro_credit_entries_sequence_seq`：`postgres=rwU/postgres, anon=w/postgres, authenticated=w/postgres, service_role=w/postgres`。
- `public.user_feedback_feedback_no_seq`：除上述授权外，另有 `aisencore_rpc_executor=rU/postgres`。
- `postgres` 在 `public` 下的序列默认权限仍向三个 Data API 角色授予 `UPDATE`；仅修已有序列不能防止再次出现。

`UPDATE` 允许 `nextval/setval`，属于多余权限。当前未发现公开 RPC 可让客户端任意选择序列执行这些函数，不能将目录权限等同于已证实的浏览器远程篡改。

Pro 的 `sequence` 是 `GENERATED ALWAYS AS IDENTITY`，见[账本定义](../../supabase/migrations/20261028230000_pro_credit_ledger.sql)，其自动生成与显式 `nextval` 的权限检查不同。[执行角色](../../supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql)还显式继承 `authenticated`，目录实测其当前有效 `UPDATE` 为真。当前写入成功不能解释为借用 `postgres` 表所有者权限。

**本地整改**：迁移 `20261103090000_prelaunch_audit_remediation.sql` 已回收两个序列对 `PUBLIC/anon/authenticated/service_role` 的多余权限，并收紧 `postgres/public` 默认序列权限；内部执行角色仅保留当前所需的 `USAGE/SELECT`。015 夹具验证有效权限继承和业务路径通过。

**验收**：用 `has_sequence_privilege` 检查有效权限与继承；隔离验证反馈编号、Pro 入账和 FIFO。若测试 `setval`，使用独立测试序列，不能修改真实业务序列；业务序列值变化不能靠事务回滚恢复。

### S-02：表/视图及默认权限残留 `Dxtm`

**证据与影响**：`admin_feedback_summaries` 的 ACL 为 `postgres=arwdDxtm/postgres, anon=Dxtm/postgres, authenticated=rDxtm/postgres, service_role=Dxtm/postgres`。16 张基表仍有 `service_role=Dxtm/postgres`，另一管理视图也残留服务角色权限。`Dxtm` 为 `TRUNCATE/REFERENCES/TRIGGER/MAINTAIN`；基表 `TRUNCATE` 应清除，但未证实存在可经 Data API 执行该 DDL 的路径。

反馈视图 18 列在 `information_schema.column_privileges` 中的 `REFERENCES` 是表级授权展开；各列 `attacl` 为空，不是另外存在 18 份列授权，也不代表匿名角色可以读取正文。

[最新迁移](../../supabase/migrations/20261102095028_backend_audit_remediation.sql)重建视图后仅追加 `authenticated` 的 `SELECT`，没有先回收默认多余权限。`postgres/public` 的表默认 ACL 也仍有残留；`auto_expose_new_tables = false` 不能代替实际 ACL 检查。

**本地整改**：同一迁移已清除现有业务表和管理视图的多余 ACL，并收紧默认表权限；保留受保护 RPC、RLS 和客户端列白名单。匿名 `products` 仍只开放 `id/product_key/name/description/status`，[基础权限测试](../../supabase/tests/database/001_core_foundation.test.sql)继续拒绝 `created_at`。

**验收**：检查对象、列和默认 ACL 的有效权限，隔离创建同类对象验证默认拒绝；确认匿名产品投影、AAL2 管理列表与服务角色专用存储 RPC 正常，同时禁止服务角色直接执行业务表 DML/清空操作。

### S-03：预检前请求体读取与重放无用缩略图

**证据与影响**：[提交处理器](../../supabase/functions/feedback-submit/service.ts)的顺序为：身份检查 → 有界 Multipart 读取/解析 → 原请求查询 → 配额预检 → 图片解码/缩略图 → 重放比较或新提交。超额账号仍可造成最多 7 MiB 请求体的读取/解析，但预检拒绝后不会继续解码图片。

已有原请求仍调用 `makeFeedbackThumbnail`，而重放仅将原图元数据交给 SQL 比较，缩略图不会上传。[图片模块](../../supabase/functions/_shared/feedback-image.ts)的 `validateFeedbackImage` 仍完整解码，使用它只能省去缩放和 JPEG 编码，不能宣称消除重放解码成本。

**本地整改**：`feedback-submit/service.ts` 的正常重放现在仍完整验证原图并计算内容键，但跳过缩略图缩放/编码和上传；删除中原请求在图片处理前返回 `DELETE_PENDING`。配额、字节/像素限制、SHA-256 和 SQL 不变参数比较保留。

入口防刷与成功提交配额分别评估。请求头前置预检仅是候选，必须与正文参数一致；重放豁免与并发同时通过预检仍可能发生，不能取代最终 L1 锁内配额检查，也不保证阻止资源消耗。优先验证平台现有入口限流能力，不新增独立服务或通用限流框架。

**验收**：超额请求在解码/存储前拒绝；0/1/2 图原号重放、异参冲突、损坏/超限图片、部分存储失败及并发原号请求均正确。另以受控流量测量内存、CPU 与时延；当前没有公开流量下的容量结论。

### S-04：部署来源策略

[共享响应](../../supabase/functions/_shared/feedback.ts)返回 `Access-Control-Allow-Origin: *`。接口使用显式 Bearer JWT，管理存储操作另校验 AAL2 与实时资格；没有仅凭通配 CORS 自动取得用户 Token 或绕过鉴权的证据。

**建议与验收**：第三阶段按实际 Admin、Lens 和其他接入产品的来源决定白名单策略；动态回显允许来源时添加 `Vary: Origin`。验证本地、正式 HTTPS、预检、拒绝来源和合法无 `Origin` 的服务端调用。CORS 不替代鉴权，不应未经需求确认便限定两个域名。

## 4. 错误合同与只读声明

### B-01：删除中的反馈错误被覆盖

**证据与影响**：删除中原请求的 `my_feedback` 返回 `recovery_only` 存在证明，`feedback_submit_core` 抛出 `PT409 / DELETE_PENDING`，但 Edge 两条提交分支均将 `PT409` 映射为 `REQUEST_CONFLICT`。直接调用生产处理器并注入该错误，复现 `409 REQUEST_CONFLICT`，且仍调用一次最终提交 RPC。

这是错误语义与无用处理问题，尚无数据损坏或越权证据。现行合同规定最小存在证明，尚未明确对外删除错误码和客户端恢复动作。

**本地整改**：反馈领域/API 合同已固化 `409 DELETE_PENDING`；处理器识别 `recovery_only` 并在图片处理前返回，最终提交分支也识别明确的删除错误。新增回归确认不写存储；查询后删除竞态仍需真实链路补证。未知 SQL/存储异常不透传。

**验收**：覆盖查询时已删除中、查询后提交前开始删除、新提交分支同号竞争、正常重放、真实异参冲突与未知服务故障；同步实际客户端处理和断言，UNKNOWN 不能随意换号重提。

### B-02：产品创建缺少参数与冲突业务错误

**证据与影响**：[创建内核](../../supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql)取得 L0 锁并鉴权后直接插入。定向 SQL 实测重复产品键返回 `23505`，空白名称返回 `23514`。表约束保护数据，但调用者收到原生异常。

[表约束](../../supabase/migrations/20261024011528_core_foundation.sql)与[创建页面](../../apps/admin/src/resources/ProductCreate.tsx)均允许名称去首尾空白后 1～160 字，没有现行简介 500 字上限；本次验证 121 字名称、501 字简介可创建，测试数据已回滚。

**本地整改**：创建内核现已在鉴权后按产品键正则、名称 1～160 字校验并返回 `PT422 INVALID_ARGUMENT`，重复键返回 `PT409 STATE_CONFLICT`；保留简介可选、L0、数据库约束和审计原子性。015 夹具覆盖原生错误已消失；真实 Admin HTTP 仍待补证。

**验收**：空/空白名称、160/161 字、合法/非法产品键、重复/并发创建、简介可选、鉴权拒绝和失败无审计；同步 `ProductCreate`、DataProvider 等实际调用者的错误断言。

### B-03：只读声明与授权恢复职责

[授权恢复查询](../../supabase/migrations/20261025002000_admin_grant_request_lookup.sql)及[受限用户查询](../../supabase/migrations/20261024045105_admin_user_lookup.sql)的 public 包装器与 private 内核共四个函数原为 `VOLATILE`。本地 `20261103090000` 已将它们改为 `STABLE`；这校正声明，不承诺显著加速。

恢复接口核对原管理员、原请求和原 Grant 事实；[Admin 调用者](../../apps/admin/src/resources/GrantCreate.tsx)不依赖 `effective_ends_at` 完成核查，未发现因此重复授权或恢复失败。

**验收状态**：015 夹具已检查四个函数的 `provolatile='s'`；恢复字段仍只表达原授权事实，不增加无人使用的 `effective_ends_at`。

### B-04：反馈预检产品键校验不一致

[预检内核](../../supabase/migrations/20261025144322_feedback_preflight_product_id.sql)只验证去空白后的长度；直接传入 `INVALID-KEY` 实测返回 `PT409 PRODUCT_UNAVAILABLE`。Edge 和当前 `my_feedback_core` 已有产品键正则，正式 Edge 会提前拒绝此类输入；当前 `feedback_submit_core` 本身不能作为已有同样正则的依据。

**本地整改与验收**：本地迁移已将预检统一为 `^[a-z][a-z0-9_]{0,63}$`，格式错误返回 `PT422`；015 夹具已通过非法键负例。合法不存在产品仍保持 `PT409`，身份、blocked、配额和原号语义未改。

## 5. 运行时与 SQL 性能

### P-01：本地 502 根因仍待复现

**日志证据**：下表时间均为 2026-11-02 UTC，直接比较原始日志。

| 时间 | 来源 | 事实 |
| --- | --- | --- |
| 10:38:19 | Kong | `feedback-export` 502，读取响应头时 `Connection reset by peer` |
| 10:41:24 | Kong | `feedback-export` 502，连接上游时 `Connection refused` |
| 11:27:31 | Docker inspect | 当前保留 CPU 日志的 Edge 容器创建 |
| 11:28:21 起 | Edge Runtime | CPU 软限、提前终止、Worker 创建超时等日志 |

CPU 日志晚于首个失败约 50 分钟，且当前容器此前尚未创建，不能证明该次 502 的成因。CPU/生命周期告警也未关联同一失败请求或在途 Worker；两类网关错误须分别调查。

源码确认[导出](../../supabase/functions/feedback-export/index.ts)串行读取最多 40 个附件，并受原图总量 20 MiB 限制；[删除](../../supabase/functions/feedback-delete/index.ts)串行处理最多 4 个对象。有等待成本，但未证实造成这些失败。[ZIP](../../supabase/functions/_shared/feedback-export.ts)使用 `zipSync(..., {level: 0})`，已避免压缩计算；打包、复制及哈希是否触限仍需实测。

**最小调查与修改建议**：

1. 保持 [TODO 的 `LOCAL-EDGE-502`](../Plans/TODO.md) 开放，关联请求时间、函数、Worker/Isolate、启动/退出、CPU/内存与网关错误。
2. 分别验证冷启动/重载、零图/有图导出和连续请求，区分客户端或测试进程终止、连接失败与实际资源触限；不以产品自动重试掩盖。
3. 先完成 S-03。若串行等待实测明显，再试验小规模受控并发并比较时延与峰值内存，不对 40 个附件无界并发。
4. 并发删除若实施，必须等本次全部对象操作结束再判断成功；任一失败保留删除意图，不执行 SQL 完成阶段，继续支持安全重试，不遗留响应后的未追踪异步删除。

父级 `supabase/functions/deno.json` 没有 imports 映射，入口使用完整模块说明符；没有证据表明补该文件的 `import_map` 能修复冷启动或 502。只有复现明确模块解析故障才调整该配置。

**2026-11-03 本地复核结果**：连续两次运行 `node scripts/test-fb-v2-export-http.mjs` 均完整通过。每次套件启动阶段 Kong 都记录了短暂的上游 `Connection refused`/502，Edge 监听后同一套请求返回 401/403/413/200；Edge 日志未显示函数处理期间的 CPU 软限或提前终止。当前证据支持“启动就绪竞态候选”，不支持 ZIP/图片处理是本次 502 的已证实原因。`LOCAL-EDGE-502` 继续开放，目标运行环境需补就绪信号与重载证据。

**验收**：对同一可复现条件比较修改前后结果，保留请求级证据和故障注入；继续验证撤权、对象缺失、部分失败、UNKNOWN 与审计。Deno 单元测试不等于 Supabase Edge Runtime 稳定性验收。

### P-02：批次统计与邮箱查询按实际负载优化

**批次统计**：[列表内核](../../supabase/migrations/20261029195000_redemption_single_use_admin.sql)每行分别统计已用与可用码，重复扫描属实。默认每页 20 条，RPC 允许最多 100 条；每批 1,000 码是负载样本，不是当前数据事实，不能据此承诺固定扫描量或时延减半。

**本地整改与验收**：迁移 `20261103100000_optimize_admin_code_batch_counts.sql` 已先分页，再用一次 `FILTER` 聚合计算两个计数，保持过期、撤销、已兑与产品停用口径。事务内 20 批×1000 码基准：旧实现约 45.2ms，新查询约 27.6ms；数据已回滚。真实多用户、云环境和更大规模仍未验收。

**邮箱查询**：运行态已有 `(instance_id, lower(email))` 复合索引及带 `is_sso_user = false` 条件的邮箱唯一索引。当前仅两个真实 Auth 用户，默认顺序扫描不是性能缺陷证据。关闭顺序扫描偏好诊断后，原 `lower(email)=...` 可生成复合索引计划，但缺少首列约束，不能据此证明大规模高效。

`email=... OR lower(email)=...` 在诊断中仍生成顺序扫描，即使关闭顺序扫描偏好亦然，不采用此写法；也不假定邮箱总是小写而改成大小写敏感比较。

**建议与验收**：保留大小写无关语义，在隔离规模样本、真实受限执行角色下测量查询/分页/计数，核对目标部署索引与计划后再决定调整。单人管理、小批次运营需求不足以单独支持十万用户规模的预建优化。

## 6. 实施顺序与第三阶段边界

### 6.1 本地整改建议

1. **权限**：S-01/S-02 同步收紧现有与默认 ACL，保留列白名单、RLS 和 RPC 精确授权。
2. **反馈**：联合处理 S-03/B-01，先明确错误合同，再删除重放无用计算并覆盖提交竞态。
3. **参数**：按现有业务边界修复 B-02/B-04；B-03 仅清理有依据的只读声明。
4. **调查/测量**：P-01 独立复现；P-02 依负载证据决定，候选优化不能当作已确认修复。

本轮已按该顺序完成本地文档、失败断言、最小迁移/Edge 实现与回归；后续真实竞态、云端和人工门禁仍按计划开放。保留实际迁移与安全测试，不增加历史兼容、数据转换或自动清库。

### 6.2 第三阶段配置与验收

- **SMTP/配额**：获授权后配置目标环境真实 SMTP，按服务商配额、公开注册和防刷需求确定限额；本地 `email_sent = 2` 不是生产最终配置，不能为解除限额任意上调。
- **域名/回调/CORS**：目标环境使用真实 HTTPS 站点与精确回调白名单，按 S-04 决定跨域策略；保留本地配置的本地用途，不直接改为生产配置。
- **连接方式**：按实际客户端/服务验证 Supavisor 和连接数。本地 `[db.pooler] enabled = false` 不构成云环境必须修改的缺陷；不能仅因使用 PostgREST/RPC 就要求额外启用本地事务池。
- **R2**：真实凭据只放服务端；目标环境不得启用 `local-test` 或保留测试 endpoint/测试访问密钥。验证 Bucket 私有、最小权限、短链、失败恢复与孤儿处理；本地 S3 夹具不代表真实 R2 通过。

阶段状态以[唯一 TODO](../Plans/TODO.md)与[三阶段总则](../Plans/aisencore-mvp/three-stage-delivery-gates.md)为准。不记录易失的工作区修改数量，也不将未经本次复测的跨仓构建阻塞写成当前事实。

## 7. 本次验证与未覆盖范围

| 检查 | 本次结果 | 证据限制 |
| --- | --- | --- |
| 数据库目录/定义 | 核对最新迁移、角色继承、序列/表/视图/默认 ACL、产品约束、只读声明与邮箱索引 | 本地目录，不代表云环境 |
| 定向 SQL | 修复前重复键 `23505`、空白名称 `23514`、非法预检键 `PT409`；修复后 015 夹具 29/29 | SQL 模拟会话；事务已回滚，测试产品残留计数为 0 |
| Edge 定向行为 | 修复前错误覆盖已复现；修复后删除中返回 `DELETE_PENDING`、配额拒绝先于损坏图片解码、重放不生成缩略图 | 处理器配合注入端口，不是真实云 R2/Runtime 竞态 |
| Deno 现有测试 | 最终 20/20 通过 | 本机 Deno/隔离夹具，不覆盖 502 根因或容量 |
| 邮箱计划 | 原条件可生成复合索引计划；候选 OR 仍顺序扫描 | 小表诊断，无大规模耗时/生产性能结论 |
| 容器日志 | 核对两类 502、容器创建与后续 CPU/Worker 异常 | 缺少失败请求的完整因果关联 |

复跑 Deno 的命令如下（PowerShell，使用现有安装与缓存，无新增依赖）：

```powershell
$env:DENO_DIR = 'E:\AppData\deno'
deno test --cached-only --no-lock --allow-env --allow-net --allow-read --allow-sys supabase/functions/tests
```

首次运行缺少 AWS SDK 所需的 `osRelease` 系统读取权限，出现 3 项失败；补齐 `--allow-sys` 后全部通过，未为测试修改业务实现。

**未执行**：完整并发锁/JWT/RLS 矩阵、查询后删除真实竞态、函数处理期间的真实 502 根因复现、浏览器/跨仓整仓验证、代表性容量压测、云 R2/SMTP/部署环境验收。已执行 554 项本地 SQL 回滚断言、Deno 20/20、真实本地 JWT ZIP 套件两次、Admin typecheck/lint/build。此次修改包含本地迁移、Edge 处理器、测试和相关文档；未删除业务文件或数据库数据。
