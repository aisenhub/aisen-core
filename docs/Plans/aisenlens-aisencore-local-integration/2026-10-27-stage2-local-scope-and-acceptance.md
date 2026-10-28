# 第二阶段本轮实际交付范围与联调证据（2026-10-27）

**所有者本轮决定**：只要求 **AisenLens WebApp 前端 ↔ AisenCore 本地 Auth/REST/RPC/Edge ↔ AisenCore Admin** 的实际业务闭环。不把无关的 Lens 视频录制/长片、分析 AI 语义、整个旧设计系统专项放进本轮阻塞。**完整分析模板云备份及依赖真实外部对象存储/云账号的配置**明确顺延下一轮；本轮不实现或假装验收它。第三阶段的真实 R2、HTTPS/SMTP、云部署和正式发行仍需独立许可。本轮留存真实本地功能安全证据、NOT RUN 与阻塞，不能用 Git 合并/TypeScript/Mock 替代功能通过。

**2026-10-28 更新：先前 Admin 超时 QA 残留已恢复，当前只读清洁检查 `LOCAL_ADMIN_QA_BASELINE_PASS`。** 写库测试仍必须逐次执行前后门禁，独立 Admin Chrome 分段测试仍存在 FAIL；请按[当前三端收口计划](./2026-10-28-stage2-local-closure-execution-plan.md)推进，不能把数据恢复或既有分模块 PASS 当成整体准出。旧故障与当时清理受阻的历史仍见[事故记录](./2026-10-27-admin-uiqa-timeout-and-recovery.md)。

## 完成的可重放本地切片

| 功能 | 证据 | 结果 |
|---|---|---|
| Core JWT/SQL 注册确认/登录、密码恢复、AAL2 | `node scripts/test-d2-auth-api-mfa.mjs`，真实 GoTrue/Mailpit/Auth/API/SQL | 既有 PASS；Lens 页面专项单独核对 |
| Lens 正式登录/本地登出、Free 离线不回退 | Lens `tests/features/workflow/core-account-feedback.browser.test.js`、`test:account-entry-browser` | Chrome PASS，QA 自动清理 |
| Core Admin 真 AAL2 发码 → Lens 兑换 → 产品成员/Grant/核销 | Lens `node --test tests/features/workflow/core-entitlements.browser.test.js` | PASS，服务端同事务，会员零→一 |
| 管理员授权撤销、永久直授与 R-16、封禁/解封 | 同一真实 Lens Chrome/管理员 RPC/SQL 跨仓测试 | PASS，撤后 Free，永久 Pro 拒兑新期限码且未耗码，拒绝不是 Free |
| 正式 Lens 零图/两图反馈 → Core JWT Edge → Postgres/本机私有 S3 | `node scripts/test-f07-edge-images-local-s3.mjs` | Chrome PASS，0/1/2 图、固定 UUID、本人短签名 GET/其他用户 403 |
| Core Admin AAL2 反馈 ZIP 与隔离图片字节 | 同一 F07 脚本 | PASS：AAL1 403、AAL2 ZIP 原图片一致 |
| 邮件确认/重置 Lens 页面 | `python scripts/test-stage2-lens-mail-browser.py` + Lens `core-auth-mail.browser.test.js`，临时本地 9443 端口 | **PASS 退出码0 / 1/1**：不同 Chrome 配置确认注册、重置密码，新旧密码验证、QA 清理及 8443 Auth 回滚。此后增加了“已用恢复链接不可再次改密”的负例代码，**该新增负例尚未重跑**（已因 Admin QA 残留暂停写库 E2E） |

**Admin 长链路补充证据**：真实 AAL2 Chrome 已完成可见的发行码首次响应明文、TXT/CSV 导出清除、发码 UNKNOWN/429 对账、管理员授撤权与旧 AAL2 拒绝、成员暂停恢复、Grant 503/429 及分页等断言，但单次 `test-d3-authenticated-pages.mjs` 在 320 秒超时而未到最终 `finally`，留下 QA 数据，故**整套 NOT PASS**。已加入前置脏库拒绝检查，将脚本拆为 navigation、operations-grants、operations-issuance、operations-responsive 四个独立切片（静态校验 PASS，尚未在干净 DB 上运行），详见 [恢复记录](./2026-10-27-admin-uiqa-timeout-and-recovery.md)。

## 需核对/补证，不能默认关闭

- **Auth**：多浏览器无历史会话的邮件页面、错误/重复/过期 token、refresh 被撤销和多标签旧响应；`8443` 正式本地 GoTrue 运行 allowlist 已更正，但已有同端口 Vite 进程没注入公开 Core 配置，因此独立测试 Vite 暂用固定 9443，运行后立即恢复 8443 Auth。旧 GoTrue 容器作为只读回滚备份保留。
- **成员与权益**：本次入口只有兑换时合法首次建成员，普通登录/反馈不能建；left/suspended/blocked、双产品隔离、并发限额、RATE_LIMITED/UNKNOWN、失效/撤销和 15 分钟快照边界按 B-T01～10 继续逐项证据。**永久兑换码发行被当前 Core 运营合同显式禁用**：不能为 QA 绕开 `LIFETIME_CODES_NOT_ENABLED`；用正式 Admin 直授永久 Pro 测 R-16。
- **反馈和 Admin**：四队列真实 Admin UI 的状态/筛选/version 409/敏感导出范围、两图第二图存储中断/DB commit UNKNOWN、审计孤儿只读清单后的安全引用二次确认仍需闭环；本地协议 fixture 检查签名请求结构，并非真实 Cloudflare R2 的密码学行为。
- **本地综合验收**：账号真实注册→兑换→反馈→Admin 操作及撤权/切号/失联应由同一固定环境出具实际 UI/HTTP/SQL/对象与审计证据；只在范围内裁剪原 E-01～08（备份的 E-04 顺延、不要求视频录制）。本轮未经所有者最终签收不称整个第二阶段已完成。
- **Core Admin UI**：本轮必须验实际管理业务路径、权限与失败处理；独立的全站视觉翻新、以往视频/AI专项不自动并入。本地无法执行的真实外部 SMTP、真实云 R2、生产域名与部署明确标为下一轮/第三阶段。

## 操作与数据边界

- PostgreSQL `supabase_db_Aisencore` `:55322` 不重置，所有测试开始/结束均确认只留真实 `aisenhub`/`aisenlens`、原管理员。合成 Auth、授权/核销、会员、反馈、临时对象和审计必须 finally 清理。
- 正式 Vite 端口 `8443` 已被原开发服务占用，且未注入 Core 配置；不得静默结束他人开发进程。只在测试内临时放行 `9443`，随后恢复原运行配置、验证服务健康。
- 不打印服务密钥、会话 JWT、TOTP、兑换码明文或私图签名 URL；不提交、推送、访问线上对象存储或触发部署。
