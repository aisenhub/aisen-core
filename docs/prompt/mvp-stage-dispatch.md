# AisenCore MVP｜Coding Agent 阶段任务调度模板

> **用途**：按需复制一个子任务给 Coding Agent。不是第二套需求、安全合同或阶段计划。若本文件与[根 AGENTS](../../AGENTS.md)、[需求](../spec/requirements.md)或[架构](../architecture/README.md)冲突，以现行权威为准。

## 推荐发送模板

请在 AisenCore 当前工作区执行 **{阶段，例如 D1-M1}**，只交付这一项及直接依赖的必要检查，不自动扩展其它阶段。

1. **先读取**：`AGENTS.md` → [唯一总计划](../Plans/aisencore-mvp/00-mvp-master-plan.md) → 目标[阶段计划目录](../Plans/README.md) → 对应 `docs/spec/requirements.md` 和 `docs/architecture/` 合同 → 当前 `docs/Plans/TODO.md` → 实际迁移、代码、配置、测试以及 `git status`。不要以本提示词代替阅读现场文件。
2. **明确目标**：列出本子任务修改的真实目录/文件、期望业务状态/安全不变量、可运行断言、已批准/未批准的参数。发现阶段文档与真实架构冲突时先核实，再在本次任务修订，不得照抄历史接口。
3. **范围与权限**：遵循[工程目录规范](../architecture/infrastructure/repository-structure.md)。D1 优先 `supabase/migrations/` 与 `supabase/tests/database/`；D2 验证 Auth/API；D3 唯一前端目录 `apps/admin/`；S1 公共后端仅负责共用 Supabase 的 AisenLens 专属 Edge/RPC，产品客户端代码属于独立仓库；D4 是测试/运营准入。未经明确授权不连接生产、不创建计费云资源、不提交或推送 Git。
4. **保留安全底线**：无公共 `plans`、无 `capability` 或单参 `redeem_code`；敏感写经受保护 RPC；精确 RLS/GRANT/`EXECUTE`、`aal2`、成员/账号分离、L0～L8 并发、兑换防侧信道/限流持久化、一次性明文/UNKNOWN 恢复；不能把候选 100/批、256 KiB、10 版、15 分钟写死。
5. **先证据后声称完成**：执行当前子任务能运行的隔离测试；按 SQL 角色/模拟 JWT、签名 JWT/HTTP、浏览器、Mock/R2 真环境分别记录实际结果。若测试未运行，明确写 `NOT RUN`，不宣称当前 D1/D2/D3/S1/D4 完成。
6. **同任务维护文档**：更新唯一阶段计划的验证记录、`docs/Plans/TODO.md` 和直接受影响的架构/根索引，修订或清除被替代的内容；检查相关相对链接与 `git diff --check`，最后逐项交付文件清单、测试 PASS/FAIL/NOT RUN、剩余障碍。

## 各阶段只派发当前下一项

| 目标阶段 | 当前入口 | 可交付范围 |
| --- | --- | --- |
| D1 | [数据库和可信 RPC](../Plans/aisencore-mvp/d1-database-and-trusted-rpc.md) | 一次迁移/一组安全 SQL 或双连接并发测试，按 D1-M1～M4 分批 |
| D2 | [Auth/HTTP/MFA](../Plans/aisencore-mvp/d2-auth-public-api-and-mfa.md) | 实际 JWT 算法、Auth/HTTP 错误、TOTP、用户查询，逐组验收 |
| D3 | [React-admin](../Plans/aisencore-mvp/d3-admin-console.md) | `apps/admin/` 初始化、Provider、Resource、浏览器验收 |
| S1 | [AisenLens/R2](../Plans/aisencore-mvp/s1-aisenlens-r2-backup.md) | 已批准白名单的专属 Edge/元数据/真实 R2 与产品跨仓验收 |
| D4 | [发布准入](../Plans/aisencore-mvp/d4-release-acceptance.md) | 证据汇总、失设备会话撤权、注销/恢复及明确范围的发布报告 |

**禁止把“单阶段单任务”误解为后端和前端的所有准备必须完全串行。** 准备工作可并行，敏感接口真实验收必须建立在对应实现通过检查的基础上。
