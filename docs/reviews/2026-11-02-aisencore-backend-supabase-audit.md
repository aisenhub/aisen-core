# AisenCore 后端与 Supabase 审查（2026-11-02 复核版）

> **范围**：当前未提交工作区、审查时40项/修复后41项迁移、4个反馈Edge入口及共享模块、Admin适配层、现行需求/架构、Git历史及本地PostgreSQL实际目录。
> **数据库**：仅 `supabase_db_Aisencore`，宿主端口 `55322`，PostgreSQL 17.11；不连接远端。
> **最新授权**：所有者在审查和清理完成后，追加授权制定详细计划并修复全部确认缺陷。当前实施见[修复计划](../Plans/2026-11-02-backend-audit-remediation.md)。
> **阅读方式**：§1～8保留修复前发现、复现和清理证据，其中缺陷/建议/OPEN均描述修复前快照；当前修复结果以§9和修复计划为准，不能将旧复现脚本用于新结构。
> **权威**：[需求](../spec/requirements.md)、[开发约束](../../AGENTS.md)、[数据库安全与锁序](../architecture/database/rpc-security-and-locking-contract.md)、[唯一 TODO](../Plans/TODO.md)。下一步上线测试不等于已上线，也不构成云端操作或公开发布授权。

## 结论与优先级

原报告发现了真实缺陷，但将若干既定设计、缺少执行计划的性能推测与配置整理项升级成 P0，并给出可能破坏现行合同的整改 SQL。本版保留有效发现，撤回错误定性，不保留两套整改合同。

- **优先修复 P1**：删除中反馈的本人/图片读取隔离；Edge 服务故障误报 403；首次已读递增业务版本；直授首响/重放字段不一致；本人恢复 DTO 继续引用废弃状态。
- **P1 待明确权限合同**：永久删除 prepare/finish 可由管理员 JWT 直接调用，数据库无法据此证明 R2 已清理；不能仅靠隐藏 Token 宣称保证了跨服务删除顺序。
- **P2 收敛**：死标签调用/参数、无用变量、冗余索引、邮箱 CHECK、关联一致性约束、函数 volatility、配置与文档过时描述。
- **需实测后决定**：Dashboard 按成员调用摘要、批量循环、候选索引、RLS OR 条件。源码存在这些写法，不足以证明达到 P0 或既定负载下不可接受。
- **撤回的方案**：直接恢复 Grant 排队窗口；取消管理写 L0；任意“5 秒”时钟容忍；直接收回 invoker 视图所需列权限；因缺少函数配置段判断接口未启用；根据旧注释推导 TOTP 必须 Pro 套餐。

## 1. 数据模型与迁移

### 1.1 历史迁移修改与 contact_email CHECK：部分成立

**确认**：提交 `ed71ad5af8` 修改了已存在的反馈迁移，加入 `contact_email` 并替换提交签名。Supabase 不会因文件内容改变而自动重跑已登记版本，因此这种做法存在漂移风险。当前本地 catalog 已有该列、现行七参数提交函数和全部 40 项登记，不能把历史风险写成“当前列缺失”。

**确认**：邮箱格式和长度在可信提交 RPC 校验，表本身没有相同 CHECK。普通 JWT 没有直接 DML，因此不是可直接利用的 P0。

**建议**：后续变更使用正向迁移，核对完整有效结构和函数定义，不能只看版本数量。可增加“非 NULL 值必须符合当前格式”的表级 CHECK；现行合同允许已保存事实缺失，新提交必填由可信入口保证，不盲目加 NOT NULL 或回填。不得以本项为由重置或重放当前数据库。

依据：[反馈基础表](../../supabase/migrations/20261025125835_feedback_foundation.sql)、[提交 RPC](../../supabase/migrations/20261025131845_feedback_trusted_rpcs.sql)、[联系邮箱合同](../Plans/aisenlens-aisencore-local-integration/CORE-FEEDBACK-001-contact-email-design.md)。

### 1.2 V4 遗留与本人 status：成立，但清理须区分数据和入口

**缺陷**：`my_feedback_core` 对 inbox 返回 received、archived 返回 recorded，workbench 返回旧 `f.status`。新反馈的 status 为 NULL，V4 triage 不写旧五态，因此工作台 DTO 可以返回 NULL。

**建议**：先确定单向提交/UNKNOWN 恢复需要的最小 DTO，再同步 RPC、调用者和行为测试。不要直接发明 processing 承诺；进入工作台并不等于对用户承诺处理进度，Lens 本期没有进度中心。

**可清理**：`useFeedbackTags.ts` 已无调用，仍引用已删除的 `admin_feedback_tags`；`admin_feedback_v3` 仍接受始终拒绝非空的 `p_tags`，编辑器仍传 NULL；过程变量与旧列读取可以在同一次调用链修改中移除。

**不可直接采用原建议**：

1. 旧 status/tags/公开回复/事件可能承载历史事实。停用写入口不意味着历史事实无用；本轮清理旧测试数据已授权，但不是批准任意结构重构。
2. `feedback_v3_queue_guard` 限制队列转移，`prevent_feedback_obsolete_mutation` 冻结删除中记录并禁止旧动作，职责并不相同。
3. `CHECK(queue_state IN (...))` 不能限制 OLD→NEW 转移，也不能替代删除冻结。整理触发器必须保留这两项行为。
4. 删列必须同步视图、DataProvider、详情、导出模块、事件读取与测试；不要只 DROP COLUMN。

依据：[本人投影](../../supabase/migrations/20261027151000_feedback_scoped_recovery.sql)、[V4 内核](../../supabase/migrations/20261029213000_feedback_v4_retire_legacy_rpc.sql)、[DataProvider](../../apps/admin/src/data/dataProvider.ts)、[导出](../../supabase/functions/feedback-export/index.ts)。

### 1.3 兑换关联的复合外键：成立，属于一致性改进

现有单列外键不能在数据库层禁止：兑换事实引用其他产品的码/Grant，或码和批次产品不一致。当前可信兑换函数会构造正确关联，未证实普通 JWT 可越权写入。

建议核对现存关联后增加 `codes(batch_id,product_id)`、`redemptions(code_id,product_id)`、`redemptions(grant_id,user_id,product_id)` 的必要复合约束。已有 Grant 三元唯一键可复用；避免保留被新外键完全取代的冗余约束和无收益索引。负例测试应证明跨用户/跨产品关联被拒绝。

依据：[兑换 schema](../../supabase/migrations/20261024025852_entitlements_and_redemption_schema.sql)、[账本 Grant 身份外键](../../supabase/migrations/20261029002000_pro_credit_grant_identity_fk.sql)。

## 2. 索引与查询计划

### 2.1 缺失索引：部分成立，撤回固定数量与“必然全扫”

- 批次缺少产品/创建时间索引、成员月新增缺少 joined_at 范围索引、redemptions 缺少产品前导索引，均为真实候选。
- `redemption_code_batches(created_by,request_id)` 已覆盖 created_by 前导查询，不能再列为“缺失”。
- 已有 `product_memberships(product_id,status,user_id)` 可先缩小产品范围，缺 joined_at 不是“完全没有可用索引”。
- 多个操作者外键缺少前导索引属实，但其重要性取决于真实账号删除/查询流程，不能一律定 P0。
- **更正上一轮口头复核**：`last_handled_by` 最初是 RESTRICT，但后续 `20261026080818` 已改为 **ON DELETE SET NULL**；本地 catalog 同样是 SET NULL。原报告这一点正确，上一轮只看初始定义的反驳撤回。
- 产品前导索引不能同时保证全平台创建时间排序。外键存在、索引缺失和实际 Seq Scan 是不同证据。

建议以真实产品/全局查询执行 `EXPLAIN (ANALYZE, BUFFERS)`，再选最小索引集；不整张清单机械建索引。

依据：[后续外键变更](../../supabase/migrations/20261026080818_feedback_v3_handler_lifecycle.sql)、[批次查询](../../supabase/migrations/20261029195000_redemption_single_use_admin.sql)。

### 2.2 重复与反馈索引：兑换冗余成立，反馈候选需对照现有索引

本地 catalog 确认以下三项无额外唯一性或排序收益：

- `redemptions_code_user_unique(code_id,user_id)`：已有 `UNIQUE(code_id)`。
- `redemptions_code_created_idx(code_id,created_at)`：每个 code_id 最多一行。
- `redemption_codes_batch_state_idx(batch_id,batch_ordinal)`：与已有唯一约束索引列完全一致。

建议后续移除上述冗余；废弃 status 索引随字段收敛处理。已有 `user_feedback_queue_created_idx(queue_state,created_at DESC)`、`user_feedback_queue_product_updated_idx(queue_state,product_id,updated_at DESC)`，原报告遗漏。是否补全局工作台更新排序或产品创建排序，要先测真实 SQL，不重复建设已有能力。

## 3. RPC、账本与并发

### 3.1 Grant 与信用账本：撤回“时间脱节 P0”，保留响应缺陷

当前有效实现将 Grant 作为独立入账/来源事实，`pro_credit_entries` 管理消费/撤销，摘要给出当前综合 `effective_ends_at`。两个 30 天 Grant 的单笔终点相同、综合余额为 60 天，本身不构成权益错误。

Admin 实际列表显示“已入账/已撤销”；详情明确区分历史覆盖终点和综合到期；User360 已用服务端摘要。因此“到第二个月后台所有记录显示过期”的原结论与当前代码不符。

**真实缺陷**：`admin_grant_entitlement_core` 首次响应含 effective_ends_at，幂等重放分支没有。建议明确该字段是当前摘要还是首次快照，并让首响/重放保持同一结构；不因补字段新增第二套计算器。移除两个未使用的 `v_anchor` 等变量。

**不要采用**：把当前综合终点写回每笔 Grant，或恢复按旧排队窗口计算实际余额。永久冻结/撤销后连续接续时，固定历史日期不能表达当前可用余额。

依据：[账本](../../supabase/migrations/20261028230000_pro_credit_ledger.sql)、[授权列表](../../apps/admin/src/resources/WorkspaceLists.tsx)、[详情](../../apps/admin/src/resources/WorkspaceDetails.tsx)、[User360](../../apps/admin/src/resources/UserShow.tsx)。

### 3.2 Dashboard：逐成员调用成立，严重度与部分“全扫”未证实

`pro_members` 对符合条件的每条成员关系调用 `pro_credit_summary`；摘要内有三次 SQL 读取和 JSON 构造，是扩展性候选。10,000 条符合条件成员关系会产生数量级相应的内部查询，但不是 30,000 次网络请求，也不能未经测量认定 P0。

`auth.users + EXISTS` 可被优化器转换为连接；SQL 文本不足以证明必然逐用户全表扫描。反馈计数不使用 attachment_count，视图内附件标量子查询可能被裁剪，不能断言每条反馈都会执行附件聚合。

建议对照原摘要口径实现集合统计候选，覆盖永久、有限余额、过期、撤销、blocked、产品暂停、成员状态和全局去重；先证明结果相同，再比较真实计划/P95。不要引入缓存、预计算服务或第二套权益权威。

依据：[Dashboard SQL](../../supabase/migrations/20261029191000_admin_dashboard_new_pro_month.sql)。

### 3.3 时钟：撤回已复现故障和任意 5 秒容忍

三个生产结算调用者（直授/兑换/撤授）都在相关锁后以 `clock_timestamp()` 调用 settle；事务时间的只读路径调用 summary，不会触发 settle 的逆序异常。不能用“同一项目用了两种时间函数”推导普通请求一定 CREDIT_TIME_ORDER。

写入改成锁前事务时间反而可能在等待期间落后于已提交 settled_at。建议保持锁后可信时间；只读 STABLE 摘要可统一事务快照。真实时钟回拨另列边界测试和运维观测，未明确计费语义前不随意吞异常、不设无依据的 5 秒阈值。

### 3.4 首次已读：版本回归成立，L0 不是现行合同漏洞

V4 的 `admin_mark_feedback_read_core` 更新 read_at 时递增 version，与旧已读约定及 ZIP 快照注释不一致。导出读取快照后发生首次已读，就可能得到 EXPORT_CHANGED_DURING_GENERATION。

建议只取消业务 version 递增并保持返回值一致，补“首次已读不影响并发导出/编辑”的行为测试。**保留当前 L0/L1/行锁与鉴权顺序**；L0 用于协调撤权/封禁，不是反馈行锁的重复。改变它必须先调整长期合同并做真实双连接撤权竞争验证。

依据：[V4 已读](../../supabase/migrations/20261029213000_feedback_v4_retire_legacy_rpc.sql)、[锁序](../architecture/database/rpc-security-and-locking-contract.md)。

### 3.5 批量发码/撤码：可优化，不先拆安全锁

最多 1000 次单条 INSERT/UPDATE 的循环存在。集合更新可减少执行开销，但“显著阻塞”的程度需实测。建议先测 1/100/1000 数量的耗时与锁等待，再保留固定锁序、幂等、随机码生成、明文仅首响、失败原子回滚及最小审计实现集合写入。不改变授权资格检查。

### 3.6 volatility：声明问题成立，不把静态警告称作运行失败

`require_admin()` 默认 VOLATILE，实际只有当前身份/管理员检查；多项 STABLE RPC 调用它。建议将该只读助手声明 STABLE，并把 `admin_get_pro_entitlement_core` 中 clock_timestamp 改为与其他只读摘要一致的时间。v_actor/v_anchor 等确认无用变量应一并清理。

PostgreSQL 不因 STABLE 调用 VOLATILE 就必然拒绝执行；plpgsql_check/lint 的警告与运行错误应区分。修改后实际运行 lint，不预先承诺固定“14 项”全部消失。

## 4. 权限与删除隔离

### 4.1 整表 SELECT：可收敛，但不是所有登录用户的数据泄露

底表整表 SELECT 仍受当前 AAL2/有效管理员 RLS 限制，普通用户不能因此批量读取他人反馈。R2 Key 是位置，不能替代私有 Bucket 和签名权限；图片签名 URL 本身也可能包含路径。

**整改前置**：

1. invoker 视图 WHERE 使用 deletion_started_at；收回该列权限会影响视图。必须同步调整投影/RLS/受保护读入口并验证所有调用。
2. 导出仍以用户 JWT 读取 object_key，收权需同步修改，不能留下运行故障；新增 service-role 读取须证明已做完整当前资格/对象范围验证，不直接扩大权限。
3. public `feedback_image_access` 本身返回 object_key 给已通过属主/管理员验证的调用者；只改底表 GRANT 无法达到“客户端任何路径都拿不到 Key”。
4. “五个 private 内核漏撤 authenticated”不是漏洞证据：public SECURITY INVOKER 包装器需要该精确 EXECUTE，且后面就是显式 GRANT。内核必须自身鉴权；不得直接撤掉必要授权。

### 4.2 删除中反馈：真实隔离缺口

my_feedback_core、my_feedback_events_core、feedback_image_access_core 没有删除中条件。R2 失败留下删除意图时，用户仍可能读到完整反馈/事件，或为正在删除的对象签名。

建议普通列表/事件/签名过滤 deletion_started_at；按本人+产品+原 request_id 的精确恢复仅返回最小 recovery_only 存在证明，避免把删除中等同于“从未提交”诱发重复发送。已签发短 URL 无法因此立即跨服务撤销，应如实描述有效期限制。

### 4.3 RLS OR 条件：暂不重构

OR 和多 PERMISSIVE 策略存在，但没有真实执行计划证明其造成不可接受退化。专用 security_invoker 视图仍使用原 RLS，不会自动消除 OR；改 definer 会改变安全边界。先测用户/管理员实际 SQL，不能仅为“纯粹”拆出新架构。

### 4.4 新增：永久删除完成凭据没有限制在可信 Edge

prepare 和 finish 的 public 包装器、private 内核均允许 authenticated 精确 EXECUTE，内核会校验当前 AAL2 管理员。管理员可以直接 prepare 获取 Token，再直接 finish 删除数据库记录，不必经过 Edge R2 DELETE。隐藏表的 deletion_token 不会解决这一点。

这不构成普通用户越权，但意味着**数据库不能强制保证“确认永久删除即 R2 和元数据都已删除”**。后续须明确是否信任管理员直接执行底层删除协议；若要求所有正式删除都经过可信 Edge，则将完成动作收敛为可信服务权限，同时保留可验证的当前管理员资格、产品范围、Token、重放与最小审计。不能仅使用 service-role 而省略操作者资格检查，也不能伪造 R2/DB 原子事务。

## 5. Edge 与配置

### 5.1 服务故障误报 403：成立；撤回“必然清空登录态”

export/delete 的 assurance.error、access.error，以及 export 的 records/latest/audit 错误被硬编码成 403。服务不可用与明确鉴权拒绝应区分，必要输入/冲突也保持原业务状态，不把所有错误笼统归为 503。

可复用现有 feedbackRpcReadFailure 的明确 PT401/PT403 分类；未知传输/SQL 故障返回 503，不泄露上游错误。42501 需核实语境，配置性权限错误不能自动等同管理员已撤权。

当前导出组件自己捕获 functions.invoke 错误；invalidateAdminAccess 清的是资格缓存，并非直接删除 Supabase Session。因此原报告“这几处 403 直接清空登录态”没有现行调用链支持，风险应写为错误分类和恢复行为错误。

### 5.2 缺函数配置段：事实成立，不等于无法运行

config.toml 只有 submit/image-access 的显式配置；export/delete 缺段。官方默认函数配置仍适用，既有本地测试也显式 serve 四函数，所以不能判定未启用或没有 JWT 验证。

建议补显式 entrypoint/JWT 设置并按当前 JWT 签名模式做真实调用；两个目录没有 deno.json，不添加不存在的 import_map 路径。

### 5.3 Key 正则与 CORS：分别处理

删除正则字符类包含斜杠，允许多段路径，确实比当前生成协议宽。建议复用与孤儿对账一致的 UUID/slot/hash/ext 格式，并校验与反馈产品/属主/请求归属一致，避免只做格式验证。

Key 来自受保护 SQL 而非前端任意输入；本项不是已证实可删任意 Bucket 对象。CORS 通配不绕过 Bearer JWT/MFA，也不是 CSRF 漏洞的充分条件；按正式站点/客户端来源需求决定白名单，不把它当认证层。

### 5.4 密码策略（对应原 6.1）

本地 minimum_password_length=6、无字符组合要求、secure_password_change=false 属实。生产应确定密码策略并验证所有注册/恢复/改密流程。开启 secure_password_change 会引入重新认证路径，不能只切配置而漏改调用者；8 位+字母数字也不能被描述成已完成生产安全验收。

### 5.5 本地服务开关（对应原 6.2）

storage/realtime enabled=true 属实，但 README 的实际启动命令已 --exclude 这些容器，当前运行栈也只有 DB/Auth/REST/Kong/本地邮箱。可将不使用的能力显式关闭以对齐配置；不是现有栈必然启动多余容器的 P1。保留框架自有 schema/迁移，不删除 Supabase 系统表来“精简”。

### 5.6 套餐与邮件（对应原 6.3）

官方价格页将 Basic MFA 列为免费套餐包含；当前 TOTP 属于基础 MFA，不能依据配置模板旧注释推导必须购买 Pro。Phone MFA 与其他付费能力另查，不混为一谈。

内置发信每小时 2 封的限制属实，生产 SMTP/发送方案、投递与找回验证属于第三阶段门禁。local config 不证明托管项目设置，需在获授权的目标环境另行核对。

官方来源（2026-11-02 读取）：[函数配置](https://supabase.com/docs/guides/functions/function-configuration)、[MFA](https://supabase.com/docs/guides/auth/auth-mfa)、[价格](https://supabase.com/pricing)、[邮件限流](https://supabase.com/docs/guides/auth/rate-limits)。

## 6. 文档和测试本身的问题

- 长期 billing/数据库/API 文档仍有“按单笔 starts/ends 判当前 Pro”“人工授予可无成员/blocked”“多次核销”等被新账本/直授门禁/单次码取代的规则；须以当前已批准决定收敛，不能让旧文字推动恢复旧代码。
- 反馈架构前半段仍列 V2/V3 字段/四队列，后半段却规定 V4；应将当前合同与待清理的实际存储区分。
- 计划索引/README 的旧执行状态与 TODO 后续证据不一致，不能将旧 NOT RUN 当最新结论，也不能将局部 PASS 当正式签收。
- 部分静态测试固定断言 Dashboard 使用 pro_credit_summary、auth.users 或原视图；这类 PASS 只说明源码形状，不能证明统计正确或性能达标。后续实现修改时改为可观察结果测试。
- 原报告迁移基线“37 个”不符当前 40 个；“现行线上逻辑 Bug”措辞错误，项目仍未上线。
- 清理数据只移除测试事实，不自动删除迁移/有效安全测试、唯一未提交证据或框架 schema；新项目无兼容不等于可以丢失管理员及集成配置。

## 7. 实施顺序（审查时制定，执行结果见§9）

1. 在现行需求/长期合同明确本人恢复 DTO、删除完成权限和账本摘要语义；相同问题只在唯一 TODO 跟踪。
2. 先写会失败的行为测试：删除中读/签名、已读版本、首响/重放结构、服务故障分类、直接完成删除的边界。
3. 最小实现并同步全部 SQL/Edge/Admin 调用者；不恢复旧签名、时间窗或双轨权限。
4. 删除已证明无用的文件/参数/变量/索引；补必要完整性约束。
5. 测量 Dashboard/批量操作后选择性能修改，保留当前管理锁与授权边界。
6. 完成本地 JWT、并发、含图对象一致性、Admin 人工/无障碍/性能与第三阶段真实 SMTP/R2/部署门禁。本文审查及数据清理不能替代这些验收。

## 8. 本地数据库补充审查与清理证据

### 8.1 清理前事实（2026-11-02）

- 已安装版本与当前目录：40 项，最新 20261029213000；无需为“更新数据库”重新 reset/replay。
- 实际 public 业务表 16 张；精确计数为 Auth 4、Admin 1、产品 2、成员 1、Grant 4、信用账户 1、信用条目 4、批次 2、码 11、核销 2、反馈 6、附件 0、事件 21、管理审计 20。
- 管理员仅 admin@aisencore.test，原 UUID、密码哈希、1 个 MFA 因素和 1 个会话须保留。AisenLens 产品 ID 为 27439884-9864-4eb3-867c-78b122c7185a，保持不变。
- pg_stat 的 n_live_tup 在刚启动时为 0，并不代表表为空；以上使用 count(*)，不能用统计估值决定删除。
- 当前没有 R2 附件引用；因此本次清理不需云 R2 删除，不连接/枚举第三方对象。未引用云对象是否存在未验证。
- 备份已生成且 pg_restore --list 可读：[清理前完整归档](E:/Projects/Aisencore-local-backups/aisencore-before-prelaunch-cleanup-20261102T091400Z.dump)，830904 字节，SHA-256 `a93370c740ad8edae64509ac53063cf6bb2d6d62b80ee00e85f0f877e5b5ca72`。归档含Auth/业务数据，不进Git；目录校验和完整恢复均通过，见§8.3。

### 8.2 本轮保留与清理合同

所有者已明确许可清除本地测试数据；只保留实际 AisenLens 接入产品和管理员身份/资格/MFA/会话、Auth 服务配置及最新数据库结构。删除不再属于保留范围的 aisenhub 产品，非管理员账号、成员、Pro/信用、码/核销、反馈/事件、限流和旧测试审计清空；不删除管理员 Auth 因素，不改 AisenLens 产品 UUID，不改密钥，不部署云端。

使用[本地清理脚本](../../scripts/reset-local-joint-dev-data.py)先 ROLLBACK 演练、复核保留对象，再使用已验证备份执行 apply；不使用 db reset。管理员 granted_by 等仍需 FK 一致性，遇未识别关联先失败，不关闭约束或 CASCADE 清空。

### 8.3 本轮验证状态

本节按实际命令追加，不将预定步骤记为 PASS。产品缺陷保持 OPEN；本轮未改业务迁移/Edge/Admin。

| 检查 | 本轮结果 | 证据与限制 |
| --- | --- | --- |
| 迁移版本/实际函数体 | PASS | 40 个本地文件与登记版本集合一致；按各函数最新 CREATE/REPLACE 解析，比对 public/private 86 个当前函数体，全部一致。不是完整 schema diff；历史 migration statements 可与已修改文件不同 |
| 关系数据 | PASS | 清理前跨产品码/批次、核销/Grant 用户产品不一致均为 0；这不能替代缺失复合外键 |
| 只读目录/权限检查 | PASS | 确认 contact_email 存在且可空，无邮箱 CHECK；底表整表 SELECT；精确 private EXECUTE；last_handled_by 最终 SET NULL；三项冗余索引 |
| 缺陷回滚复现 | PASS，缺陷仍 OPEN | [复现 SQL](../../scripts/experiments/backend-audit-rollback.sql)退出 0 并 ROLLBACK：首次已读 version=2；工作台 status=NULL；首响含 effective_ends_at、重放缺失；删除中本人仍读内容/1 条公开事件/图片 Key；管理员可直接 finish；收回删除过滤列使 invoker 视图 42501。普通用户直接附件表读取 0 行。仅 SQL 模拟 JWT 声明，非签名 JWT/Edge/R2 E2E |
| pgTAP 全 14 组 | **516/517；1 FAIL** | 每个文件独立事务并 ROLLBACK。004 第18项 active grant derives Pro 得到 free：夹具只插 entitlement_grants，无信用账户/条目，仍使用旧判权假设。其余 13 组全部通过；psql 退出 0 不代表 TAP 无失败 |
| plpgsql_check | 20 条诊断；无 error/fatal | 事务内临时创建扩展，检查 public/private PL/pgSQL 非 trigger 例程后 ROLLBACK。8 条 STABLE/VOLATILE 警告涉及 7 个只读内核；另有 2 个 unused v_anchor、3 个 never-read v_actor、require_admin 应 STABLE 及类型/SELECT INTO 性能提示。不是原报告声称已实测的“14 个 RPC 全部告警”；不是完整 Supabase CLI db lint |
| 反馈计数执行计划 | PASS，证伪原性能断言 | 实际 AAL2 SQL 角色的 EXPLAIN ANALYZE 仅扫描 6 行 user_feedback，无 feedback_attachments 子计划；约 8.144ms，不能外推生产负载或 Dashboard P95 |
| 备份完整恢复 | PASS | 归档副本恢复到临时 aisencore_backup_verify_20261102；使用本地 supabase_admin，pg_restore exit 0，核对用户4/反馈6/Grant4/迁移40/MFA1、AisenLens UUID及执行内核 owner。临时库/容器内副本均删除；原备份保留。普通 postgres --no-owner 尝试因系统函数参数权限失败，最终以框架管理员完整恢复通过 |
| 清理红检查 | 失败符合预期 | 原脚本拒绝非 demo 用户；新基线预检在清理前报告 DIRTY。旧脚本未处理 pro_credit_*，已收敛为本次明确授权的管理员+AisenLens 保留规则 |
| 清理 dry-run/apply | PASS | 两次同一清理事务，先 ROLLBACK 再 COMMIT；事务内逐值比较管理员用户记录（含密码哈希）、资格、身份、MFA、会话/刷新链、AisenLens 整行及迁移记录，均不变；不输出密码或 Token |
| 清理后预检 | PASS | Auth1/Admin1/产品1，AisenLens UUID不变；所有14张其他 public 业务表为0；管理员因素1/会话1/刷新链6条保留（其中5条已撤销历史链，不截断当前刷新关系）；Auth审计/MFA挑战均0 |
| 静态与纯规则 | PASS | Node语法检查两个受影响 QA 脚本；信用参考模型含300组守恒；Dashboard静态合同；反馈V4静态合同 |

**删除明细**：非管理员 Auth 用户3（含实际本地测试账号和两条 Lens UI QA账号）；aisenhub 产品1；成员1/成员事件1；Grant4/信用条目4/账户1；批次2/码11/核销2；反馈6/反馈事件21/附件0；限流1；管理审计20；Auth审计2306/MFA挑战24；非管理员会话4/身份3/刷新Token25等由外键/显式清理移除。AisenLens、管理员原数据、40项迁移、现有结构/约束/策略均保留。

**清理后范围**：当前无附件引用，无对象存储调用；本地Mailpit删除API返回200，前后邮件数均0；Auth健康接口200。没有清理浏览器持久会话、第三方云对象、仓库外备份或有效迁移/安全测试。

**仍未执行**：真实 JWT/Edge 错误注入、已读与导出双连接竞争、大规模 Dashboard/批量写性能、全站 Chrome/WCAG/人工视觉、真实云 R2/SMTP/部署。清理和审查完成不表示这些门禁通过。审查新增缺陷及004夹具失败在唯一 TODO 保持 OPEN，本轮不实施产品修复。

**文档交付检查**：本轮12份受影响入口/需求/架构/审查/测试说明的本地链接已核对；Git diff空白检查通过。移除TODO中3项已完成子任务及旧清理过程段，将旧demo使用说明替换为当前空业务基线；详细历史证据保留在原执行文件，不删除有效迁移或安全测试。

## 9. 授权修复结果（2026-11-02）

本节覆盖上方修复前状态；详细步骤、测试命令、备份和性能样本统一维护于[实施计划](../Plans/2026-11-02-backend-audit-remediation.md)。新增迁移[20261102095028](../../supabase/migrations/20261102095028_backend_audit_remediation.sql)已安装到本地，未修改已应用的历史迁移，未reset数据库。

| 对应发现 | 当前实现与证据 |
| --- | --- |
| §1.1、1.3 数据一致性 | 非NULL邮箱CHECK、码/批次产品及核销/Grant用户产品复合FK已落地；跨用户/产品负例通过。004夹具补齐信用账户/条目，保持原判权断言 |
| §1.2、6 旧模型 | 正常本人DTO统一received；删除中原号只返回recovery_only。移除旧五态/标签/负责人/回收站列及旧参数、调用和死文件，保留合法队列转移/删除冻结 |
| §2 索引 | 移除3项兑换冗余索引及旧字段索引；20k批次实测支持新增全局和产品创建排序索引。其他候选无收益证据，不机械添加 |
| §3.1、3.3、3.4、3.6 RPC | 直授重放补当前effective_ends_at；首次已读不增业务version，保留原锁序；require_admin STABLE、只读事务时间统一、删除无用变量。首次已读与真实ZIP在途竞争通过 |
| §3.2、3.5 性能 | Dashboard与批量发行/撤销改集合SQL，混合权益口径对照通过；10k成员与1/100/1000批量实际PG耗时见计划，不作为生产P95承诺 |
| §4.1、4.2、4.4 权限 | 底表必要列白名单；prepare/finish/图片对象/导出附件内部RPC仅服务角色执行，Edge传验证操作者，SQL复查资格/范围。普通管理员直接finish拒绝；删除中本人事件/图片拒绝、列表隐藏、原号最小恢复均通过 |
| §5.1、5.3 Edge | 明确401/403与未知服务故障503分类；缺失/畸形权限响应也503；Key严格UUID/slot/hash且核验产品/属主/请求归属。Deno测试和真实JWT/隔离S3故障链通过 |
| §5.2、5.4、5.5 配置 | 四函数显式配置；密码8位且含字母数字、改密重新认证；Storage/Realtime关闭。实际本地重启应用配置，管理员/MFA/会话及产品指纹不变；真实GoTrue弱密码负例/邮件恢复/MFA通过 |

本地真实F07完整链路、Pro并发/幂等HTTP、D2 Auth、反馈JWT HTTP、Admin反馈操作均EXIT0；独立零图ZIP套件最终连续两次EXIT0，安装后16组SQL543/543、Deno20/20、类型/Lint/Build和文档链接通过。测试后清理153条QA Auth审计及4封QA邮件，最终Auth/Admin/AisenLens各1，其他业务表和Auth审计/挑战/邮箱均0；管理员MFA1/会话1/刷新链6保留。已删除旧标签Hook和两个由当前D3/F07替代的V2/V3浏览器脚本，保留旧审查回滚SQL作为修复前唯一证据。

**仍需跟踪**：本地独立ZIP曾出现两次网关上游502，补日志后连续两轮未重现，根因未确认，按TODO的LOCAL-EDGE-502观察；不能以重跑通过称为根因已修。独立门禁仍为真实云R2/SMTP、目标托管配置、生产多用户/网络P95、全站人工WCAG/视觉/业务签收及部署授权。本地修复不代表项目已上线或全部阶段验收通过。
