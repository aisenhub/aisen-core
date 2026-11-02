# AisenCore 审查报告索引

> 本目录保存可复核的**审查快照与发现**，而不是当前需求、架构或任务的第二真源。审查日期、Git 基线、检查方式及局限以每份报告为准；具体 OPEN/BLOCKED 状态仅以 [Plans/TODO](../Plans/TODO.md) 为准。

- [2026-10-29 上线测试前全面收尾审查报告](./2026-10-29-aisencore-prelaunch-closeout-audit.md)：基于 `main@b715a32` 的代码、SQL、文档、依赖和验收缺口审查，包含 P0/P1/P2 风险、实际执行结果和证据等级。
- [2026-11-02 后端与 Supabase 综合审计报告](./2026-11-02-aisencore-backend-supabase-audit.md)：基于本地全部 40 个迁移文件、PL/pgSQL 存储过程、RLS 策略、Edge Functions、`config.toml` 与 Admin 适配层的深度审计，包含 Schema 废弃字段堆积、N+1 仪表盘统计瓶颈、时钟回拨隐患与并发锁优化的 P0/P1/P2 风险排查与治理建议。
- [审查驱动的执行计划](../Plans/2026-10-29-prelaunch-closeout/README.md)：说明整改顺序、检查清单、责任/证据和第三阶段门禁。

**使用说明**：报告反映 2026-10-29 当时的事实，不应随代码变更反复改写原始结论。后续修复应更新现行文档和唯一 TODO，并在执行计划的验证记录中指向新证据。未经授权不提交、推送、连接云端或执行删除。
