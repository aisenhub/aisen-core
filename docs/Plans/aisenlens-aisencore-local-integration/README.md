# AisenLens × AisenCore｜本地对接审查资料

> 2026-10-27 创建。此文件夹是双仓审查快照及本地对接施工资料，**不是另一个业务/API 真源，也不是联调已通过证明**。

## 文档入口

- [2026-10-27 双仓审查结论与本地对接实施方案](./2026-10-27-cross-repository-audit-and-integration-plan.md)：技术基线、真实代码问题、优先级、Core 主导整改清单、Lens 修改边界、接口、六批开发计划及联调验收。

## 本轮最新约束

**项目所有者明确：AisenLens 目前与后端有关的页面和代码只是简单测试，一切以后端 AisenCore 的现行有效数据/权限/API/业务合同为准。** 测试 UI、占位 DTO 或前端模拟状态不能作为后端合同；如现有需求冲突，先在 Core 的唯一权威合同中澄清，再让 Lens 的后端相关模块适配。

**AisenLens 只能修改后端相关模块，不允许改动其他拉片业务；AisenCore 是重点修改优化对象。** 不得为测试代码添加旧接口兼容层。只在隔离本地环境联调；任何线上部署、远程数据库变更和 Git 推送仍需单独授权。

## 参考唯一真源

- [未完成任务与阶段状态](../TODO.md)
- [第二阶段联调准备方案](../aisencore-mvp/phase2-aisenlens-local-integration-plan.md)
- [Core 侧静态合同盘点](../aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md)
- [公共 API 唯一合同](../../architecture/backend/api-contract-and-mvp-acceptance.md)
- [需求](../../spec/requirements.md)、[架构](../../architecture/README.md)与[三阶段交付门禁](../aisencore-mvp/three-stage-delivery-gates.md)

旧准备计划中“Lens 尚不可见”是此前单仓审查状态；以本目录较新的双仓审查事实为准，**不代表实际跨端业务联调已执行**。
