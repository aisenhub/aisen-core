# AisenCore MVP｜D1 数据库与可信 RPC 当前实施计划

> 状态：**ACTIVE**，更新 2026-10-24。只保存当前阶段可执行工作、实测结果和未完成验收。业务需求与规则以 [spec](../../spec/requirements.md)、[长期架构](../../architecture/README.md) 为准；其他任务见 [TODO](../TODO.md)。

## 已实施并验证

| 项目 | 本地实际结果 |
| --- | --- |
| Node / pnpm | Node v24.19.0、pnpm 12.15.0（架构仅要求 pnpm ≥12） |
| Docker / Supabase CLI | Docker Engine 29.7.2 可连接；CLI 2.121.0 经 `pnpm dlx supabase` 运行 |
| 本地 PostgreSQL | **17.11**；项目专属容器 `supabase_db_Aisencore`、端口 `55322` |
| 第一份迁移 | [`20261024011528_core_foundation.sql`](../../../supabase/migrations/20261024011528_core_foundation.sql)：产品、成员、成员事件、管理员、全局限制、管理审计共 6 表；6/6 RLS 启用、显式权限 |
| SQL 测试 | [`001_core_foundation.test.sql`](../../../supabase/tests/database/001_core_foundation.test.sql) 25 项 + [`002_membership_rls.test.sql`](../../../supabase/tests/database/002_membership_rls.test.sql) 10 项，**35 PASS、0 FAIL** |
| 测试边界 | 真实本地 PG 执行；成员隔离测试通过 SQL 角色和**合成 JWT 声明**模拟身份，不是签名 JWT/Auth/MFA E2E |

数据库当前没有遗留这些测试的合成用户或成员。停止维护的另一项目 Docker 资源已移除；AisenCore 的端口和数据卷保留。此处没有生产部署。

## 当前 D1 未完成工作（按顺序）

1. **数据模型**：实现 `entitlement_grants`、码批次/码、`redemptions`、失败限流和必要安全列；不引入公共 `plans`、Free/Pro 产品功能/额度和 `capability` RPC。
2. **最小权限可信函数**：`public SECURITY INVOKER` 薄外壳 + `private` 最小受控 `SECURITY DEFINER` 内核；固定空 `search_path`，权限/主体/对象每次校验。按 [事务锁序](../../architecture/database/rpc-security-and-locking-contract.md) 实现本人加入、退出、重新加入及管理员管理动作。
3. **Pro 与兑换事务**：双参 `redeem_code(product_key, code)`、限流、发码首响明文和 UNKNOWN 查询；直授 `duration/explicit_window`、同 actor/request_id 强类型幂等、同产品 Pro 续期，状态与审计同事务。
4. **真实隔离验证**：数据库重置/迁移复建、实际 GoTrue 签名 JWT/HTTP 与 PostgREST、`aal2` 管理拒绝、private 直调、双事务并发（包括 `left→suspended→left`）、失败回滚/死锁/恢复。完整逻辑用例见[公共 API 与验收](../../architecture/backend/api-contract-and-mvp-acceptance.md)。
5. **阶段退出**：每个功能须留下可复测脚本与必要的脱敏证据；全部 P0 安全测试通过后再将 D1 标记完成，并依次转入 D2 Auth/API、D3 正式 Admin、产品备份和 D4 上线验收。

## 本地复测

```powershell
pnpm dlx supabase migration up --local
pnpm dlx supabase test db --local supabase/tests/database
```

在执行前确认 Docker Engine 运行，且使用 AisenCore 本地项目、非生产数据库。Supabase Auth/PostgREST/API 网关的完整启动与带签名 JWT 的请求**尚未通过验收**；不能把本地 PG/RLS 结果扩大为完整系统安全保证。

## 当前审批与安全边界

本地 D1 开发已启动；不得自行把候选发码数量、云备份大小、管理员身份、域名、SMTP、R2 保留期写成业务定值。不得将生产密钥放入 Git，或未经明确要求创建、修改/删除云资源和部署。提交 GitHub 与发布是独立动作。
