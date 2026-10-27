# AisenCore × AisenLens｜双仓对接执行入口

> 2026-10-27：已建立详细总计划和阶段工作包，当前仅文档规划，代码实施/真实联调未执行。第一阶段正式签收仍OPEN，云端/推送/部署/公开上线无本轮许可。

## 先读与权威

1. [本地对接总执行计划](./00-integration-master-plan.md)：目标/范围、两仓基线、三阶段与依赖、责任/环境、证据、恢复和准出；隶属平台MVP总计划。
2. [双仓审查F01～F08及所有者10项决定](./2026-10-27-cross-repository-audit-and-integration-plan.md)：问题及源码证据，决定已同步双方需求/架构，不能当业务PASS。
3. [唯一未完成任务TODO](../TODO.md)、[MVP总计划](../aisencore-mvp/00-mvp-master-plan.md)、[三阶段门禁](../aisencore-mvp/three-stage-delivery-gates.md)：任务状态和正式签收归属，不另建第二份台账。

## 分阶段详细计划

| 交付阶段/工作包 | 文件 | 负责内容 |
| --- | --- | --- |
| 第一阶段 | [01 Core/Admin独立修验与签收](./01-stage1-core-readiness.md) | 现有缺陷、Auth/DB/反馈/永久拒兑、完整UI/WCAG/性能/人工签收 |
| 第二阶段A | [02 环境/身份/成员/生命周期](./02-stage2-auth-and-membership.md) | 正常Lens Auth/邮件/local登出、合法加入、Auth昵称、最小凭据和任务接线 |
| 第二阶段B | [03 资格/安全历史/兑换](./03-stage2-entitlements-and-redemption.md) | 当前Pro、有效期/Grant历史、两参兑换/同码恢复、R-16/并发/故障 |
| 第二阶段C | [04 单向反馈](./04-stage2-feedback.md) | 确认邮箱本人0/1/2图、原号恢复、私图/Admin V3/ZIP/引用安全对账 |
| 第二阶段D | [05 完整模板私有备份](./05-stage2-template-backup.md) | 专属SQL/Edge、20份/待测5MiB、条件写/删除/对账、完整个人恢复 |
| 第二阶段E | [06 组合回归与本地签收](./06-stage2-integration-acceptance.md) | 真客户端主路径、跨模块故障/数据保护、UI/性能/证据与所有者签收 |
| 第三阶段 | [07 云端验证/发布准入](./07-stage3-cloud-and-release.md) | 另获许可后配置/部署、真实SMTP/R2/跨环境/运维、独立公开上线批准 |

A～E只是第二阶段内工作包，不能当新增交付阶段。每份均列入场输入、修改位置、先失败测试、具体步骤/行为矩阵、证据与退出条件；所有新增运行记录NOT RUN。

## 当前边界与长期合同

Core为主要优化对象，Lens仅WebApp后端相关模块/必要接线，不兼容其测试实现。AI Pro/去水印/第二项目门槛、支付、桌面/移动/SSO不在本轮施工；最小登出/切号凭据/在途任务接线已纳入，不改业务算法。

20份/完整个人恢复/到期取回已定，5MiB及最多15分钟为已采纳待实测参数；注销具体渠道留待上线前确定，不开放假受理入口。真实环境和跨端仍待验，不因计划存在放开数据/云端权限。

长期权威：[需求](../../spec/requirements.md)、[架构](../../architecture/README.md)、[API](../../architecture/backend/api-contract-and-mvp-acceptance.md)、[Core实际清单](../aisencore-mvp/phase2-core-integration-contract-inventory-2026-10-27.md)。旧第二阶段/S1入口只做技术索引，实际施工细则集中到本目录对应文件。

## 本次计划编制检查

2026-10-27审查修订：备份终态重放/清理互斥归入文件架构，异浏览器邮件纳入A-T03B，人工注销演练纳入3-05，性能判据按测试规范在实现前冻结；原审查重复施工/验收矩阵已收缩为索引。仅文档修订，所有新增行为验证仍NOT RUN，不改变阶段签收状态。Core全仓81份Markdown、816个文件链接、14个锚点检查0错误；git diff --check通过。未改代码、未操作数据库/云环境，未删除文件。

原计划编制时的历史检查（非本次复测）：Core全仓81文档、810个文件链接及12个锚点检查0错误；Lens自带检查103文档/1658文件链接通过，相关plans目录锚点检查0错误；两仓git diff --check通过。新增8份计划的33个Markdown表格列数、UTF-8/空白/末尾换行检查通过。未执行typecheck/build、数据库/Edge/浏览器/性能或双端业务验收；原准备方案/S1细则并入详细文件，入口与有效证据保留，未删除文件。
