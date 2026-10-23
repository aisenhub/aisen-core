# AisenCore MVP 待办与未验收关口（当前有效）

> **状态：ACTIVE / 未实现与未验证。** 本文件只收拢已完成设计阶段**留下的真实未完任务**，不是新的业务需求、第二套产品政策或已经获准执行的代码计划。各项业务定义以 [spec](../spec/requirements.md) 和 [architecture](../architecture/README.md) 为唯一权威；执行顺序、授权和门槛见 [MVP 总计划](aisencore-mvp/aisencore-mvp-implementation-design-master-plan.md)。**标记 [ ] 表示没有实测或没有获批**。日期 2026-10-22。

## 本轮审查整改（DEC-01～06 已批准，运行整改未完成）

- [ ] 按[审查整改总计划](./20261022-review-remediation/master-plan.md)与[最新审查处置状态](../review/architecture-remediation-status.md)逐项关闭 G-01～04、B-01～03、M-01～03、A-01～04 和 X-01～04。**设计决定已批准、文档收敛不等于执行通过**；SQL/云服务/Auth/MFA/R2/Admin UI 的运行验收仍 NOT RUN。
- [x] 2026-10-22 历史 DEC-01～06 路线已经被 2026-10-23 用户最新[轻量会员边界](../architecture/domains/membership-qualification-boundary.md)局部取代：AisenCore 只提供成员/Pro 资格/期限/码/Grant，Free/Pro 业务 Features/Limits/功能配置由各 SaaS 持有；仍执行 MFA/双参兑换/UNKNOWN/直授幂等/DEC-06。**文档调整与本地原型不代表正式 SQL/API/部署授权。**

## 本次预开发审计建议提炼（2026-10-22；文档已收敛，代码/验收仍待执行）

- [x] Admin 的真实产品/全局作用域、权限边界与 DEC-06 批量邮箱映射已记录于[应用架构](../architecture/applications/admin-console.md)；2026-10-23 固定菜单及四区工作台仅为未签收 UI 候选，正式前端可重新设计。
- [x] 历史原型曾演示一次性码明文、UNKNOWN、Pro 期限、直授和成员状态；保留业务行为，但特定保险箱、三态卡片、布局和配色不强制照搬。当前未找到被计划引用的原型文件，旧模拟测试不是现存可执行 UI 的验证。
- [ ] D1/D2/D4 隔离验证：仅产品 Pro Grant/tier 与可信时间、码/批次的固定授予天数（不建 public plans/plan_id、Free/Pro 功能字段）；双参兑换防枚举、直授首次强类型幂等/不连续未来 Grant、AAL2、身份邮箱回退及 R2 SaaS 自有额度/文件 ACL，真实数据库负向测试仍 NOT RUN。

## Admin UI 设计确认与真实验收（历史 UI-G0A 未签收）

- [x] **项目所有者已要求完整删除 `E:\Projects\Aisencore\development`**：此前的 React-admin/MUI G0B 原型、Theme、依赖及截图均已删除；旧 Build PASS 不代表现存可验收成果。
- [x] 已将旧 UI-G0A 的固定 Studio Bar、主题数量、模块数量、剧本抽屉、像素与 1:1 DOM 模板撤销为非强制候选。通用的原型状态闭环、模拟隔离、错误恢复和用户评审流程仍按[产物规范](../development/frontend/interaction-benchmark-spec.md)及[AI 工作流](../development/frontend/interaction-benchmark-workflow.md)执行。
- [ ] 按下一项实际 Admin 任务决定是否需要原型及覆盖范围；由项目所有者评审交互、视觉和实际需求。旧 UI-G0A NOT APPROVED，不要求先制作固定全景 HTML 才能继续设计。
- [ ] 正式 MVP 业务代码、SQL/RPC/Auth/Edge/R2 仍等待项目所有者下一步授权；D3-UI-X01～X18、UI-G3 和后端安全 E2E 仍 NOT RUN。
- [ ] **DEC-02 A Edge 实施门禁**：去除 Aisenlens 小 JSON Worker/staging 强依赖，落地 JWT/字节体白名单/条件 final/DB pending→ready/对账和私有直取下载；`256 KiB` 和版本上限仍只候选，待真实产品字段冻结。
- [ ] **DEC-06 A 先验证 SQL 只读批量 Auth 用户查询**：真环境检查 auth.users 最小读权、aal2/名册/blocked、分页 UUID[] 上限及 P50/P95；失败直接使用批准的单 Edge 批量聚合回退，禁止放开 auth.users Data API。
- [ ] **最新会员认证职责合同实现**：移除公共 Free/Pro 业务功能/额度模型与 capability RPC，仅保留每产品 Pro 当前资格、可信期间/来源、码/Grant/撤销/审计；30/365/永久是期限参数。D1/D2/D4 真正实现和签名/RLS/GRANT/并发/错误码测试均 NOT RUN。

## F01～F08 / 数据权限与兼容性（全部缺真实运行证据）

- [ ] 依 [F01～F04 安全收敛](aisencore-mvp/aisencore-f01-f04-security-convergence-design.md) 与 [D1 物理/可信事务](aisencore-mvp/aisencore-mvp-d1-database-implementation-design.md) 在隔离环境实际运行 RLS/GRANT/RPC/owner/`SECURITY DEFINER` 搜索路径与权限拒绝、L0～L8 锁顺序/并发；验证 M1～M5，禁止将文档设计状态误记为安全 PASS。
- [ ] 依据 [F05～F08 接口与版本验收](aisencore-mvp/aisencore-f05-f08-contract-compatibility-readiness-design.md) 锁定并核验真实 SDK、CLI、PostgreSQL/PostgREST、Auth、Edge、Cloudflare R2 版本，执行 F05-C01～C12 及 V00～V07；查验暴露 schema 的显式 GRANT、请求指纹/字段 NULL 语义、并发幂等与对象最终一致性。
- [ ] 按**DEC-02 A** 在隔离环境验证 Aisenlens **受保护 Edge 接收非敏感 JSON→可信校验/条件创建 R2 final**、`ready + 有效 pending` 原子配额、DB/R2 单边故障/物理对象清理/短 GET/手动类别恢复和实际费用；**不再验证作为首发 JSON 前置条件的 staging PUT/CopyObject/Worker**。施工参考[D2](aisencore-mvp/aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)、[D3](aisencore-mvp/aisencore-mvp-d3-admin-infrastructure-design.md)。
- [ ] [D4 55 项 I/R/A](aisencore-mvp/aisencore-mvp-d4-test-and-readiness-review.md)、[AUTH-P01～P12](aisencore-mvp/aisencore-mvp-auth-entitlement-mfa-efficiency-design.md)、[BAAS-Q01～Q10 安全测试指南](../development/testing/README.md) 仍全部 **NOT RUN**；BAAS 的消费型 RPC 只在未来确有此业务时触发，不新增本轮积分/平台 AI 扣费功能。

## U03～U11 剩余产品与运营决定（不将候选参数写成确认）

- [ ] **U04/U09/U10/U11 — 产品侧实现前**：由 AisenLens 自行确认 Free/Pro 具体功能、导出/备份配额、非敏感小 JSON 白名单和保留/回收/断网策略；Core 只定义会员可信状态。15分钟 TTL、10版均非确定数值。
- [ ] **U05/U08 — Admin 初始化与发码前**：确定可恢复的实际管理员/备用因素责任与丢设备演练、首批发码数量/码失效时间/授权时长；**100/批**只是候选。MVP **TOTP MFA 必做**，无需重新决定是否开启。
- [ ] **U06/U07/U03 — 公开服务前**：正式域名、Auth 回调白名单、品牌邮件/SMTP、账号删除核验渠道与必要留存期限、隐私与反滥用流程、长期/永久 Pro 的运营文案及备份保留/恢复政策。U03 已确认公众开放是**未来运营目标**，不等于现在可上线。

## 实施 / 运营准入

- [ ] 取得真正的编码/数据库/云配置/测试授权后，按 [MVP 总计划](aisencore-mvp/aisencore-mvp-implementation-design-master-plan.md) 分阶段实现 Supabase/Auth/RPC/Edge、React-admin/MFA 与 Aisenlens/R2；生产密钥/第二管理员凭据不得进入仓库。
- [ ] 真实测量 Auth/Pro 权益复核与 Admin 网络请求数、P50/P95、TOTP 低打扰体验、数据库与 Edge/R2 用量和成本；不能把 Unlimited API Requests 误当无限算力，也不能用过期 JWT 声明代替现行 Pro/Admin 授权。
- [ ] 公共服务开放前完成注册确认/邮件送达/撤权、账号注销、日志脱密、管理员恢复、数据备份及恢复演练、正式迁移回滚、真实测试报告，获独立发布批准。

## 计划与证据的清理规则

每个新任务先确定是否需要新的执行计划；**完成后**把长期有效的规则/证据回写对应 spec/architecture/development/设计正文，把本文件的对应待办按实际结果关闭或更新，然后依据 [Plans/README](./README.md#完成与删除) **删除完成的执行计划、冗余草案与过期入口**。本文件只记录真正未完成事项，不能把“文档静态审查通过”视为真实系统 PASS。