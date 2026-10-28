# 2026-10-28｜Core × Lens × Admin 本地 Stage2 独立继续收口执行方案

> **状态：执行中，尚未整体 PASS/签收**。唯一跨阶段 TODO 仍是 [Core TODO](../TODO.md)，本文件专门负责本轮三端收口执行顺序与真实验收证据。业务权威继续沿用本目录 02/03/04/06 和 Core 安全/API 合同。

## 1. 本轮目标和明确排除

目标是在固定本地环境完成 Lens WebApp 正常入口→Core Auth/REST/RPC/Edge→Core Admin 的真实注册/跨浏览器邮件确认与恢复、成员生命周期、权益/Grant 历史与兑换、有效永久 Pro 拒兑、0/1/2 图反馈、四队列/私图/受控 ZIP，以及撤权、切号、错误/UNKNOWN/并发恢复；依真实浏览器、HTTP、数据库、对象和审计判定，不能用静态检查/Mock/中途 PASS 代替。

**不作本轮阻塞**：视频录制、AI Pro/去水印/第二项目门槛、支付、桌面/移动、用户回复中心、完整分析模板云备份（LENS-06 顺延）、真实 Cloudflare R2、生产 SMTP/HTTPS、云部署/公开上线。Core 第一阶段全站 WCAG/性能/人工视觉签收仍 OPEN；重叠项可复用真实证据，但不能自动代签。

## 2. 安全门禁与权限范围

- Core 本地 55321/55322、原管理员及两个 active 产品 `aisenhub`/`aisenlens` 必须保留。每个**写库 E2E 前后**执行 `python scripts/check-local-admin-qa-cleanliness.py`；只有 Auth=1、active管理员=1、真实产品=2、合成业务残留=0 才能开始下个用例。
- 测试账号/对象必须为本轮自建、随机且精确 ID、finally 清理；无法确认清理、已有并行写库任务、权限被工具拦截、执行结果未知，立即停写只读排查；禁止绕过安全工具、无差别 DB reset、清库、误删原数据。
- 两仓原有 dirty（观察为 Core44/Lens118 个路径）完整保留。不得覆盖并行改动、`git reset --hard`/`git clean`、批量提交推送；本阶段不访问远程云服务、不泄露密钥/JWT/明文兑换码或私图 URL。
- 写库负例/浏览器联调 **串行**，先门禁再运行，完成后再次门禁。Lens 8443 他人开发进程不强停；临时 9443 邮件测试后还原本机 Auth allowlist。运行模式、退出码与实测对象权限分别记录。

## 3. 实施序列、准出条件和初始状态

| 顺序 | 任务 | 必须有的通过证据 | 当前 |
| --- | --- | --- | --- |
| CL-00 P0 | 环境/清洁门禁 | 真实本地服务、原管理员/两产品保留、QA=0 | **PASS** |
| CL-01 P0 | Admin D3 修复 | `operations-feedback` 四队列/事件/审计断言修复并跑绿；随后 `navigation`、`operations-grants`、`operations-issuance`、`operations-responsive` 全部**独立退出0且清洁**，禁止易超时 full 冒充 | **5/5 分段 PASS**；独立人工视觉/WCAG仍归第一阶段 |
| CL-02 P0 | Auth/邮件/多会话 | 真实 Lens 注册确认和恢复链接的错误/失效/重放、普通登录不能 reset、refresh撤销、多标签旧响应、8443 env/allowlist | **邮件确认/恢复错误码、临时GoTrue真实2秒TTL两类过期拒绝、独立GoTrue双会话local/global登出与refresh隔离、双标签切号/迟到响应及内存Key清理、正式持续运行8443本地公开变量+真实Chrome登录 PASS**；跨设备离线恢复及所有组合 OPEN |
| CL-03 P0 | 成员/身份隔离 | 登录/反馈/只读不 join；合法首次 active，left明确rejoin、suspended/blocked、跨产品、切号保险库Key/项目不损失 | **left→Lens显式rejoin→原membership UUID/Grant恢复、suspended无入口/直调409、Admin恢复，真实Chrome+SQL PASS**；跨产品/完整任务与存储保留人工矩阵 OPEN |
| CL-04 P0 | 权益/兑换 | Admin AAL2 发码/直授→Lens check_access/历史/兑换、30天/未来/永久/撤销、R-16不耗码、跨产品、抢最后一次、429/UNKNOWN/恢复 | 真 Chrome 主路径/两产品码隔离及并发 LCK01～08 **PASS**；其他限时快照/HTTP故障 OPEN |
| CL-05 P0 | 反馈 Edge 与 S3 | 真 Lens 0/1/2图→Edge/SQL/本机私有对象，第二图中断、DB写失败/UNKNOWN、409、短URL与撤权、引用安全/孤儿清理 | 主路径、**真实第二图PUT 503→同UUID补齐、原号异参409，以及前后正式引用RPC对账/普通用户403 PASS**；真DB提交未知及长期孤儿删除策略 OPEN |
| CL-06 P0 | Admin 反馈/ZIP | inbox/workbench/archive/trash、version409、敏感范围、AAL1拒绝与AAL2 ZIP字节一致、缺图/中断审计 | 四队列/409 Chrome与隔离 S3 AAL2 ZIP原字节、**真实缺图503且无残缺ZIP、恢复后原图完整导出 PASS**；导出在途撤权/断连及完整敏感范围矩阵 OPEN |
| CL-07 P0 | 三端统一 E2E | 同一合成用户注册→确认→兑换→Grant→反馈→Admin处理/ZIP→撤权/切号/断网，Chrome/HTTP/SQL/对象/审计/QA清理同环境证据 | **同一用户兑换→零图反馈→Admin AAL2修改审计→撤权/永久/封禁 Chrome 子链 PASS**；完整注册邮件+两图 ZIP+切号/失联组合仍 OPEN |
| CL-08 P1 | 工程/UI/Free回归 | 两仓类型/lint/build、关键入口中英/键盘/320～1440px，Free项目/模板/密文不退化 | **两仓 typecheck/lint/build、主入口Chrome/局部窄屏及正式8443已加载编辑器断网/重联Free项目ID保持 PASS**；冷首次离线进入Vite懒加载失败、完整Free/UI/密文人工回归 OPEN |
| CL-09 P1 | 文档清理 | 修正旧“脏库 BLOCKED”和陈旧 NOT RUN 说法，与最新证据/唯一TODO一致 | Core唯一TODO、02/03/04/06 进展表、历史事故/本轮范围、Lens身份报告、计划索引已修订；剩余交叉链接与旧长文描述专项核对 OPEN |
| CL-10 P0 | 正式收口 | 每项适用 P0/P1 PASS 或清晰豁免，所有者签收、版本/数据清理/下一轮风险登记 | OPEN |

顺序：CL-00→CL-01→CL-02/03/04→CL-05/06→CL-07→CL-08/09→CL-10。诊断必须区分测试脚本缺陷/正式业务缺陷/环境超时；不删有效断言求绿。

## 4. 复测入口

Core 门禁：`python scripts/check-local-admin-qa-cleanliness.py`。Admin：环境变量 `AISENCORE_UIQA_PHASE` 分别设为 `operations-feedback`、`navigation`、`operations-grants`、`operations-issuance`、`operations-responsive`，串行执行 `node scripts/test-d3-authenticated-pages.mjs`，每次结束都复核。Core Auth：`node scripts/test-d2-auth-api-mfa.mjs`；真实跨浏览器邮件：`python scripts/test-stage2-lens-mail-browser.py`。Lens 权益：`node --test tests/features/workflow/core-entitlement-contract.test.mjs` 与 `node --test --test-concurrency=1 tests/features/workflow/core-entitlements.browser.test.js`。含图反馈：Core `node scripts/test-f07-edge-images-local-s3.mjs`。两仓各自 pnpm typecheck/lint/build。隔离签名 fixture 不等于真实 R2 生产验收。

## 5. 执行记录（后续按实测追加）

| 日期 | 证据 | 结果 |
| --- | --- | --- |
| 2026-10-28 | Core main `390b7a1`、Lens main `864cdc6` 与 origin/main 一致；原 dirty 完整保留 | PASS（观察快照） |
| 2026-10-28 | Core 本地 QA 门禁：Auth=1、activeAdmin=1、active真实产品=2、feedback/grants/codes/audit=0 | **PASS；历史脏库事件已恢复，不等于 D3 通过** |
| 2026-10-28 | Core Admin TypeScript/Lens WebApp TypeScript 与 Lens 权益合同7/7 | PASS |
| 2026-10-28 | Lens AAL2→兑换→撤授→永久保护→封解 1/1 Chrome；Lens 2图→本机隔离S3→Core私图/AAL2 ZIP既有正向 | 已有主路径 PASS，不代表异常矩阵完成 |
| 2026-10-28 修复前历史失败 | Core `operations-feedback` 日志四队列/409局部通过，但第1576行反馈事件数断言 `false !== true`；源于 SQL count 字符串的字典序比较 | **历史 FAIL，已由下方重测关闭** |
| 2026-10-28 当前重测 | 修复上述 SQL `count(*)` 文本与整数的错误比较（原 `'10'>='5'` 为假），新脚本显式转数值并记录事件与审计计数。真实 Chrome `operations-feedback` **exit 0**：四队列、version409、内部事件 **10**、Admin审计 **6**，finally 报 `QA_CLEANUP_VERIFIED` | **CL-01 feedback 子项 PASS**；继续独立运行其余 D3 分段 |
| 2026-10-28 当前重测 | 真实 Chrome `AISENCORE_UIQA_PHASE=navigation` **exit 0**：10个受保护只读资源/空态/真实错误429与503/导航断点、移动端320/390px、AAL2与axe自动基线；测试前后 `LOCAL_ADMIN_QA_BASELINE_PASS`、最终 QA 清理成功；axe仍有 incomplete 不代表正式 WCAG 签收 | **CL-01 navigation 子项 PASS**；独立视觉/WCAG/性能仍按第一阶段记录 OPEN |
| 2026-10-28 当前重测 | `operations-grants` 真实 Chrome **exit 0**：30天 Pro 授权、503 UNKNOWN、429拒绝、超过20条分页、User360授权入口及AAL2、finally；前后 `LOCAL_ADMIN_QA_BASELINE_PASS` | **CL-01 grants 子项 PASS** |
| 2026-10-28 当前重测 | `operations-issuance` 真实 Chrome **exit 0**：首次秘密展示、TXT/CSV秘密文件抹除、原批次 UNKNOWN 对账/撤销、AAL1拒绝、管理员授撤权与旧AAL2拒绝、单码撤销，所有 QA 清理，前后 `LOCAL_ADMIN_QA_BASELINE_PASS` | **CL-01 issuance 子项 PASS** |
| 2026-10-28 当前重测 | `operations-responsive` 真实 Chrome **exit 0**：74 个 viewport/route 组合、键盘焦点与 Escape、HTTP503 UNKNOWN 原号恢复、429拒绝、AAL1/匿名保护、实际密码+TOTP AAL2登录，QA finally 与前后 `LOCAL_ADMIN_QA_BASELINE_PASS` | **CL-01 responsive 子项 PASS；D3 五个短切片全部 PASS**；人工 WCAG/视觉仍 OPEN |
| 2026-10-28 当前重测 | Core `python scripts/test-stage2-lens-mail-browser.py` **exit 0**，Lens Chrome **1/1 PASS**：全新浏览器确认注册、真实密码恢复、新密码有效旧密码失效、同一已消费恢复凭据二次改密拒绝、未创建会员；清理QA身份，移除临时9443回调并恢复8443 Auth，前后 `LOCAL_ADMIN_QA_BASELINE_PASS` | **CL-02 邮件主路径与恢复重放负例 PASS**；refresh/多标签与错误/过期链接 OPEN |
| 2026-10-28 当前重测 | Lens `node --test --test-concurrency=1 tests/features/workflow/core-entitlements.browser.test.js` **exit 0，1/1 PASS**：真实AAL2发码/兑换→会员/Grant/核销；撤权回Free→永久直授与R-16拒兑不耗码→封解恢复；清理全部合成用户/授权；Core清洁基线复核 PASS | **CL-03/04 主业务切片 PASS**；复杂并发/跨产品负例仍 OPEN |
| 2026-10-28 当前重测 | Core `node scripts/test-f07-edge-images-local-s3.mjs` **exit 0**：Lens真Chrome双图→Edge→PostgreSQL→隔离本机 S3，Core 1图/2图本人与他人签名授权（200/403）、Admin AAL1拒绝/AAL2 ZIP原图字节一致、同号重放不重复写；finally清理、前后清洁 PASS | **CL-05/06 主业务切片 PASS**；真实云R2和故障注入/引用对账不据此通过 |
| 2026-10-28 当前重测 | Lens `core-account-feedback.browser.test.js` **exit 0，1/1 PASS**：正式SDK登录→Lens零图→真实Edge JWT/DB，丢201响应后同UUID重试200、无S3时双图503且保留文件/原号、local signOut后本机项目保留；Core清洁复核 PASS | **CL-02/03/05 用户入口回归 PASS**；独立安全异常矩阵继续 OPEN |
| 2026-10-28 当前重测 | Core F07 Deno 五个模块 `deno test --allow-env --allow-net --allow-read --allow-sys supabase/functions/tests/feedback-*.test.ts` 逐项运行 **15/15 PASS**：图像完整解码/尺寸、Auth/DB故障分类、部分上传失败、同号幂等、ZIP原字节、孤儿审计只读/DB异常拒绝等。首次因遗漏AWS SDK必要 `--allow-sys` 执行失败，补足运行权限后无改代码通过 | **CL-05/06 离线故障协议/服务逻辑 PASS**；不冒充真实 Edge 数据库故障注入 |
| 2026-10-28 当前重测 | Core Admin/Lens WebApp 两仓分别 `typecheck`、`lint`、`build` **全部 exit 0**；Lens build存在 wasm `node:module` 外置兼容提示，当前未导致构建失败，须按实际浏览器运行继续留意 | **CL-08 工程门 PASS**，人工/性能/全浏览器回归未签收 |
| 2026-10-28 当前重测 | Core `python scripts/test-f07-local-sql-rollback.py`：R-16 Grant/兑换93、F06本人按产品/原号24、反馈基础60、V2收件箱32，共 **209/209 pgTAP PASS**；四个 SQL fixture 均事务 `ROLLBACK`，已安装迁移不变，执行前后清洁门禁 PASS | **CL-04/05/06 SQL/安全合同回归 PASS**；不替代真实多用户并发/综合三端E2E |
| 2026-10-28 当前重测 | Core `python scripts/test-d1-concurrency.py` 独立 PostgreSQL 连接及真实 `pg_stat_activity` Lock 等待，**LCK-01～08 全部 PASS / exit 0**：管理员撤权锁、两笔Pro顺延60天、末次单码抢兑、暂停/重加、12次并发限流、同批次重放、产品停用交错、永久授权与兑码并发不多耗；精确 QA 清理，执行前后 `LOCAL_ADMIN_QA_BASELINE_PASS` | **CL-03/04 真实数据库竞争与 R-16 正反例 PASS**；独立跨浏览器用户切号/完整三端仍 OPEN |
| 2026-10-28 当前开发与重测 | 在 Lens 既有 `tests/features/workflow/core-entitlements.browser.test.js` 增加**同一 QA 用户**从 AAL2发码兑换后直接在正式 Lens 设置提交零图反馈，再经真实 Admin AAL2 `admin_feedback_v3` 更改优先级/标签并核对版本、产品归属、会员未重复加入及审计；返回权益面板继续撤Grant/永久保护/封解。完整 Node Chrome **1/1 PASS / exit 0**；前次新增测试未返回权益页致刷新按钮不存在，已修正导航并重跑，最终 QA 清理和 `LOCAL_ADMIN_QA_BASELINE_PASS` | **CL-07 首个同一用户 Lens→Core Edge→Admin AAL2→Lens 跨模块真实子链 PASS**；正式邮件确认整段、两图同一用户 ZIP、切号与断网组合仍 NOT RUN |
| 2026-10-28 提交前历史审查 | 修正 Core 阶段 TODO、02/03/04/06 验证表与 Lens 实测记录；仅清除本轮 Deno 测试新增的根 `deno.lock`，保留先前并行成果。原始快照是 Core 43 modified / 6 untracked、Lens 106 modified / 12 untracked，均0冲突；当时尚未提交 | **历史状态，已由下方 GitHub 合并事实取代** |
| 2026-10-28 GitHub正式合并 | **先 Lens 后 Core**：Lens 118文件经 [PR #41](https://github.com/aisenhub/aisenlens/pull/41) 合并 `b433c15`；Core 48文件经 [PR #21](https://github.com/aisenhub/aisen-core/pull/21) 合并 `4ca908b`；本地 main 均快进、GitHub与本地已删除原合并分支。后续新增 Lens 认证修复3文件经 [PR #42](https://github.com/aisenhub/aisenlens/pull/42) 合并 `81aec33`，其分支也清理 | **提交/合并/旧分支清理 PASS**，不代表 Stage2 整体签收 |
| 2026-10-28 新增负例红→绿 | Lens 真GoTrue HTTP403 `otp_expired` 错误原被 UI 误报网络故障；先加无效确认hash测试发现FAIL，随后仅映射已证实的 `otp_expired` 到 `INVALID_CONFIRMATION`，真正上游故障不变；另加独立 Chrome 无任何恢复凭据直接改密拒绝。Lens完整新浏览器邮件确认/找回及旧密码、错误码、已消费凭据拒绝 **1/1 PASS / exit 0**，9443回调恢复8443，Core本地库前后清洁 | **CL-02 无效确认及无凭据重置安全负例 PASS**；真 TTL过期/refresh撤销/多标签仍OPEN |
| 2026-10-28 新增跨标签安全红→绿 | Lens [PR #43](https://github.com/aisenhub/aisenlens/pull/43) 合并 `4ae3b39`：同一浏览器 A lifetime Pro→另标签 B 登录，真A `check_access` 响应被CDP截留、B切号后才放行，B不承接Pro/Grant/会员；最初发现旧A标签内存AI Key残留 **FAIL**，修复 Supabase 认证事件在身份变化/远端登出时清内存Key，不动加密密文/项目；同账号 GoTrue 正常 refresh 不误锁，GoTrue全局登出旧refresh被拒；真Chrome **1/1 PASS**，Core QA前后基线 PASS；临时分支已删除 | **CL-02/03 跨标签、撤销refresh凭据与内存Key隔离子项 PASS**；跨设备离线及完整存储人工准出仍 OPEN |
| 2026-10-28 新增成员自助闭环 | Lens [PR #44](https://github.com/aisenhub/aisenlens/pull/44) 合并 `68666de`：增加仅在 `MEMBERSHIP_LEFT` 出现的“重新加入本产品”按钮，调用正式本人 `rejoin_product`、会话归属校验并重新查询权益。真实 AAL2+Chrome+SQL 证明真实left后查询不自恢复、点击后原membership UUID/终身Grant恢复且仅一条leave/rejoin事件；Admin暂停后无按钮且本人直调RPC 409，Admin恢复原active与Grant；完整权益/反馈/跨标签旧回复回归 **1/1 PASS**、QA清洁，typescript/lint/build/合同7/7 PASS；分支已删除 | **CL-03 left/rejoin/suspended负例 PASS**；跨产品和人工端到端仍OPEN |
| 2026-10-28 两款正式产品交叉保护 | Lens [PR #45](https://github.com/aisenhub/aisenlens/pull/45) 合并 `617a445`：真实 AAL2 管理员为 `aisenhub` 发有效码，从 `aisenlens` Lens 页面兑换必须提示不可用；Core验证码 `redeemed_count=0`，同用户没有异产品 Membership/Grant/多余 Redemption，真正JWT `check_access('aisenhub')` 为 `MEMBERSHIP_REQUIRED`；整条现有 Chrome 兑换/反馈/三端/跨标签回归 **1/1 PASS**，QA 前后清洁 | **CL-04 跨产品兑换负例 PASS**；跨产品配置/跨设备时效的余项 OPEN |
| 2026-10-28 F07 真实故障注入 | 仅修改隔离本机 S3 HTTP 夹具、不修改正式 Edge：两张图第1张PUT成功、第2张持续503导致 Edge 503，SQL无反馈记录、保留1个未确认对象以避免误删并发引用；恢复对象服务后**同UUID/同图**重试201、两图入库、同号重放200且不重复上传；同UUID改变内容返回409，不新增任何对象或记录。真实 Lens Chrome→Core Edge→本地S3原图→Admin AAL2 ZIP/AAL1拒绝及本人/他人私图均再次 PASS，隔离对象与数据库完全清理。一次运行曾在 Edge 冷启动的浏览器预探测遇503而 FAIL，修复夹具需连续4次401才认为就绪后全套 **exit 0 PASS** | **CL-05 第二张图存储503/安全恢复与同UUID异参409 PASS**；实际DB提交未知/孤儿审计/导出中断仍OPEN，绝不冒充真实Cloudflare R2 |
| 2026-10-28 真实引用对账扩展 | 用相同实际Edge/S3故障夹具再调用 Core **现行 service-role only** `feedback_referenced_keys` RPC：在第二图PUT 503之后第1张对象未列入DB引用；同UUID恢复提交201之后两张对象均被列入正式附件引用；普通用户JWT直调RPC 403。初次测试误用带bucket的HTTP路径而RPC返回422，修正为bucket-relative真实object_key后才验收；Lens Chrome冷启动曾偶发503，Lens测试改为连续2次401健康确认（持续503仍FAIL）；最终完整F07 **exit 0**，Lens双图/ZIP原字节/503恢复/409和QA+本机对象清理全部PASS | **CL-05 未提交→已提交引用转换与RPC最小权限 PASS**；只读审计没有自动删孤儿，真实DB结果未知与长期安全删除仍OPEN |
| 2026-10-28 真实邮件TTL过期 | 现行本地GoTrue `GOTRUE_MAILER_OTP_EXP=3600` 不可将随机坏链接等同真正过期。扩展现有**可回滚的临时9443 GoTrue容器**为专用 `--test-expired-only` 模式，临时OTP有效期仅2秒，实际注册确认邮件与真实恢复邮件均等待6秒后交给GoTrue验证，返回明确 `otp_expired`；账号未被确认，原密码仍有效，测试合成身份删除。外层脚本确认**原8443 Auth、原3600秒TTL与白名单已恢复**；前后 `LOCAL_ADMIN_QA_BASELINE_PASS`，总退出码0 | **CL-02 两类真实过期邮件链接 PASS**；此前无效证明/已使用重放亦保留独立PASS；正式8443 Lens环境变量与跨设备/离线仍OPEN |
| 2026-10-28 双会话及正式8443本地入口 | Lens [PR #47](https://github.com/aisenhub/aisenlens/pull/47) 真实完整AAL2/Chrome 1/1 PASS，**同一合成账号两个独立GoTrue会话**：A local logout后A旧refresh被拒但B成功refresh，B global logout后B最新refresh亦被拒，会员/授撤权/跨标签/QA仍PASS。Lens [PR #48](https://github.com/aisenhub/aisenlens/pull/48)：实际运行 `http://127.0.0.1:8443` 的Vite原来缺Core公开配置；保持现有本地 Git 忽略 `apps/webapp/.env.local`，仅追加本地 `VITE_AISENCORE_URL` 和**publishable** key（绝非service-role），Vite配置重载后直接检查实际8443模块环境，再以独立隔离Chrome复用正式8443真GoTrue登录、进入项目、无隐式加会员，**1/1 PASS / exit 0**，QA前后原管理员1/产品2/残留0。不写入 Git 的本机配置需在其它机器另行设置，不是生产部署 | **CL-02 本机正式8443配置与登录、双独立会话撤权 PASS**；物理设备离线重联、人工持久数据不回退与完整三端注册两图仍OPEN |
| 2026-10-28 Free热态离线保持 | Lens [PR #49](https://github.com/aisenhub/aisenlens/pull/49)：正式8443浏览器以QA用户创建本机Free项目并获得UUID，在线进入编辑器后通过Chrome CDP模拟断网，已加载的编辑器仍在、IndexedDB项目UUID保持；重联后重新导航项目库同一项目可见，无隐式会员。**1/1 PASS / exit 0**，真实Chrome隔离profile/QA清洁。第一次尝试断网后**才首次进入未加载的Vite编辑器**超时，不冒充冷启动离线成功，正式离线分包/缓存及密文持久人工矩阵继续OPEN | **CL-08 已加载本机Free项目的离线继续/恢复 PASS**；冷首次Vite动态模块、加密配置与新设备离线仍OPEN |
| 2026-10-28 导出缺图安全负例 | Core正式 `feedback-export` Edge、真实AAL2管理员及DB两条已提交附件下，仅在隔离本机S3的Map中临时去掉第一图，真实Admin导出必须返回**503 / PRIVATE_ATTACHMENT_OR_ZIP_UNAVAILABLE**而不是部分ZIP，原DB两条附件保持；`finally` 恢复对象后同一请求AAL2 ZIP 200、两张原图字节完全一致。完整F07还跑通Lens双图/私图授权、第二图PUT503→同号恢复、引用RPC未提交→已提交/普通用户403、异参409和完全QA清理，**exit 0**。没有删除实际数据库记录/云对象 | **CL-06 真Edge缺图导出fail-closed PASS**；在途撤权/断连和敏感选项矩阵仍OPEN |
| 2026-10-28 | 其余三端完整组合与正式签收 | PARTIAL / OPEN，严禁合并各专项 PASS 冒充 CL-07 全项准出 |

## 6. 停止与交付标准

发生 QA 数据/对象清理异常、Chrome外部强杀、并行写库冲突、身份/产品不符、未知提交时停止下一轮写入，先安全只读取证。每个条目记录「版本/环境→命令/退出码→浏览器/HTTP→SQL/对象/审计→清理→尚未覆盖」，不伪造通过，不以历史阶段记录代签。最终所有者确认前 CL-10 一直 OPEN。

**尚未满足本轮完整准出的重点**：CL-02 跨设备离线refresh时效与其它环境的公开变量配置（本地正式8443、真TTL过期及双会话撤权均已PASS，不等于云部署）；CL-03 跨产品配置与切号在途AI/项目状态及加密存储完整人工回归；CL-04 15分钟快照（Pro能力本轮不启用）和更复杂的HTTP故障时效；CL-05/06 真Edge Auth/DB写入未知、长期孤儿引用二次确认与可控清理、Admin ZIP在途撤权/断连及敏感范围组合（缺图安全拒绝已PASS）；CL-07 同一QA用户从注册确认一直到两图ZIP及撤权/切号/离线恢复的全部综合矩阵；CL-08 冷首次离线动态模块、人工UX/WCAG/密文持久性及本轮回归边界；CL-10 正式所有者签收。外部个人模板云备份/真实R2/云部署仍是**延期而非当前失败**。全部剩余事项已入表，不授权生成假的全部PASS或上线承诺。
