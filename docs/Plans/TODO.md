# AisenCore MVP｜未完成工作与分阶段准入门槛

> 更新：2026-10-24。这里只记录**尚未完成的实现、未通过的验证和需要项目所有者确认的业务参数**。权威见 [需求](../spec/requirements.md) 和 [架构](../architecture/README.md)，当前唯一总计划见 [MVP 开发总计划](./aisencore-mvp/00-mvp-master-plan.md)，每次执行一个子里程碑。

## Phase D1｜数据库与可信 RPC（当前执行阶段）

- [ ] **D1-M1 补完关系数据模型**：首迁移已建立产品、成员、成员事件、管理员、全局限制、审计 6 表（35/35 pgTAP 通过）；继续创建 `private` schema、`private.is_platform_admin()`、`entitlement_grants`、`redemption_code_batches`、`redemption_codes`、`redemptions`、`redemption_rate_limits` 及无 `code_hash` 安全投影。不得重建公共 `plans` 或 SaaS Free/Pro 功能与额度列。
- [ ] **D1-M2/M3 实现可信 RPC**：公共 `SECURITY INVOKER` 薄外壳 + 非暴露 `private` 最小权限 `SECURITY DEFINER` 内核；完成 `check_access(product_key)`、`get_my_products`、`ensure_membership`、`leave_product`、`rejoin_product`、`redeem_code(product_key, code)`（DEC-01 防侧信道与失败计数不回滚）、`admin_create_codes`（首响明文）、`admin_grant_entitlement`（DEC-05 互斥模式与幂等）及管理状态转换，严格执行 L0～L8 锁序与 M1 最后一名合格管理员保底。
- [ ] **D1-M4 完成数据库与双连接并发锁验证**：补充 `003`～`005` pgTAP 测试，并通过双连接并发脚本实测 `LCK-01`～`LCK-07`（管理员互撤保底、同产品 Pro 续期并发、单次码争抢、`left→suspended→left`、限流不回滚、零死锁）。

- [ ] **D1 关键修正验证**：产品状态 `FOR SHARE§ 与暂停竞争、撤销 CHECK 的 NULL 负例、Pro 新周期 §starts_at§ 顺延起点、私有函数直调授权、技术异常和失败限流的回滚/持久化区分。

## Phase D2｜统一身份、公共 API 与 Admin MFA（可提前准备本地 Auth，实际安全准出待 D1 接口验证）

- [ ] **D2-M1 完整本地 Supabase 栈与 HTTP 契约**：启动本项目专属 GoTrue/PostgREST/Kong/Inbucket（端口 `55321`～`55327`），验证 `CheckAccess` 业务拒绝 HTTP 200、`RedeemCode` 预期拒绝 HTTP 200 及其他写入 401/403/409/422/503 稳定映射。
- [ ] **D2-M2 落地 DEC-06 管理员受限用户查询**：在真实 Auth 环境下实现并验证受保护只读 SQL RPC `admin_lookup_users`（若权限/性能不成立则立即回退受保护 Edge 批量聚合），通过 `REV-DEC06-01`～`06`。
- [ ] **D2-M3 真实签名 JWT 与 Admin TOTP MFA 验收**：验证邮箱注册确认、找回密码、`/auth/confirm` 与 `/auth/reset-password` 落地页、本地登出隔离、JWKS 验签，以及 `AUTH-P01`～`P12`（TOTP enroll/challenge/verify 升 `aal2`、日常操作零额外 MFA 请求、撤权即时拒绝）。

## Phase D3｜React-admin 正式管理前端（可先建脚手架，正式敏感操作验收需 D1/D2 实测）

- [ ] **D3-M1/M2 基础工程、单一 MUI Theme 与 MFA 登录流**：初始化 Vite + React + TS + React-admin + MUI 工程，建立唯一 `theme.ts`、`authProvider`（支持 TOTP 引导升 `aal2`）与 `dataProvider`（RLS 读取 + 虚拟 `users` 批量邮箱补全 + 单事务 RPC 写入）。
- [ ] **D3-M3 核心业务 Resource 与高危恢复**：实现全平台/单产品上下文切换，以及产品、成员、Pro 直授/撤销、兑换码批次（首响明文仅驻留易失组件内存，刷新即焚；`UNKNOWN` 先按 `request_id` 查状态再分步确认撤销与重发）、管理员/限制与只读审计页面。
- [ ] **D3-M4 浏览器 E2E 与视觉签收**：真实浏览器实测通过 `D3-UI-X01`～`D3-UI-X18`（含响应式、键盘无障碍、密钥零泄露），并由项目所有者完成正式 UI 视觉评审。

- [ ] **D2/3 安全边界**：核验实际 JWT 签名方式及旧 §aal2§ 会话/因子撤销差异；前端明文不落持久化缓存，不能假设首次 Network 响应不可见。

## Phase S1｜AisenLens 接入与 R2 私有备份（真实服务待相关 Core API 验证及 U09/U10 确认）

- [ ] **S1-M1/M2 备份配额预留 RPC 与受保护 Edge Function**：建立备份元数据与 `pending/ready` 配额原子预留；实现 Edge 校验 JWT/Pro/属主与白名单非敏感小 JSON，条件创建唯一 R2 final（`If-None-Match: "*"`），并落地跨系统失败对账与孤儿清理。
- [ ] **S1-M3 客户端低请求量复核与恢复验证**：实现离线 Free 零联网、Pro 按需复核 + single-flight 去重、手动选版本→预览分类差异→按类别替换恢复，实测通过 `REV-DEC02-01`～`08`。

- [ ] **D3 范围约束**：反馈收件箱服务端合同尚未批准，不因 V6 离线原型存在就自动建设。正式目录唯一为 §apps/admin/§，不可改用 §packages/admin§。

## Phase D4｜发布验收与生产就绪（若声称首发 AisenLens 备份，则 S1 必须准出）

- [ ] **D4-M1/M2 全链路验收与应急演练**：真实运行并归档 `I-01`～`I-28`、`R-01`～`R-15` 及全部 `REV-*` 证据；测量核心 RPC P50/P95 延迟；完成 `A-04` 单人运营双 TOTP 因素失设备恢复演练与人工账号注销演练（`I-25`）。
- [ ] **D4-M3 生产配置核查与文档收尾**：核对生产 SMTP、回调域名、Cloudflare Pages/R2 最小密钥隔离与数据库备份恢复；全仓清理过期过程文档；**正式公开上线与云资源变更须经项目所有者独立明确批准**。

- [ ] **发布/账号注销缺口**：逐表梳理 §auth.users§ 的 §ON DELETE RESTRICT§、历史合法留存与匿名化、跨 SaaS 数据/R2 清理；运行的实测区分 Mock/真实 R2/生产环境，不允许将 Mock PASS 冒充真实 R2。

## 到相应阶段才需确认的参数

- [ ] **管理员与兑换码（D3/D4 前）**：实际主管理员及备用 TOTP 因素恢复责任人（A-04）、单次批量发码上限（`100/批` 为候选）、码默认有效期与永久码发行策略。
- [ ] **AisenLens 专项（S1 前，U09/U10/U11）**：允许备份的非敏感 JSON 字段白名单、单文件字节上限（`256 KiB` 为候选）、保留版本数（`10 版` 为候选）/期限、以及 断网启动新纯本地 Pro 任务的 U11 与待测 15 分钟新鲜度窗口。
- [ ] **公开运营（D4 上线前，U06）**：生产域名、Auth 回调白名单、自定义 SMTP 服务商与发件身份、注册反滥用、人工账号注销申请渠道与法定留存期限。
