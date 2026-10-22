# AisenCore MVP 待办与未验收关口（当前有效）

> **状态：ACTIVE / 未实现与未验证。** 本文件只收拢已完成设计阶段**留下的真实未完任务**，不是新的业务需求、第二套产品政策或已经获准执行的代码计划。各项业务定义以 [spec](../spec/requirements.md) 和 [architecture](../architecture/README.md) 为唯一权威；执行顺序、授权和门槛见 [MVP 总计划](aisencore-mvp/aisencore-mvp-implementation-design-master-plan.md)。**标记 [ ] 表示没有实测或没有获批**。日期 2026-10-22。

## 本轮审查整改（DEC-01～06 已批准，运行整改未完成）

- [ ] 按[审查整改总计划](./20261022-review-remediation/master-plan.md)与[最新审查处置状态](../review/architecture-remediation-status.md)逐项关闭 G-01～04、B-01～03、M-01～03、A-01～04 和 X-01～04。**设计决定已批准、文档收敛不等于执行通过**；SQL/云服务/Auth/MFA/R2/Admin UI 的运行验收仍 NOT RUN。
- [x] 2026-10-22 项目所有者已批准[DEC-01～06 推荐 A 的统一决策](./20261022-review-remediation/owner-batch-decisions.md)，已写入当前 spec/architecture：兑换显式 product_key、限定小 JSON Edge→R2、G0A/B/G3、Free 当前版本指针、双模式直授与强类型幂等、Auth 限权 SQL RPC 优先/不安全则回退 Edge。**审批不是代码/迁移/上线许可；U04～U11 的真实字段、责任和运营参数仍在本 TODO 后续任务中。**

## 本次预开发审计建议提炼（2026-10-22；文档已收敛，代码/验收仍待执行）

- [x] Admin 应用层架构及 D3/D3-UI 候选设计采用按任务分组的产品/全平台作用域、简洁用户详情与 DEC-06 `getMany` 邮箱映射；**不**实施完整产品上下文状态机、准入模拟器或 1 表 1 顶层菜单。具体设计以 [Admin 应用层](../architecture/applications/admin-console.md) 为准。
- [x] Admin 发码最小非秘密 UNKNOWN 恢复、套餐复制创建新版本、直授三项互斥可视选项已进入 D3-UI；实际交互与安全 E2E **NOT RUN**。
- [ ] D1/D2/D4 隔离验证：Free 双向 FK 建表顺序、Admin 同键幂等与不连续未来授权、跨设备邮箱确认/重置、`aal2` 标签页降级和旧 JWT 紧急撤权边界；不把审计报告作为新批准的产品合同。

## UI-G0（交互优先方法已定、正式签收与 MVP 施工仍暂停）

- [x] **项目所有者已要求完整删除 `E:\Projects\Aisencore\development`**：此前的 React-admin/MUI G0B 原型、Theme、依赖及截图均已删除；旧 Build PASS 不代表现存可验收成果。
- [x] 已确定「业务交互优先、视觉辅助、按风险制作单文件 HTML 并同步提供体验引导」的方法，见[开发流程](../development/frontend/interaction-benchmark-workflow.md)；旧真实 React-admin/MUI 原型不恢复。**方法确认不是交互/视觉签收或施工授权**。
- [x] 原型治理规范已拆分为[交互/视觉产物要求](../development/frontend/interaction-benchmark-spec.md)与[正式代码复用、分级测试边界](../development/frontend/prototype-to-production-rules.md)；交互网页的实际存放位置定为[interaction-benchmarks](../interaction-benchmarks/README.md)（目前只有目录规范，未制作新的原型）。
- [ ] 按获授权的具体任务准备必要的代表性场景/状态并由项目所有者实际体验、明确签收与冻结 Token；`灵感/` 候选 HTML 不等于正式证据，`UI-G0A NOT APPROVED`。
- [ ] 正式 MVP 业务代码、SQL/RPC/Auth/Edge/R2 仍等待项目所有者下一步授权；D3-UI-X01～X18、UI-G3 和后端安全 E2E 仍 NOT RUN。
- [ ] **DEC-02 A Edge 实施门禁**：去除 Aisenlens 小 JSON Worker/staging 强依赖，落地 JWT/字节体白名单/条件 final/DB pending→ready/对账和私有直取下载；`256 KiB` 和版本上限仍只候选，待真实产品字段冻结。
- [ ] **DEC-06 A 先验证 SQL 只读批量 Auth 用户查询**：真环境检查 auth.users 最小读权、aal2/名册/blocked、分页 UUID[] 上限及 P50/P95；失败直接使用批准的单 Edge 批量聚合回退，禁止放开 auth.users Data API。
- [ ] **DEC-04/05 新项目唯一合同实现**：Free 指针及不可变版本、双模式直授/强类型幂等、实际 RPC 函数签名/GRANT/RLS/计时/并发负向测试；**上线前不保留旧签名、兼容适配层或双轨代码**，只验证当前调用方。

## F01～F08 / 数据权限与兼容性（全部缺真实运行证据）

- [ ] 依 [F01～F04 安全收敛](aisencore-mvp/aisencore-f01-f04-security-convergence-design.md) 与 [D1 物理/可信事务](aisencore-mvp/aisencore-mvp-d1-database-implementation-design.md) 在隔离环境实际运行 RLS/GRANT/RPC/owner/`SECURITY DEFINER` 搜索路径与权限拒绝、L0～L8 锁顺序/并发；验证 M1～M5，禁止将文档设计状态误记为安全 PASS。
- [ ] 依据 [F05～F08 接口与版本验收](aisencore-mvp/aisencore-f05-f08-contract-compatibility-readiness-design.md) 锁定并核验真实 SDK、CLI、PostgreSQL/PostgREST、Auth、Edge、Cloudflare R2 版本，执行 F05-C01～C12 及 V00～V07；查验暴露 schema 的显式 GRANT、请求指纹/字段 NULL 语义、并发幂等与对象最终一致性。
- [ ] 按**DEC-02 A** 在隔离环境验证 Aisenlens **受保护 Edge 接收非敏感 JSON→可信校验/条件创建 R2 final**、`ready + 有效 pending` 原子配额、DB/R2 单边故障/物理对象清理/短 GET/手动类别恢复和实际费用；**不再验证作为首发 JSON 前置条件的 staging PUT/CopyObject/Worker**。施工参考[D2](aisencore-mvp/aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)、[D3](aisencore-mvp/aisencore-mvp-d3-admin-infrastructure-design.md)。
- [ ] [D4 55 项 I/R/A](aisencore-mvp/aisencore-mvp-d4-test-and-readiness-review.md)、[AUTH-P01～P12](aisencore-mvp/aisencore-mvp-auth-entitlement-mfa-efficiency-design.md)、[BAAS-Q01～Q10 安全测试指南](../development/testing/README.md) 仍全部 **NOT RUN**；BAAS 的消费型 RPC 只在未来确有此业务时触发，不新增本轮积分/平台 AI 扣费功能。

## U03～U11 剩余产品与运营决定（不将候选参数写成确认）

- [ ] **U04/U09/U10/U11 — 产品实现前**：确认 Free/Pro 实际 feature/limit key 与云备份额度、白名单非敏感配置字段与 JSON 版本、保留版本数/期限/回滚策略，以及 Pro 复核间隔/离线行为的真实测量；**15 分钟 TTL、10 版**均为候选。[用户决定权威](aisencore-mvp/aisencore-u03-u11-user-decisions-2026-10-22.md)
- [ ] **U05/U08 — Admin 初始化与发码前**：确定可恢复的实际管理员/备用因素责任与丢设备演练、首批发码数量/码失效时间/授权时长；**100/批**只是候选。MVP **TOTP MFA 必做**，无需重新决定是否开启。
- [ ] **U06/U07/U03 — 公开服务前**：正式域名、Auth 回调白名单、品牌邮件/SMTP、账号删除核验渠道与必要留存期限、隐私与反滥用流程、长期/永久 Pro 的运营文案及备份保留/恢复政策。U03 已确认公众开放是**未来运营目标**，不等于现在可上线。

## 实施 / 运营准入

- [ ] 取得真正的编码/数据库/云配置/测试授权后，按 [MVP 总计划](aisencore-mvp/aisencore-mvp-implementation-design-master-plan.md) 分阶段实现 Supabase/Auth/RPC/Edge、React-admin/MFA 与 Aisenlens/R2；生产密钥/第二管理员凭据不得进入仓库。
- [ ] 真实测量 Auth/Pro 权益复核与 Admin 网络请求数、P50/P95、TOTP 低打扰体验、数据库与 Edge/R2 用量和成本；不能把 Unlimited API Requests 误当无限算力，也不能用过期 JWT 声明代替现行 Pro/Admin 授权。
- [ ] 公共服务开放前完成注册确认/邮件送达/撤权、账号注销、日志脱密、管理员恢复、数据备份及恢复演练、正式迁移回滚、真实测试报告，获独立发布批准。

## 计划与证据的清理规则

每个新任务先确定是否需要新的执行计划；**完成后**把长期有效的规则/证据回写对应 spec/architecture/development/设计正文，把本文件的对应待办按实际结果关闭或更新，然后依据 [Plans/README](./README.md#完成与删除) **删除完成的执行计划、冗余草案与过期入口**。本文件只记录真正未完成事项，不能把“文档静态审查通过”视为真实系统 PASS。
