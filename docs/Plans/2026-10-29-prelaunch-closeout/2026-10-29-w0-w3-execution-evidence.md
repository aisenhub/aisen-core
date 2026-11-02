# AisenCore｜2026-10-29 W0–W3 实际执行证据

- **续行分层结果**：W0 本地基线 PASS；W1 已有 node_modules 的 offline frozen install 与真 AAL2 Chrome 三筛选/反馈导航 PASS，独立干净目录安装因 Windows IO 超时仍 OPEN；W2 清退旧接口真实 JWT 与 `009/010/012/013` pgTAP **141/141 PASS**（权益 005 综合夹具独立 FAIL）；W3 真实 Edge/隔离 S3 的 0/1/2 图实删、成功 ACK 丢失恢复与 Admin Chrome 两条批量删除 PASS。真实 Cloudflare R2、Admin 单条/部分完成/范围漂移及人工验收 OPEN。
- **关联**：[执行细则](./01-engineering-security-remediation.md) · [唯一 TODO](../TODO.md) · [V4 专项](../aisencore-mvp/2026-10-29-feedback-admin-ux-bulk-delete-remediation-plan.md)。
- **Git 基线**：`main` / `b715a3221d30c55d3118be60eb31f45797bef662`。此前未提交的审查/计划文件予以保留；本次未提交/推送/部署或接入生产云端。
- **环境**：Windows Runner `E:\Projects\Aisencore`，Node 24.19.0、pnpm 12.15.0、Deno 2.9.6、本地 Supabase API `127.0.0.1:55321` / DB `127.0.0.1:55322`；S3 为受控、只在本地运行的内存对象模拟服务。

## W0｜数据保全的真实只读快照

| 表/项目 | 执行前 | W3 完成后 |
| --- | --- | --- |
| `public.user_feedback` | 6 条，ID MD5 `9cb0f019435b958c1f2c96c8704e82b4` | 6 条，相同 ID MD5 |
| `public.feedback_attachments` | 0 条，空集 MD5 `d41d8cd98f00b204e9800998ecf8427e` | 0 条，相同 ID MD5 |
| `auth.users` | 2 条，ID MD5 `50bf7f8947afdc27ed5e18a78b6bebfa` | 2 条，相同 ID MD5 |
| 本地数据库迁移 | 39 | 40；仅新增 `20261029213000` |

ID 校验不是完整逐列数据库备份。隔离 QA 账号/对象由脚本 finally 删除，日志为 `F07_REAL_EDGE_S3_CLEANUP PASS`。

**续行共享开发库并发业务写入核查（非 QA）**：此轮最终只读复核，反馈仍为 6 条，但 ID MD5 已变为 `4012203bce23fa3eb9130ddbc176c09f`；Auth 用户仍为原 2 条/相同 ID MD5，附件仍为 0。数据库可见一条新反馈（2026-10-29 14:09 UTC）及一条原反馈永久删除审计（14:13 UTC），该审计操作者属于当前仍存在的 Auth 账号，**不是本轮已清理的临时 QA 身份**。用“现存反馈中剔除该新 ID，再加入审计的已删 target_id”重构 6 个 ID，MD5 **恰为原 W0 的 `9cb0f019435b958c1f2c96c8704e82b4`**。这证明 W0→续行末发生过一入一出的非 QA 业务数据操作；不应再声称全时段 ID 集合完全不变。每轮 QA 脚本自身的运行前后记录保全、临时 QA 用户/产品/反馈清理均 PASS；并发业务操作归属请以数据库现有审计事实为准，本任务未恢复或改写此条记录。

## W1｜补丁哈希一致性

1. 红测试：`pnpm install --offline --frozen-lockfile --ignore-scripts` EXIT 1，`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`。
2. 仅通过 `pnpm install --lockfile-only --offline --no-frozen-lockfile --ignore-scripts` 同步 `pnpm-lock.yaml` 的 `query-string@7.1.3` 补丁哈希，从 `5ff30b10…` 到 `2a4039a2…` 及其引用，未升级依赖版本。
3. 再执行相同的 offline frozen install EXIT0 且安装未产生额外锁文件变动；`pnpm typecheck` EXIT0，`pnpm lint` 0 error/0 warning，`pnpm build` EXIT0，`node scripts/test-feedback-v4-contract.mjs`、`node scripts/test-d3-bundle-secrets.mjs` PASS。
4. **本次续行**：`node scripts/test-admin-operations-other.mjs operations-feedback` 真 AAL2 Chrome 的优先级 `high`、星标 `true`、类别 `bug` 三次实际选择、URL 参数变化/重置、反馈行选择、ZIP 预览和 User360 链接均 **EXIT0**。另在系统临时目录仅复制 workspace manifest、pnpm lock、Admin package 与 query-string 补丁，尝试不含 `node_modules` 的 **offline frozen 安装**：pnpm 复用缓存、成功开始安装，但 Windows 大量文件链接/写入操作在 155 秒内未完成，进程超时，**NOT PASS**。清理首试因占用遇到 EPERM，随后确认临时目录已实际删除；未改项目 node_modules。该历史时点 W1 全新目录仍因时间限制未验收；最终状态见下文更新。

**同卷二次隔离安装失败证据**：定位本机 pnpm store 为 `D:\APP\Base\pnpm-store\v11`，首次 C 盘临时安装存在跨卷复制 I/O。把相同五份 manifest/patch 复制到独立随机 `D:\APP\Base\aisencore-frozen-qa-*` 目录（新目录无 node_modules），再次以 `--offline --frozen-lockfile --ignore-scripts --config.package-import-method=hardlink` 执行：输出 `Lockfile is up to date`、`Packages are hard linked`，依赖落盘推进到 168 个左右，仍触发 195s 内部终止及 255s 外层超时，**并非成功退出**。随后单独确认并删除本次 D 盘随机临时目录；未动 pnpm store/原项目 node_modules。此前受限时长不足，W1 当时保持 OPEN；后续用更完整的时间窗口重新验证。

**2026-10-30 W1 最终干净安装 PASS（取代上方短时限测试失败）**：新增可复跑 `node scripts/test-frozen-clean-install.mjs`，从 pnpm store 同卷 D 盘新建独立空工作区，仅复制根和 Admin 的 manifest、pnpm-lock、workspace、补丁 5 文件，无旧 `node_modules`。真实执行 `pnpm install --offline --frozen-lockfile --ignore-scripts --config.package-import-method=hardlink --reporter append-only`，pnpm **12.15.0、168 包、下载 0、EXIT0、耗时 3m39.9s**；所有源输入 SHA-256 相同，真实新 `node_modules` 和虚拟锁存在。`FROZEN_CLEAN_INSTALL_RESULT pass=true,timeout=false,sameFiles=true,installed=true,usedExistingModules=false`、`FROZEN_QA_TEMP_CLEANED true`。未触及原仓库安装或 pnpm store，**本地 E01/W1 CLOSED**。

## W2｜后续迁移与 JWT 真实安全负例

1. 真 JWT 旧路径在变更前仍可执行；数据库实际 catalog 的多个旧函数保留 `authenticated EXECUTE`，但这不意味着一般用户可以越权执行管理员写。
2. 新建 `supabase/migrations/20261029213000_feedback_v4_retire_legacy_rpc.sql`，先跑 `BEGIN → SQL → ROLLBACK` EXIT0，再执行 `pnpm dlx supabase migration up --local` 成功正式安装。
3. 从本地 public/private 清退旧回复、更新、指派、V2 筛选、关注/标签字典六组 RPC；V4 仍使用原有 `admin_feedback_v3` 函数名，但拒绝 `trash/restore` 与 `p_tags` 并保留 `save/triage/archive/reopen`；收件箱已读独立为 `admin_mark_feedback_read`，Admin 已更新调用。
4. `node scripts/test-fb-real-http.mjs` EXIT0：真实普通/管理员 JWT 调用旧公开入口 HTTP 404；普通用户和 AAL1 管理员当前受保护写/已读 HTTP 403；AAL2 save/triage/archive/reopen、CAS 409、标记/备注及本人隔离 PASS，QA 精准清理 PASS。旧六个 public catalog 已不存在。云环境未迁移。

**后续补证（2026-10-29）**：已将 `009/010/012/013` 四份原 SQL 夹具重写为 V4 单向合同及安全正负例；在**实际本地 PostgreSQL** 上执行 `python scripts/test-f07-local-sql-rollback.py --feedback-only`，分别 **59/59、30/30、28/28、24/24，合计 141/141 PASS**，各自 `BEGIN/ROLLBACK`，无安装迁移或原业务数据变动；`node scripts/test-admin-operations-other.mjs operations-feedback` 真实 AAL2 Chrome 三个筛选选项→URL 更新→重置、行选择/ZIP 预览、User360 历史链接及 320px 验证均 EXIT0，QA 身份/产品清理 PASS。

**再续行 W4 本地 SQL 修复与真实验证**：`005_redemption_and_grant_rpcs.test.sql` 的旧时段排队、批量码、人工自动入会、R-16 同码多人兑现假设已替换为当前 Pro 信用立即入账 / 单码单次 / 有效成员前置 / 每人独立码事实；保留全部 93 条授权权限、幂等、限流、撤销与故障回滚断言。实跑 `python scripts/test-f07-local-sql-rollback.py`：**005=93/93、013=24/24、009=59/59、010=30/30、012=28/28，综合 234/234 PASS、五个事务均 ROLLBACK**。未改迁移、权益核心或真实用户数据；历史失败仅保留为问题被发现和修复的证据。

## W3｜真 Edge→隔离私有对象→数据库删除

`node scripts/test-f07-edge-images-local-s3.mjs` **最终 EXIT0**。真实 Lens Chrome 2 图、GoTrue 邮件确认、AAL2、正式 Edge、签名私有 S3、PostgreSQL 与 ZIP 同批回归 PASS。本次为正式 Edge/DB 接口调用，存储是本地 S3 协议 fixture，**不是 Cloudflare R2**。

| 场景 | 本地实际结果 |
| --- | --- |
| 0 图永久删除 | Edge 200；DB 记录及事件删除，无内容审计仅一条；再次删除 409 |
| 普通用户与 AAL1 管理员 | 删除均 403 |
| 旧合法版本、错误产品 | 均 409，禁止跨域/过时删除 |
| 1 图（原缩略图已不存在） | 原图及元数据清除；S3 DeleteObject 对已缺对象幂等完成 |
| 2 图，第二张缩略图 DELETE 被注入 503 | Edge 503；保留 deletion intent 与两条附件引用；待清理查询可见 |
| 同版本重试 | 存储恢复后 Edge 200；两原图+两缩略图以及 DB 元数据全部消失 |
| 管理员实时撤权 | 已撤权 AAL2 403，反馈保持；测试管理员恢复授权后才完成删除 |
| 删除成功 ACK 丢失 | **PASS**：真实 Edge 上游 200 已提交后代理丢弃响应，客户端观察到 UNKNOWN，重新读可信 DB 确认不存在、待删除列表无该任务、再删 409 且永久删除审计仅 1 条 |
| 真 Admin Chrome 批量删除两条 | **PASS**：AAL2 登录下仅选两条新建隔离 QA 零图反馈；取消确认后 SQL 仍为 2 条；确认后经真实本地 `feedback-delete` Edge 两条 SQL 均消失，分别留下 1 条最小审计；EXIT0，QA 用户/产品/事件及本地 Edge worker 清理 |
| 真 Admin Chrome 确认范围漂移 | **PASS**：打开两条隔离 QA 反馈批量删除确认后跳转到不同优先级范围，旧确认被禁用或关闭；两条记录 SQL 均保留 |
| 真 Admin Chrome 部分 503 与人工恢复 | **PASS**：首次批量实删第 1 条、针对第 2 条 Edge POST 注入 503，UI 提示 `已完成 1 条` 且 SQL 仍保留 1 条；刷新核对后只选择幸存项并再次显式确认，SQL 最终无 QA 反馈、两条各恰 1 条最小无内容审计 |
| 真 Admin Chrome 单条菜单永久删除 | **PASS**：新建零图隔离 QA 反馈，行更多操作→单条永久删除；取消时记录仍在且无删除审计，重新打开确认后真 `feedback-delete` Edge 删除，单条审计恰一次 |
| 真 Admin Chrome 当前页 20 条边界 | **PASS**：新建同一隔离产品 21 条按时间排序的 QA 零图记录，实际 Admin 页大小 20，点击全选本页只选择 20 条；二次确认后 20 条经真实 Edge 完成、删除审计恰 20 条；第 21 条未选、未删、无审计，交由限定 QA finally 清理。真实脚本 EXIT0，账号/产品/临时反馈全部回收 |
| QA 清理与原 ID | 通过；本地原始用户、反馈、附件 ID 摘要未改变 |

**运行历史**：首次运行被旧 ZIP 测试传入 V4 已删除的 `tags` 选项阻断（422，并非存储缺图 503）；第二次被错误地用非法版本 `0` 代表过期版本阻断（按合同应为 422）；两次修正测试后第三次完整运行 EXIT0。三次均由 finally 报告 QA 清理 PASS。

**本轮真实浏览器验证记录**：新增两条 QA 反馈后，首次长测试与离线安装并行超时，QA 用守卫 SQL 精确清理；第一次独立复跑的 React-admin 同路由缓存列表滞留，QA finally 清理 PASS；随后对临时数据写入后强制 Chrome 刷新，正式 `node scripts/test-admin-operations-other.mjs operations-feedback` **EXIT0**，上面范围漂移/503 部分失败/重新确认以及原三筛选、二条正常批量删除均 PASS，运行中仅改隔离 QA 项，finally 记录 `QA_CLEANUP_VERIFIED`；警告 Chrome 临时 profile 在 Windows 仍被锁，需另行确认纯本机临时文件清理。**本次再次实测（2026-10-30 本地）**：扩展 `scripts/test-d3-authenticated-pages.mjs` 隔离真 Chrome 用例；正常两条批量、确认作用域漂移、注入 503 的部分完成与恢复均再次 PASS；新增单条取消/确认与 21 条中本页仅删 20 条也全部 PASS，脚本 **EXIT0**、QA 最小审计逐条验证、finally 清理成功。**未验收/不能声称发布完成**：其他断连/在途并发边界、人工键盘/读屏/多视口/性能、真实 Cloudflare R2、第三阶段部署与公开上线。W3 只在**本地核心 E2E** 范围通过；唯一 TODO 中 FB-02 仍 OPEN。

## 最终门禁说明

冻结安装/TypeScript/Lint/Build/Edge Deno check、V4 静态合同与真实 JWT 已重新核对。本轮没有对已有真实用户或反馈数据执行永久删除；SQL 新迁移**仅本地**登记。其他 OPEN 和是否进入第三阶段，以[唯一 TODO](../TODO.md)及所有者明确授权为准。
