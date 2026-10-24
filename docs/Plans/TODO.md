# AisenCore MVP｜未完成工作与准入门槛

> 更新：2026-10-24。这里只记录**尚未完成的实现、未通过的验证和需要项目所有者确认的业务参数**。权威见 [需求](../spec/requirements.md) 和 [架构](../architecture/README.md)，实际进度见 [D1 启动计划](./aisencore-mvp/aisencore-mvp-development-kickoff.md)。

## D1｜当前开发

- [ ] **补完关系数据模型**：首迁移已建立产品、成员、成员事件、管理员、全局限制、审计六表；继续完成 Pro Grant、兑换批次/码、核销、失败限流与约束/索引。不得重建公共 `plans` 或 SaaS Free/Pro 功能与额度列。
- [ ] **实现可信 RPC**：公共 `SECURITY INVOKER` 薄外壳、非暴露 `private` 最小权限内核，成员加入/退出/重入、管理员状态转换、双参数兑换、一次性发码、直授/撤销，确保 JWT 主体校验、L0～L8 锁序、同事务审计及幂等。不得预设真实管理员 UUID。
- [ ] **完成隔离环境安全测试**：本地 PostgreSQL 17.11 已应用首迁移，**35/35 pgTAP**（结构/权限和模拟声明的 RLS）通过；仍需真实 Auth 签名 JWT/HTTP、MFA `aal2`、owner/EXECUTE/GRANT、private 直调负例、多事务锁/回滚、发码与续期并发、限流和完整 [I/R 验收](../architecture/backend/api-contract-and-mvp-acceptance.md)。
- [ ] **启动并验收本项目完整本地 Supabase**：当前专用 PG 端口 `55322` 健康；Auth/PostgREST/API 网关尚未完成真实请求验证，不可借其他项目的服务冒充通过。

## D2 / D3 / 产品接入 / D4

- [ ] **D2 身份、公共 API 和 MFA**：邮箱确认/找回、统一 JWT 与多 SaaS 会话、当前 Pro 资格与时段、业务拒绝 200/无效 JWT 401/服务故障 503 的稳定映射、Admin TOTP 注册/校验/刷新/撤权和失设备恢复。
- [ ] **D3 React-admin**：成熟组件、单一 MUI Theme、全平台/单产品上下文、成员/Pro/发码/审计（反馈仅在另行批准服务端合同后实现），首响明文和 UNKNOWN 恢复；[V6 离线原型](../interaction-benchmarks/README.md)仅是交互参考，正式 UI 视觉确认与 E2E 尚未完成。
- [ ] **AisenLens/R2**：SaaS 持有各自功能/额度；可信 Edge 校验非敏感小 JSON、R2 条件创建不可覆盖 final、DB pending/ready 配额预留、故障补偿、属主 ACL、受控恢复与清理。
- [ ] **D4 发布验收**：真实 JWT/RLS/RPC、并发/性能、MFA、备份恢复、前端浏览器与无障碍、生产 SMTP、账号注销、隐私/反滥用、Cloudflare Pages/R2、密钥隔离及迁移恢复演练；正式公开上线需独立批准。

## 到相应阶段才需确认的参数

- [ ] **AisenLens**：Free/Pro 业务功能键和额度、允许备份的 JSON 字段、保留版数/期限及恢复/断网策略；15 分钟缓存、10 版、256 KiB 等只是候选。
- [ ] **管理员与兑换码**：实际管理员及备用 TOTP 因素恢复责任、首发单批数量上限、码有效期、授权期限。历史“100/批”不是已定规则。
- [ ] **公开运营**：域名、Auth 回调、SMTP 服务商、发件身份、注册反滥用、账号注销渠道与合法留存期限、隐私和恢复流程。公众开放是**业务目标**，不是目前的上线许可。

> 已完成的历史计划、审批/交接过程和原型迭代不再留作 TODO；需追溯时使用 Git 历史。
