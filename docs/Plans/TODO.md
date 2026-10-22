# AisenCore MVP 待办与未验收关口（当前有效）

> **状态：ACTIVE / 未实现与未验证。** 本文件只收拢已完成设计阶段**留下的真实未完任务**，不是新的业务需求、第二套产品政策或已经获准执行的代码计划。各项业务定义以 [spec](../spec/requirements.md) 和 [architecture](../architecture/README.md) 为唯一权威；执行顺序、授权和门槛见 [MVP 总计划](aisencore-mvp/aisencore-mvp-implementation-design-master-plan.md)。**标记 [ ] 表示没有实测或没有获批**。日期 2026-10-22。

## 本轮审查整改（DEC-01～06 已批准，运行整改未完成）

- [ ] 按[整改总计划](./20261022-review-remediation/master-plan.md)、[S0 事实](./20261022-review-remediation/s0-evidence-and-design-decisions.md)、[设计闭环证据](./20261022-review-remediation/document-design-closeout-evidence.md)逐项关闭 G-01～04、B-01～03、M-01～03、A-01～04 与 X-01～04。**本轮不依赖新用户决策的文档设计已收敛；代码、SQL、云端、Auth/MFA、R2、Admin UI 运行验收全部 NOT RUN**，不得将静态交付写成系统 READY。
- [x] 2026-10-22 项目所有者已批准[DEC-01～06 推荐 A 的统一决策](./20261022-review-remediation/owner-batch-decisions.md)，已写入当前 spec/architecture：兑换显式 product_key、限定小 JSON Edge→R2、G0A/B/G3、Free 当前版本指针、双模式直授与强类型幂等、Auth 限权 SQL RPC 优先/不安全则回退 Edge。**审批不是代码/迁移/上线许可；U04～U11 的真实字段、责任和运营参数仍在本 TODO 后续任务中。**

## UI-G0（阻断 Admin 正式前端编码）

- [ ] 按 [全局 Admin UI 设计系统](../architecture/applications/admin-ui-design-system.md) 冻结字体、语义色、布局、组件及 Token 版号；当前只存在候选文本规范。
- [ ] 产出**登录/MFA、兑换码、套餐、用户/成员**四类真实高保真视觉基准与多宽度参考，完成视觉/组件状态审阅。
- [ ] 由项目所有者真实看过视觉基准后**明确签收**，记录版号/日期/批准证据，UI-G0-G01～G12 完成审查，才将 **UI-G0A 从 NOT APPROVED / BLOCKED 转为 APPROVED**；未批准前不启动正式 Admin Theme/Layout/业务页面编码。
- [ ] UI 代码开发获得独立授权后按 [D3-UI 页面规格](aisencore-mvp/aisencore-mvp-d3-ui-admin-uiux-design.md) 实施；真实运行 D3-UI-X01～X18 和后续浏览器 UI-G3 视觉、响应式、键盘/无障碍、权限/错误 E2E。开发规则统一从 [frontend](../development/frontend/README.md) 进入。

- [ ] **G0B/G3 已批准顺序但尚未执行**：仅 G0A 真实签收后，在独立开发授权下做小型 React-admin/MUI 可运行原型，再完成全部页面及 G3 浏览器真实测试；不得把六项架构 A 的批准冒充 G0A 视觉通过。
- [ ] **DEC-02 A Edge 实施门禁**：去除 Aisenlens 小 JSON Worker/staging 强依赖，落地 JWT/字节体白名单/条件 final/DB pending→ready/对账和私有直取下载；`256 KiB` 和版本上限仍只候选，待真实产品字段冻结。
- [ ] **DEC-06 A 先验证 SQL 只读批量 Auth 用户查询**：真环境检查 auth.users 最小读权、aal2/名册/blocked、分页 UUID[] 上限及 P50/P95；失败直接使用批准的单 Edge 批量聚合回退，禁止放开 auth.users Data API。
- [ ] **DEC-04/05 迁移与兼容**：Free 指针+不可变历史、双模式直授/强类型幂等、旧客户端/函数签名/GRANT/RLS/计时/并发负向测试后才实施。

## F01～F08 / 数据权限与兼容性（全部缺真实运行证据）

- [ ] 依 [F01～F04 安全收敛](aisencore-mvp/aisencore-f01-f04-security-convergence-design.md) 与 [D1 物理/可信事务](aisencore-mvp/aisencore-mvp-d1-database-implementation-design.md) 在隔离环境实际运行 RLS/GRANT/RPC/owner/`SECURITY DEFINER` 搜索路径与权限拒绝、L0～L8 锁顺序/并发；验证 M1～M5，禁止将文档设计状态误记为安全 PASS。
- [ ] 依据 [F05～F08 接口与版本验收](aisencore-mvp/aisencore-f05-f08-contract-compatibility-readiness-design.md) 锁定并核验真实 SDK、CLI、PostgreSQL/PostgREST、Auth、Edge、Cloudflare R2 版本，执行 F05-C01～C12 及 V00～V07；查验暴露 schema 的显式 GRANT、请求指纹/字段 NULL 语义、并发幂等与对象最终一致性。
- [ ] 验证 R2 私有备份 staging→final/条件复制、quota `ready+reserved` 事务与失败补偿、签名/上传/恢复/过期对象清理以及真实资源开销；依 [D2](aisencore-mvp/aisencore-mvp-d2-api-auth-aisenlens-implementation-design.md)、[D3](aisencore-mvp/aisencore-mvp-d3-admin-infrastructure-design.md) 取得可复核证据。
- [ ] [D4 55 项 I/R/A](aisencore-mvp/aisencore-mvp-d4-test-and-readiness-review.md)、[AUTH-P01～P12](aisencore-mvp/aisencore-mvp-auth-entitlement-mfa-efficiency-design.md)、[BAAS-Q01～Q10](aisencore-mvp/aisencore-mvp-baas-quota-security-lessons.md) 仍全部 **NOT RUN**；BAAS 的消费型 RPC 只在未来确有此业务时触发，不新增本轮积分/平台 AI 扣费功能。

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
