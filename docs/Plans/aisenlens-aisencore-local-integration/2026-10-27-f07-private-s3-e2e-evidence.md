# F07｜Core × Lens 本地私有附件真实链路证据（2026-10-27）

**结论：本地独立 S3 协议服务的正向链路 PASS；真实 Cloudflare R2、部署、生产性能与完整 F07 故障对账未验。** 对应 [C 反馈阶段计划](./04-stage2-feedback.md)与 [TODO LENS-05](../TODO.md)。

## 实际执行

在 Windows 开发机 AisenCore 仓库执行：

```powershell
node scripts/test-f07-edge-images-local-s3.mjs
```

实测全部返回：

```text
F07_REAL_LENS_CHROME_TWO_IMAGES PASS browser -> Edge -> S3 -> DB; QA deleted
F07_REAL_EDGE_PRIVATE_S3 1 image(s) PASS JWT -> Edge -> DB -> signed PUT/GET; owner 200 stranger 403
F07_REAL_EDGE_PRIVATE_S3 2 image(s) PASS JWT -> Edge -> DB -> signed PUT/GET; owner 200 stranger 403
F07_REAL_EDGE_ADMIN_ZIP PASS current AAL2 allows private export, AAL1 403, images byte-identical
F07_REAL_EDGE_S3_REPLAY PASS no additional writes
F07_REAL_EDGE_S3_CLEANUP PASS administrator and 2 platforms unchanged, zero QA residue
```

链路使用真正运行中的本机 Supabase GoTrue/Kong/PostgREST、已有 R-16/F06 迁移及正式 `feedback-submit` / `feedback-image-access` / `feedback-export` Edge 入口；Node 本机 **S3 协议 fixture** 接收 AWS SDK 签名请求，不是云账号/R2，也不具备真实 R2 的签名加密验证、生命周期或一致性保证。

1. Lens 自己的 `tests/features/workflow/core-account-feedback.browser.test.js` 通过专用 `AISENLENS_EXPECT_LOCAL_S3=1` 环境开关，在真正 Chrome 中登录真实临时 Auth 账号，选 2 张有效 PNG，从设置页面向 Edge 发起表单请求；数据库断言确实产生 **1 个反馈、2 个附件**，成功提示为收件而非解决。
2. 单独用真实 GoTrue owner JWT 调用正式 Edge 的 1 图和 2 图提交、同 `request_id` 重放；断言数据库附件条数、每张实际 PNG 字节、内容寻址签名条件 PUT 和重试不会再 PUT 同对象。
3. 其他用户请求 `feedback-image-access` 获得 **403**；owner 获得 **60 秒签名 GET URL**，读取结果和原始 PNG 逐字节相同；URL 不泄露可直接公开访问的对象路径凭据。
4. 临时管理员先用 AAL1 请求 `feedback-export` 获得 **403**，通过真实 GoTrue TOTP MFA 获 AAL2 后导出含 2 图的 ZIP；解压结果逐字节核对两个附件，成功，且通过 Admin 审计逻辑。
5. 自动 `finally` 清除测试账号、临时 Admin 授权、反馈、事件、附件、审计、临时 `supabase/functions/.env` 及内存 S3 对象；最终复核原库仍仅 **1 个 Admin Auth 身份、2 个 active 产品 `aisenhub`/`aisenlens`、0 测试会员/反馈/附件**。

## 安全边界与未完成

- 严格核对本机 Core API `127.0.0.1:55321` 与 DB `127.0.0.1:55322`，只有这些已知服务才能测试；拒绝覆盖已存在的 `supabase/functions/.env`（以独占新建方式生成），且所有变量使用 **完全合成**本地访问密钥。测试期间独立 S3 fixture 侦听端口 **3418**，结束关闭；另以 3412 端口互斥保护其它 Edge 测试。
- S3 fixture 只检查 SigV4 签名结构、条件 PUT 及对象字节；它**不**密码学验证签名、不模拟 Cloudflare R2 的所有语义，不能证明上线安全或真 R2 生产可用。
- 原有无对象配置时，另有 Lens Chrome `503` fail-closed、拒绝第三图、保留原 `request_id` 两次重试及显式清空测试；零图“201 已提交但前端仅看见 503”→200 replay 亦 PASS。
- **仍 NOT RUN**：真实 R2（第三阶段授权门禁）、S3 第二图后存储故障及 DB commit UNKNOWN 的真实容器注入、引用安全老对象回收、真实对象过期计时的浏览器验证、Admin UI 人工检查与大文件/性能矩阵。F07 整体保持 **PARTIAL**。
- Lens `8443` 邮件 callback：Core `supabase/config.toml` 已写入白名单，但**运行中** `supabase_auth_Aisencore` 的 `GOTRUE_URI_ALLOW_LIST` 仍只有旧 3000 地址；需在保护 DB 的前提下安全加载并完成 Lens Chrome 邮件回调验证。已有真实 GoTrue+Mailpit 注册/确认/恢复测试并不等价于 Lens 8443 PASS。

脚本和两仓未提交改动保留，**未提交、未推送、不迁移/重置现有数据库、不访问真实云对象存储**。
