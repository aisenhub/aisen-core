# 审查工作区

本目录**保留原始审查材料作为其编制时点的历史证据**（尤其 2026-10-21 的[架构独立复审](./aisencore-architecture-audit-2026-10-21.md)及[2026-10-22 后续审查](./20261022.md)）；**旧报告的待决事项、旧签名、R2 直传/延期结论不再是当前架构**。最新执行入口为[整改总计划](../Plans/20261022-review-remediation/master-plan.md)与[TODO](../Plans/TODO.md)，唯一业务权威见[需求](../spec/requirements.md)/[架构](../architecture/README.md)。

专项审查覆盖与对象有关的维度，不机械检查全部系统。只审查的任务不同时修改生产代码；用户授权整改后按问题范围实施。

每项问题独立记录 `OPEN`、`FIXED`、`DEFERRED`、`ACCEPTED` 或 `NOT_REPRODUCED`，附证据和原因。延期、接受风险和无法复现都不能标为已修复。

报告可用 `DRAFT`、`ACTIVE` 或 `RESOLVED`：只有范围内的问题完成约定处理且必要验证通过，才能关闭。发现新的失败或证据过期时更新对应项，而不是靠顶部状态覆盖。

已闭环材料按[文档保留规则](../README.md)提炼后整理。此次逐项处置与尚待实施验证见[架构整改核对表](./architecture-remediation-status.md)；不能把架构设计修正写成 SQL 已部署或系统测试已通过。
