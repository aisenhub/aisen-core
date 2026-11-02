# AisenCore｜上线测试前收尾专项计划索引

- **创建**：2026-10-29；**最初状态**：PLANNED；**W0/W2 本地验证完成、W1/W3 局部验收通过**（详情见执行证据）；**审查基线**：`main@b715a3221d30c55d3118be60eb31f45797bef662`。
- **审查输入**：[2026-10-29 全面收尾审查报告](../../reviews/2026-10-29-aisencore-prelaunch-closeout-audit.md)。
- **上位权威**：[MVP 唯一总计划](../aisencore-mvp/00-mvp-master-plan.md)、[三阶段交付门禁](../aisencore-mvp/three-stage-delivery-gates.md)、[唯一未完成 TODO](../TODO.md)、[现行需求](../../spec/requirements.md)、[架构](../../architecture/README.md)。
- **适用场景**：第二阶段 Core×Lens 本地联调基本结束后，准备申请第三阶段**测试环境部署**之前的工程、安全、文档与证据收口；不意味着第一阶段/第二阶段已签收。

## 文件与使用顺序

1. [00 总控计划、依赖和阶段门禁](./00-master-closeout-plan.md)：边界、工作包、排序、责任建议、停机条件与阶段完成定义。
2. [01 工程与安全整改执行细则](./01-engineering-security-remediation.md)：冻结依赖、废弃反馈 RPC 清退、V4 真删除、安全 lint、最低本地质量门禁。
3. [02 综合验收、双仓与发布准备](./02-integration-acceptance-and-release-gates.md)：Auth、数据库/并发、Admin/WCAG/性能、Core×Lens 以及云端授权后事项。
4. [03 文档真源同步与历史清理计划](./03-document-governance.md)：逐文件修订、历史文档保留/收缩/删除规则、链接和索引验收。
5. [04 统一证据矩阵与签收模板](./04-evidence-matrix.md)：要求的运行证据字段、各项交付门禁、签收/豁免格式；模板本身**不表示已 PASS**。

6. **[2026-10-29 W0–W3 实际执行证据](./2026-10-29-w0-w3-execution-evidence.md)**：锁文件、RPC 迁移、本地永久删除测试的实际结果、原数据哈希与仍开放的验收门禁。

## 执行纪律

- **唯一 OPEN 台账仍是 [`docs/Plans/TODO.md`](../TODO.md)**。本文件夹保存“怎样实施和验证”，不重复维护另一套实时任务状态；当发现审查风险缺少 TODO 映射时，由该任务执行者**同批**补入唯一 TODO。
- **先复现失败/收集基线，再修代码/迁移，后在同批同步权威文档**。只允许当前已批准业务合同，不做上线前历史兼容层。真实 SQL 迁移不得修改已应用的旧文件以假装历史不存在。
- 证据必须标注实际环境：`SOURCE / SQL ROLE / JWT HTTP / CHROME / LOCAL S3 / REAL R2 / PROD`，并严格区别 `PASS / FAIL / BLOCKED / NOT RUN / WAIVED`。
- 创建计划之初只规划；**本次续行现已实施 W1 锁文件修复、W2 后续本地 SQL 迁移与 Admin/安全测试更新，并实跑 W3 隔离 QA 用例**，详见上方证据；未删现有业务数据、不创建云资源、不提交/推送。其余工作包仍需按独立授权和 QA 风险执行。
- 阶段 3 测试环境配置和部署必须另获明确授权；**公开上线需要再次独立批准**。已延期的 Lens 模板云备份不因本计划自动变为本轮交付。
