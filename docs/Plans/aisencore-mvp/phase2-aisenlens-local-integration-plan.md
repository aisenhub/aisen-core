# 第二阶段本地联调｜MVP工作流入口

> 2026-10-27：业务与范围已确认，源码/入口已静态核对；第一阶段正式签收未完成，真实双端NOT RUN。本轮仅编写计划，不改代码、数据库或云环境。

## 唯一详细执行入口

本次双仓调度统一到[本地对接总执行计划](../aisenlens-aisencore-local-integration/00-integration-master-plan.md)，其隶属[MVP总计划](./00-mvp-master-plan.md)，不替代[三阶段门禁](./three-stage-delivery-gates.md)或[TODO LENS-01～07](../TODO.md)。

| 工作包 | 详细施工与准出 |
| --- | --- |
| 第一阶段前置 | [Core/Admin独立修验/签收](../aisenlens-aisencore-local-integration/01-stage1-core-readiness.md) |
| LENS-01～03 | [环境/Auth/成员/昵称/生命周期](../aisenlens-aisencore-local-integration/02-stage2-auth-and-membership.md) |
| LENS-04 | [资格/历史/兑换及R-16](../aisenlens-aisencore-local-integration/03-stage2-entitlements-and-redemption.md) |
| LENS-05 | [单向文字/最多两图反馈](../aisenlens-aisencore-local-integration/04-stage2-feedback.md) |
| LENS-06/S1 | [完整模板私有备份](../aisenlens-aisencore-local-integration/05-stage2-template-backup.md) |
| LENS-07 | [组合回归/本地签收](../aisenlens-aisencore-local-integration/06-stage2-integration-acceptance.md) |

原准备方案中的执行细则已并入以上文件，不再在本入口维护重复步骤或第二份状态账本。两仓当前签名/缺口仍见[实际清单](./phase2-core-integration-contract-inventory-2026-10-27.md)，问题证据见[双仓审查](../aisenlens-aisencore-local-integration/2026-10-27-cross-repository-audit-and-integration-plan.md)。

## 准入与范围

先完成可独立Core/Admin遗留及所有者第一阶段签收，期间仅静态合同/隔离环境准备；之后使用Lens实际操作数据开展联调，不用demo seed冒充。Core主导，Lens只改后端相关部分及允许的最小凭据/在途任务接线；不实施AI Pro、去水印、第二项目门槛、支付或桌面/移动/SSO。注销渠道留待上线前。

第二阶段通过不授予云端/推送/部署权限；第三阶段详细路径见[云端与发布计划](../aisenlens-aisencore-local-integration/07-stage3-cloud-and-release.md)。任何数据删除/reset仍按明确授权执行。
