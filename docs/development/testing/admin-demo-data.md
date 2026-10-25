# Admin 本地合成数据与浏览器验收

状态：本地体验场景初版已运行，完整业务 E2E/视觉签收仍未通过。属于 D3 前端完备化专项计划。只连接本地 Supabase，不对接真实 SaaS。

## 启动

在 Windows CMD 先进入仓库根目录：

    cd /d E:\Projects\Aisencore

依次执行：

    pnpm dlx supabase start --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
    pnpm run setup:local
    pnpm run setup:dev-admin
    pnpm run seed:admin-demo
    pnpm run dev

访问 http://localhost:3000/。开发固定邮箱 admin@aisencore.test、固定密码 Admin123456!；首次需绑定 TOTP。根 README 有安全限制与其他启动说明。

## 合成场景记录（实测）

| 类型 | 数量 | 内容 |
| --- | ---: | --- |
| 产品 | 4 | 运行两种、暂停一种、草稿一种 |
| GoTrue 用户 | 24 | aisen-demo-01 ～ aisen-demo-24 @aisencore.test，随机密码 |
| 产品成员关系 | 48 | active / left / suspended 各种状态 |
| Pro Grant | 26 | 有效、永久、过期、撤销、核销来源 |
| 码发行批次 | 3 | 演示批次请求编号 |
| 码安全记录 | 18 | 前缀、核销次数、过期与撤销；无任何可恢复明文 |
| 合成核销 | 6 | 产品、用户、权益的关联数据 |
| 成员事件 | 61 | 加入、退出、暂停 |
| 合成管理员审计历史 | 10 | demo_fixture_preview 标记，不能当做真实合规审计 |
| 合成账号限制 | 2 | blocked |

既有 aisenlens 产品和本地 admin 不属于 fixture，保留不覆盖。所有 demo 产品以 demo_ 开头，合成账号以 aisen-demo- 开头。脚本第二次运行可保持数量稳定，不会倍增。

## 命令与安全

    pnpm run seed:admin-demo
    node scripts/test-d3-authenticated-pages.mjs
    pnpm typecheck
    pnpm lint
    pnpm build
PowerShell 验收正式生产构建（不是部署）：

    $env:AISENCORE_UIQA_PREVIEW='1'; node scripts/test-d3-authenticated-pages.mjs

验收在独立 Chrome profile、Vite 3396 端口进行；本机 TCP 3397 设排他锁，**同一时间不能启动两份**，否则临时记录会使整体列表 count 不稳定。真实 GoTrue/TOTP `aal2` 会话浏览全部列表/详情、范围恢复及用户邮箱 RPC，并实际执行随机 QA 产品创建/启停、成员两种状态暂停恢复、Grant 授予/撤销、发码与单码/整批撤销、平台封禁/解封与管理员授予/撤权。核查真实数据库/管理审计、旧 JWT 撤权即时失效、UTF-8 TXT/CSV 文件，拦截真实 Chrome 发码 POST 以 HTTP 503 注入 UNKNOWN 并原 request_id 安全重试；首次码**不截图或写日志保留明文**。退出前严格核查并删除随机临时 QA 用户、产品与关联数据，不修改 `demo_` 或人工创建记录。完整通过范围与待补用例见 [D3 验收矩阵](../../Plans/aisencore-mvp/d3-acceptance-matrix.md)。

造数脚本在写入前确认 API=127.0.0.1:55321、DB=127.0.0.1:55322 和本机 Docker 容器 supabase_db_Aisencore。Auth 用户通过本机 GoTrue 创建；SQL 仅用于合成演示记录，不能将 SQL 操作视为真实受保护 RPC 测试成功。无业务密码、service_role 或兑换码明文写入浏览器 bundle。

浏览器脚本创建临时合成管理员，经真实 GoTrue Password + TOTP 达到 AAL2，在隔离 Chrome 验证 Dashboard、产品、用户 360、Pro/发码/账号操作表单、其余 10 个业务列表以及 8 个详情路由。实际操作了账号精确邮箱查找（返回 1 条）和 `aisenlens` 无成员→点击切换全平台恢复 48 条记录。生成 1440/1000/390 CSS px 截图至 docs/Plans/aisencore-mvp/ui-evidence/；结束后移除临时管理员，不触碰本地固定 admin 的 MFA。**这些 PASS 是真实已认证查询、路由、部分控件与响应式检查，不能替代 18 项全部危险写操作 E2E、无障碍或视觉签收。**

若顶部显示 `aisenlens` 而成员页为空，这是正常数据范围：演示成员主要归属 demo_atlas/demo_orbit/demo_harbor，不向用户原有 aisenlens 插入假成员。成员页提供切换全平台的明确按钮；回到全平台即可浏览 48 条样本。

## 持久数据清理

默认持续保留用于本地体验。受控清理命令 seed:admin-demo:clean 尚未实现，不能以全库 db reset 替代，以免删除用户自己的数据/MFA。清理前必须识别 fixture 来源、逐项预览外键和引用、明确确认；绝不清理开发者人工操作产生的业务记录。

用户精确查询演示样本时可搜索 aisen-demo-01@aisencore.test，并访问用户综合详情。合成审计行仅供视觉展示，并非真实操作证据。
