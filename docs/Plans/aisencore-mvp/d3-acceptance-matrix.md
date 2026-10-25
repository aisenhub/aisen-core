# D3 Admin 正式前端｜真实浏览器 / RPC / 安全验收矩阵

> 记录日期：2026-10-24。**本地开发数据库，保留长期 demo fixture**；不是生产环境准出，也不是设计所有者视觉签收。下列 `PASS` 只描述实际覆盖范围，不把部分用例冒充全项通过。
> 本次实际执行：本机 GoTrue/TOTP `aal2`、Kong/PostgREST、真实 Chrome、Vite 8 打包预览、PostgreSQL、Mailpit；临时账号与产品在自动回归退出时验证删除。未连接外部 SaaS/云数据库，也未使用真实用户数据。

## 测试矩阵

| 契约编号 | 当前覆盖 | 证据与尚未覆盖的部分 |
| --- | --- | --- |
| X01 跨设备响应式 | **局部 PASS** | 正式构建真实 Chrome：原6视口×5关键页面30组，新增10个业务列表在320/390/768/1024px重排40组，总计**70组视口×路由 PASS，无整页水平溢出**；仍未覆盖所有登录/详情在各个宽度的交互、真实浏览器缩放200%/400%以及真机。 |
| X02 真实数据与可信统计 | **局部 PASS** | Dashboard、10 列表、8 详情实际查询本机有 RLS 的表；演示审计明确标注模拟。尚未进行全 KPI 逐字段人工对账、数据规模负载校验。 |
| X03 未登录/AAL1/AAL2 | **PASS（访问隔离与正式 UI 登录链路）** | HTTP 普通用户/AAL1 特权 RPC 403；真实 Chrome 匿名和 AAL1 直接进入产品路由不会显示受保护数据；在 Chrome **实际输入账号密码→TOTP 六位验证码→AAL2 Dashboard** PASS。注：人为替换为 AAL1 浏览器储存后可能回到密码界面而非自动续接 TOTP，原会话无缝恢复的体验另待单独确认。 |
| X04 导航无需重复 MFA、撤权失效 | **局部 PASS** | 真实 Chrome 长序列无额外 `/auth/v1/factors` 请求，受保护 RPC 在管理员撤权/封禁后立即拒绝旧签名 AAL2 JWT；尚需因子撤销、全浏览器刷新令牌与过期场景。 |
| X05 产品管理 | **局部 PASS** | 浏览器真实创建草稿→启用→暂停→恢复，数据库/操作理由/审计均核对。产品名编辑以及各种分页状态组合、409 冲突表单提示未全覆盖。 |
| X06 有界身份查询 DEC-06 | **局部 PASS** | `admin_lookup_users` 精确邮箱、受限 UUID、白名单/异常拒绝；50 UUID × 15 次本机 HTTP P95 约 20ms 的烟测。缺有规模真实数据下 P95/EXPLAIN、网络失败后的扫描降级断言。 |
| X07 成员暂停/恢复 | **PASS（两种状态路径）** | 真实 UI `active → suspended → active` 和 `left → suspended → left`，核查原状态字段与 4 条受保护成员事件。 |
| X08/X09 历史套餐冻结/克隆 | **N/A（原合同已取消）** | 根据架构合同，替代标准是后端 Pro 授权、已发行码和 Grant 事实不能被 UI 期限改动篡改；数据库 pgTAP 为相关业务不变量提供部分覆盖，不能将取消项算为通过项。 |
| X10 Pro 期限与幂等 | **局部 PASS** | UI 30 天授权→受保护 Grant→撤销；SQL 验证 duration、explicit_window、永久模式互斥、非法参数及幂等重放；前端 Pro 503 UNKNOWN 跨刷新并以原管理员/原 request ID 幂等恢复（服务端已提交）及已知 429 拒绝已通过真实 Chrome + DB 验证；独立 `admin_find_grant_request` 只读查询已通过 AAL2/身份隔离 pgTAP 19项及真实 Chrome 503 后原请求缺失/已提交两条路径，刷新后只查不重复写；显式时间窗、永久模式及断网超时全部负例仍待完整点测。 |
| X11 发码参数和限额 | **局部 PASS** | Chrome 发码、SQL 非法批量/业务校验、同 request ID 幂等；数量边界、所有输入组合、429/503 超时联合负例尚未全部点测。 |
| X12 首响明文易失性 | **PASS（测试范围）** | Chrome 真实发码显示首响明文，TXT/CSV 下载内容匹配且 BOM/UTF-8 正确；持久存储、URL 无明文；下载内容验证后**立即删除明文文件并断言不存在**，结束时二次校验，残留即测试失败；确认后 UI 清空、重放无明文。首次成功 HTTP Response 在浏览器 Network 可见属正常事实，不宣称网络历史可被抹除。 |
| X13 UNKNOWN 安全恢复 | **PASS（已有与缺失路径）** | 模拟挂起请求的页面刷新，存在批次检查→不可重取旧明文→明确撤销；不存在批次→以相同 request ID 重试→仅创建一个。Chrome DevTools 真正拦截一次 HTTP 503 后验证 UNKNOWN、数据库无写入和原编号重试。 |
| X14 码/核销/审计只读安全 | **PASS（测试范围）** | Admin redacted summary 仅安全字段，`code_hash` 不可被 authenticated 用户直接 REST 读取，历史码不再提供明文；编译产物也执行独立静态安全扫描。 |
| X15 成员/账号/产品治理 | **局部 PASS** | 成员/产品状态变更、账号封禁/解封、管理员资格授予/撤销均经真实 UI/RPC、数据库及审计验证；被撤权者旧 JWT 被拒绝。M1 最后一名管理员规则已在数据库事务隔离中测试；由于存在固定本地管理员，不为制造 HTTP 409 而改动该账号。 |
| X16 401/403/409/429/503/网络断开 | **局部 PASS** | 真实 HTTP Auth/RPC 401/403/409/422 及业务拒绝 200；Chrome **真实 Fetch 网络拦截**对发码 POST 分别返回 503/429。503 ⇒ UNKNOWN、原 request ID 保留、后台无写入、核查后原编号重试；429 ⇒ 已知拒绝、清除待核实元数据、不创建批次。修复了 dataProvider 丢失 PostgREST HTTP 状态码的误判；另对 Pro 授权注入 HTTP 503 后保留请求并刷新，独立调用原始受保护 RPC 模拟服务端已提交，在 UI 刷新后以原管理员身份只读查询已提交的 Grant，不再重复发送写入，数据库确认仅 1 条；Pro 429 及时清理元数据且无写入。仍缺真实浏览器断网/超时及响应阶段丢包场景。 |
| X17 WCAG 2.2 AA/键盘/缩放 | **局部 PASS** | Chrome Tab 焦点具名控件、Escape 取消危险确认框且后端未写入，多宽度无水平溢出；生产预览实际 AAL2 Chrome 的 axe-core 已从16页扩展至**25个页面/状态（10类列表、8类详情、Dashboard、移动用户360、发码/Pro/治理表单、危险确认弹窗等）**，首轮281个元素违规经修复后 **25/25无 serious/critical 自动违规**，且自动化门禁会使新增严重违规令测试退出失败；证据 `ui-evidence/phase1-axe-wcag-baseline.json`。**尚不能声称完成 WCAG 2.2 AA**：axe incomplete、屏幕阅读器、焦点陷阱、浏览器实际缩放、IME与动态表单错误待人工/自动共同准出。 |
| X18 正式环境泄密与网络行为 | **局部 PASS** | `pnpm build` 路由级动态加载后主 App 块约 95 KiB（gzip31.6 KiB），MUI/vendor 最大约 366 KiB；bundle/source 静态扫描、真实 JWT/RLS 与窄列白名单通过；对 429/503 的浏览器实际请求响应已进行针对性注入。完整生产 CSP、所有真实请求/响应网络审计与生产密钥隔离签收未执行。 |

## 本地可复现命令（在仓库根目录）

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --prod
pnpm dlx supabase test db --local
python scripts/test-d1-concurrency.py
node scripts/test-d2-auth-api-mfa.mjs
node scripts/test-d3-authenticated-pages.mjs
$env:AISENCORE_UIQA_PREVIEW='1'; node scripts/test-d3-authenticated-pages.mjs
node scripts/test-d3-phase1-foundation.mjs
node scripts/test-d3-bundle-secrets.mjs
node scripts/test-d3-source-boundaries.mjs
node scripts/test-d3-missing-config.mjs
node scripts/test-d3-browser-smoke.mjs
git diff --check
```

浏览器 E2E 必须**单实例运行**，内部使用本机 3397 TCP 独占锁、3396 Vite 隔离预览端口及单独 Chrome profile；会创建、核验、精确清理随机 `qa_browser_*` 产品与 `admin-uiqa-*` / `ordinary-uiqa-*` Auth 账号。失败时也运行清理，遗留临时资源使退出码非零。**测试中下载的真实随机明文兑换码只存在于临时 Chrome profile，成功后销毁；不要截图或打印。**

### 第一阶段补充证据（截至 2026-10-24）

- `ui-evidence/phase1-axe-wcag-baseline.json`：16 个已认证页面/状态的 axe 规则逐页记录，第三轮违规项 0，仍有 incomplete 及未覆盖的动态状态；它不是人工 WCAG 签收。
- `ui-evidence/phase1-perf-browser-sample.json`：单次 Chrome 正式预览已认证 Dashboard 的导航和 JS 资源诊断样本，未经限速与重复测量；不是 Web Vitals 认证。
- `scripts/test-d3-phase1-foundation.mjs`：真实构建动态分块与四个已校正对比度样本的回归；全站对比度以真实 axe 扫描与后续人工测试为准。
- 所有阶段计划与剩余视觉/响应式/性能/安全任务以 [第一阶段整改施工单](./phase1-delivery-remediation-plan.md) 为当前执行基线。

## Supabase 独立 PL/pgSQL Lint 结果

**2026-10-25 本地整改 PASS（仅上述函数质量范围）**。修复前独立 `db lint --local` 实测三处函数级问题：`private.admin_lookup_users_core` 声明为 `STABLE` 却调用 `VOLATILE` 的动态权限检查；`private.make_redemption_code` 与 `private.admin_create_codes_core` 各有 FOR 自动循环变量与显式局部声明重名（展开后共 5 条警告）。

本轮新增 [可回放 SQL 迁移](../../../supabase/migrations/20261025000000_plpgsql_lint_cleanup.sql)，将私有查找及公开代理函数设为 `VOLATILE`，移除两处重复声明但保持发行数量、受保护锁序、SECURITY DEFINER owner 和业务行为不变。由于本地迁移角色不是 NOLOGIN 私有函数的所有者，迁移在事务内临时切换精确 owner 身份并恢复，`CREATE` 权限在事务结束前撤销。已对数据库回查：四个函数 volatility 都是 `v`，私有核心/发码核心所有者仍为 `aisencore_rpc_executor`，其 `private` schema CREATE 权限为 false。

在保留长期固定管理员和 demo 数据的本地数据库，`supabase migration up --local` 成功；`supabase db lint --local` 明确返回 `No schema errors found`；六个 pgTAP 文件 **286/286 PASS**。**尚未执行完全隔离的全新空库从头迁移回放**；这不代表完整 D2/D3、安全、性能或第一阶段准出。

## 仍需人工/外部环境的退出门禁

1. 完整 WCAG 2.2 AA 和人工读屏、IME/键盘操作，所有页面 200–400% 缩放/真实设备。
2. 最终原创视觉八维审查、用户实际操作反馈、项目所有者签收。
3. 真实生产容量的 DEC-06 查询 P95/EXPLAIN、前后端完整网络安全抓包、429/断网/超时与 HTTP 最后管理员 409（必须在另一个无长期管理员的隔离数据库中测）。
4. MFA 设备丢失/因子恢复和正式浏览器密码恢复回调、独立运营/应急恢复验收。
5. 外部 SaaS、R2、SMTP/Cloudflare 生产端到端：**未接入、未部署，也未得到上线批准**。
