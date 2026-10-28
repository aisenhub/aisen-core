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
| CL-02 P0 | Auth/邮件/多会话 | 真实 Lens 注册确认和恢复链接的错误/失效/重放、普通登录不能 reset、refresh撤销、多标签旧响应、8443 env/allowlist | **跨浏览器注册/恢复、错误确认hash拒绝、无恢复凭据拒绝、已用恢复凭据拒绝 PASS**；真正 TTL 过期/refresh撤销/多标签仍 OPEN |
| CL-03 P0 | 成员/身份隔离 | 登录/反馈/只读不 join；合法首次 active，left明确rejoin、suspended/blocked、跨产品、切号保险库Key/项目不损失 | PARTIAL |
| CL-04 P0 | 权益/兑换 | Admin AAL2 发码/直授→Lens check_access/历史/兑换、30天/未来/永久/撤销、R-16不耗码、跨产品、抢最后一次、429/UNKNOWN/恢复 | 真 Chrome 主路径及并发 LCK01～08 **PASS**；其他 HTTP/UI 异常 OPEN |
| CL-05 P0 | 反馈 Edge 与 S3 | 真 Lens 0/1/2图→Edge/SQL/本机私有对象，第二图中断、DB写失败/UNKNOWN、409、短URL与撤权、引用安全/孤儿清理 | 主路径 PASS，故障 OPEN |
| CL-06 P0 | Admin 反馈/ZIP | inbox/workbench/archive/trash、version409、敏感范围、AAL1拒绝与AAL2 ZIP字节一致、缺图/中断审计 | 四队列/409 Chrome与隔离 S3 AAL2 ZIP/原字节 **PASS**，缺图/导出在途撤权与异常矩阵 OPEN |
| CL-07 P0 | 三端统一 E2E | 同一合成用户注册→确认→兑换→Grant→反馈→Admin处理/ZIP→撤权/切号/断网，Chrome/HTTP/SQL/对象/审计/QA清理同环境证据 | **同一用户兑换→零图反馈→Admin AAL2修改审计→撤权/永久/封禁 Chrome 子链 PASS**；完整注册邮件+两图 ZIP+切号/失联组合仍 OPEN |
| CL-08 P1 | 工程/UI/Free回归 | 两仓类型/lint/build、关键入口中英/键盘/320～1440px，Free项目/模板/密文不退化 | **两仓 typecheck/lint/build PASS**，主入口 Chrome/局部窄屏 PASS；完整 Free/UI 人工回归 OPEN |
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
| 2026-10-28 | 其余三端完整组合与正式签收 | PARTIAL / OPEN，严禁合并各专项 PASS 冒充 CL-07 全项准出 |

## 6. 停止与交付标准

发生 QA 数据/对象清理异常、Chrome外部强杀、并行写库冲突、身份/产品不符、未知提交时停止下一轮写入，先安全只读取证。每个条目记录「版本/环境→命令/退出码→浏览器/HTTP→SQL/对象/审计→清理→尚未覆盖」，不伪造通过，不以历史阶段记录代签。最终所有者确认前 CL-10 一直 OPEN。

**尚未满足本轮完整准出的重点**：CL-02 真正 TTL 过期认证链接、refresh撤销、多标签及正式8443公开环境变量注入；CL-03 跨产品/left重新加入及用户切换在途任务；CL-04 更多真实客户端跨产品、15分钟快照和故障时效负例；CL-05/06 真Edge/Auth/DB故障注入、第二张图中断/安全孤儿清理、Admin敏感导出漂移；CL-07 同一QA用户从注册确认一直到两图ZIP及撤权/切号/离线恢复的全部综合矩阵；CL-08 人工UX/WCAG及本轮回归边界；CL-10 正式所有者签收。外部个人模板云备份/真实R2/云部署仍是**延期而非当前失败**。全部剩余事项已入表，不授权生成假的全部PASS或上线承诺。
