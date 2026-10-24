# AisenCore 测试与验收规范

> 当前已采用 **Supabase CLI + pgTAP** 完成第一批本地 PostgreSQL 结构/RLS/权限验证。其他 API、Auth、浏览器、R2/云环境的真实端到端验证尚未完成。

## 已有真实执行证据（2026-10-24）

| 验证 | 脚本 | 实测 |
| --- | --- | --- |
| 6 张基础表、约束、RLS、显式 GRANT / 禁止废弃公共表 | [001_core_foundation.test.sql](../../../supabase/tests/database/001_core_foundation.test.sql) | **25 PASS** |
| SQL 角色、合成身份下本人隔离、跨用户禁止读写/管理员表保护 | [002_membership_rls.test.sql](../../../supabase/tests/database/002_membership_rls.test.sql) | **10 PASS** |

合计 **35 PASS / 0 FAIL**，在独立本地 PostgreSQL 17.11 执行。合成身份使用 `SET ROLE` / SQL 会话 JWT claim，**不等于真实 Supabase Auth 验签、MFA 或 PostgREST HTTP 安全测试**。所有合成用户/成员已在测试事务中回滚。

复测命令：

```powershell
pnpm dlx supabase migration up --local
pnpm dlx supabase test db --local supabase/tests/database
```

## 未完成但必须真实验证

- **JWT、RLS、函数授权**：匿名/账号 A/B、产品跨界、管理 `aal1`/`aal2`、blocked、Admin 撤权、`private SECURITY DEFINER` 内核直接调用、默认 PUBLIC EXECUTE / owner / `search_path`、新建表显式 GRANT。
- **状态、事务、兑换**：首次加入并发唯一、`left→suspended→left`、最后一位可用管理员保护、审计失败回滚；码首响明文/UNKNOWN、跨产品防枚举/限流、重复核销、超兑、Pro 延长/永久/撤销、强类型幂等。
- **真实客户端与产品**：Supabase Auth 邮件验证/找回、刷新与 TOTP、独立 SaaS 登录/登出、本地离线 Free、React-admin 用真实浏览器验证键盘/焦点/响应式和高危恢复；禁止将离线 Demo 模拟通过记为端到端 PASS。
- **R2 与网络恢复**：SaaS 资源属主/容量、白名单小 JSON 可信校验、唯一 final 条件写、防重放、pending/ready/孤儿对账、单边失败/超时、已签 URL 撤权窗口、手动备份恢复。
- **稳定性与上线**：真实双连接并发/锁等待、P50/P95/请求次数、真实服务成本、日志脱密、账号注销、密钥隔离、备份/迁移恢复、部署和回滚。批准后在隔离环境运行，再判断生产就绪。

测试行为与编号以 [API 契约的 I-01～I-28、R-01～R-15 及补充用例](../../architecture/backend/api-contract-and-mvp-acceptance.md)、[事务锁序](../../architecture/database/rpc-security-and-locking-contract.md)、[Admin 应用合同](../../architecture/applications/admin-console.md)为权威；本文件不维护第二套逐案例期望。

## 额外安全底线

只对实际存在的业务能力测试。不为假设的通用积分余额、`consume_user_quota`、AI 网关或公共业务配额新建数据库表/RPC。若 SaaS 将来引入消费计量，应由可信主体确认资源属主与成本，并在事务里检查正数、上限、并发、请求幂等和必要审计；不得信任客户端传来的负成本，也不得把陈旧 JWT 自定义权限作为当前 Pro/Admin/blocked 的权威。

每次运行记录测试脚本、提交版本、环境/服务版本、可复核断言、实际 PASS/FAIL/SKIPPED/NOT RUN，失败不以设计说明遮盖；公开日志不得包含真实码、JWT 或高权限密钥。
