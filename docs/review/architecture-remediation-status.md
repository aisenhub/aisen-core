# 架构审查逐项整改核对与验证

> 状态：**架构文档整改完成，实施验证待开展**（2026-10-21）。对照[原始审查报告](./architecture-review.md)逐项核对。这里的“已整改”只表示**逻辑架构及文档冲突修订到位**，不表示已创建 SQL 迁移、部署数据库/RLS/RPC、接入 SaaS 或通过运行时测试。
>
> 工作区：`E:\Projects\Aisencore`。本轮接续先前 Agent 中断的未提交修改，未重置、未提交已有工作，不更动生产资源。

## 1. 接续基线与处置原则

接续前工作区已有五份修改中的架构文档（API 契约、数据库访问与事务、数据库约束与审计、计费与权益、平台管理与账号生命周期），以及未跟踪的[权益与兑换码约束](../architecture/database/entitlements-and-redemption-constraints.md)、`AGENTS.md`、`docs/Plans/` 和本审查目录。前一轮已启动 M1、M3、M4、M5、M6，但成员规则、其他层级接口、Admin、需求及技术栈尚未同步。保留有效修改后补全跨文档链路；对照报告每个条目落实、标注延期边界。

## 2. 必须修复：M1–M6

| 编号 | 文档整改状态 | 具体落实与证据 | 后续实施验证 |
| --- | --- | --- | --- |
| **M1 权益模型与兑换码契约** | **已整改（逻辑设计）** | [计费与权益](../architecture/domains/billing-and-entitlements.md)定义 `plans / entitlement_grants / redemption_codes / redemptions`、Free 基础能力、不可变已授权套餐、能力/额度合并、周期续期、码熵/哈希/一次性明文、15 分钟失败限流；[数据约束](../architecture/database/entitlements-and-redemption-constraints.md)落实同产品复合外键、唯一来源键与兑换幂等键、单事务顺序、并发锁、发码 `request_id` 幂等；[API 契约](../architecture/backend/api-contract-and-mvp-acceptance.md)补请求/响应/错误与 R-01～R-14 验收 | 真实 DDL、RLS、RPC，批量生成、抗枚举/并发/错误映射测试 |
| **M2 兑换与成员关系** | **已整改** | [计费 §5](../architecture/domains/billing-and-entitlements.md#5-授权与产品成员状态的关系唯一权威)明确受限拒绝、无记录主动兑换时同事务建立 active+join、active 正常、left/suspended 拒绝且不扣码；管理授予和未来支付通知仅写授权、不改变成员；[成员生命周期](../architecture/domains/membership-lifecycle.md)仅引用唯一规则，[接入时序](../architecture/backend/public-api-and-saas-integration.md)区分主动兑换与回调 | 覆盖 R-02、R-03、I-06、I-15 |
| **M3 Admin 读取/RLS 与用户查询** | **已整改** | [数据库访问](../architecture/database/database-access-and-transactions.md)定稿 PostgREST + 管理员 SELECT RLS 与 `private.is_platform_admin()`、`aal2` 校验；Auth 用户 UUID 用只读 Edge 的 `getUserById`，分页列表用 `listUsers`，邮箱有限扫描时返回不完整状态、成员邮箱按页限并发查询；无原生批量查询或邮箱过滤假设；[Admin](../architecture/applications/admin-console.md)规定 Data Provider 服务端分页和分批补邮箱，敏感写入只走 RPC；码哈希不允许被 Data API SELECT | 管理员/普通用户正反向 pgTAP、真实 Auth Admin 查询权限和分页 |
| **M4 状态+审计单事务机制** | **已整改** | [事务专项](../architecture/database/database-access-and-transactions.md)选定**单个受保护 PostgreSQL RPC** 内锁定、变更、审计共同提交；公开 RPC 包装和非暴露的权限辅助函数分别放置，固定 `search_path`，最小 EXECUTE；Edge 限需密钥场景；[数据约束](../architecture/database/database-constraints-and-audit.md)与[API 契约](../architecture/backend/api-contract-and-mvp-acceptance.md)对应并发/回滚行为 | RLS/EXECUTE、竞争、故障回滚、RPC 实际 HTTP 错误映射 |
| **M5 平台限制及注销范围** | **已整改** | [管理员与生命周期](../architecture/domains/platform-admin-and-account-lifecycle.md)确认 MVP 有 `platform_account_restrictions` 且只有 `blocked`，注销请求**人工受理**；[数据库约束](../architecture/database/database-constraints-and-audit.md)定字段；[API 契约](../architecture/backend/api-contract-and-mvp-acceptance.md)删除 MVP 自助注销操作，I-18 为平台限制验收、I-25 为人工流程；需求与身份领域同步 | 旧 JWT 仍有效时的实时业务阻断与解除后的状态检查；人工注销清单 |
| **M6 非成员高权限审计** | **已整改** | [数据库约束](../architecture/database/database-constraints-and-audit.md)建立 `admin_audit_log` 逻辑实体：操作者、动作、目标、精简 before/after、原因、可信时间；产品、套餐、兑换码、人工授权、管理员、全局限制写管理审计，与业务操作同事务；成员变更仍在 `membership_events` | 模拟插入审计失败时整体回滚，校验秘密不落库、操作主体不可伪造 |

## 3. 建议优化：S1–S9

| 编号 | 文档整改状态 | 证据/处理 |
| --- | --- | --- |
| **S1 单一权威来源与去重** | **已整改** | [需求](../spec/requirements.md)从数据库技术细节退回结果约束，并删重复支付顺序表；[计费](../architecture/domains/billing-and-entitlements.md)作为渠道、权益与兑换规则唯一权威；[成员](../architecture/domains/membership-lifecycle.md)只定义状态语义；[API 契约](../architecture/backend/api-contract-and-mvp-acceptance.md)只定义操作、错误和验收；[SaaS 接入](../architecture/backend/public-api-and-saas-integration.md)重写为接入时序与信任边界，避免两份逻辑操作表冲突；[技术栈](../architecture/infrastructure/tech-stack.md)删重复业务范围表 |
| **S2 路径/链接/空目录/示意图** | **已整改** | [需求](../spec/requirements.md)修正工作区路径及身份领域链接；[技术栈](../architecture/infrastructure/tech-stack.md)、[Admin](../architecture/applications/admin-console.md)统一首版范围；[主架构](../architecture/current-main-architecture.md)强调 R2 与 PostgreSQL 并列；删除经过确认为空的 `docs/architecture/user-identity/`；修复 [审查 README](./README.md) 与 [计划 README](../Plans/README.md)中的历史无效本地链接 |
| **S3 合并重叠的访问接口** | **已整改** | [API 契约](../architecture/backend/api-contract-and-mvp-acceptance.md)保留 `GetMyProducts` + `CheckAccess(product_key, capability?)`；[SaaS 接入](../architecture/backend/public-api-and-saas-integration.md)仅使用新契约 |
| **S4 独立 SaaS 验签与跨 Project** | **已整改** | [会话专项](../architecture/applications/auth-and-multi-saas-sessions.md)规定非对称 JWT、JWKS、iss/aud/exp/sub、kid/密钥轮换检查；跨 Supabase Project 的默认业务后端验签与授权路径及 RLS 不互认边界；[SaaS 接入](../architecture/backend/public-api-and-saas-integration.md)引用 |
| **S5 共享 Auth 配置固有限制** | **已整改** | [会话专项](../architecture/applications/auth-and-multi-saas-sessions.md)明确同一项目的 Site URL、回调白名单、邮件模板/发件人、SMTP/速率限额和密码策略，要求接入检查 |
| **S6 配额/计数职责** | **已整改** | [计费 §3](../architecture/domains/billing-and-entitlements.md#3-mvp-权益逻辑模型)约定公共套餐存上限，SaaS/拥有文件元数据的产品统计与执行；[数据归属](../architecture/database/product-data-and-files.md)同步，公共计量账本延后 |
| **S7 环境、迁移、密钥、pgTAP** | **已整改** | [技术栈 §7](../architecture/infrastructure/tech-stack.md#7-环境迁移与最小变更管理实施时执行)定义至少开发/生产隔离、Supabase CLI SQL 迁移入 Git、可信 Secrets、pgTAP RLS 正反测试和发布检查 |
| **S8 管理员安全与引导** | **已整改** | [管理员专项](../architecture/domains/platform-admin-and-account-lifecycle.md)规定 Supabase TOTP MFA + `aal2`、受控 SQL 引导、管理员撤销审计、禁止撤销最后一名；[数据库访问](../architecture/database/database-access-and-transactions.md)实时校验 |
| **S9 邮箱确认** | **已整改** | [会话专项](../architecture/applications/auth-and-multi-saas-sessions.md)与[管理员账号生命周期](../architecture/domains/platform-admin-and-account-lifecycle.md)明确 Supabase Auth **Confirm Email** 配置，不重复自建验证机制 |

## 4. 明确延期：D1–D9（按报告保持边界，不标“已实现”）

| 编号 | 状态 | 延期触发条件与现在保留的最小边界 |
| --- | --- | --- |
| **D1 爱发电通知、订单关联/补单** | **DEFERRED** | 支付阶段 2；当前仅保留 grant 来源幂等键及未来按可信订单核验规则 |
| **D2 支付宝/Stripe/自动扣费退款/升降级/试用细则** | **DEFERRED** | 商户资质及实际产品方案确认后设计，不预先建立支付插件 |
| **D3 自动注销编排及保留期限** | **DEFERRED** | 正式开放/合规窗口要求前再批准实施，MVP 仅人工接收与逐项核验 |
| **D4 R2 预签名、撤权、Bucket、备份索引** | **DEFERRED** | 首个真正使用云存储的 SaaS 接入时补完整实现方案，保留授权及数据归属原则 |
| **D5 机器凭据、邀请/私有产品** | **DEFERRED** | 出现无用户 JWT 的后台任务或产品准入需求后再引入最小服务认证 |
| **D6 公共计量核销/预留账本** | **DEFERRED** | 有跨产品/强一致防篡改计量需求时再建；现阶段由产品计数 |
| **D7 临时/自动解禁、永久下线补偿** | **DEFERRED** | 按运营明确需求再做，不扩大成员三态 |
| **D8 通用离线许可证/SSO/RBAC/Redis/事件总线** | **DEFERRED / 不做** | 保持原明确非目标，避免超前框架化 |
| **D9 自托管迁移方案** | **DEFERRED** | 规模/成本触发后再选型，保留版本化 PostgreSQL 迁移能力 |

## 5. 验证标准、范围与剩余工作

**已执行的静态一致性核验（2026-10-21，均成功）**：

- Python 遍历 `docs/**/*.md`：检查 **268 条本地 Markdown 链接，0 条目标缺失**；其中 **16 个标题片段引用，0 条失效**。
- Python 静态覆盖检查：对 M1～M6 与重点 S3/S4/S7/S8/S9 及完整整改清单的 **12 项断言全部通过（0 失败）**。这些断言只检查当前文档的内容存在与关系，**不证明业务 SQL 正确性**。
- `git diff --check` **退出码 0**；Git 另输出本地 LF/CRLF 自动转换提示（换行环境告警，非 diff 格式错误）。
- 工作区卫生核对仅提醒存在**预期未提交修改**，无阻断项；本次未提交/部署。
- 复核 Supabase 官方 [Auth Admin 用户列表](https://supabase.com/docs/reference/javascript/auth-admin-listusers)、[按 ID 读取](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid)与[JWT/JWKS](https://supabase.com/docs/guides/auth/jwts)：已在设计中避免假设不存在的原生邮箱筛选或批量 ID 查询，说明有限扫描的可见限制。

**尚未进行、不能算通过**：数据库迁移/DDL 实施、真实 RLS 与 pgTAP、JWT/JWKS 与 Auth Admin API 集成测试、并发兑换和限流压测、Admin UI 与回调端到端、外部支付和 R2 业务。测试规范见[开发测试入口](../development/testing/README.md)，详细行为规格见[API 契约与验收](../architecture/backend/api-contract-and-mvp-acceptance.md)。

**结论**：原报告 M1–M6 和 S1–S9 在架构文档层面已对应落实；D1–D9 保留延期/非目标。实施前仍须按照被授权的开发任务完成迁移、代码、配置及运行时验收。审查原文保留为判断依据，本清单是整改核对记录，不改变需求的唯一权威。
