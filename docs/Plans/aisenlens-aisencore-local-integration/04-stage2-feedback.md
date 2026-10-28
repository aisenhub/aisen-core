# 第二阶段C详细计划｜单向文字与最多两图反馈

> **状态：联合开发 IN PROGRESS / PARTIAL；Core 与 Lens 浏览器的真实 JWT→Edge→数据库零图反馈均 PASS；Lens 两图失败保护、原号重试、真实 Chrome 两图→Edge→隔离本机 S3 的正向链均 PASS；真实 Cloudflare R2 和完整故障对账仍 NOT RUN。** 对应TODO LENS-05、FB-01跨端部分，审查F04～F07。入口为[第一阶段独立修验](./01-stage1-core-readiness.md)及[第二阶段A](./02-stage2-auth-and-membership.md)通过；**不依赖Pro/兑换或active成员**。业务以[反馈领域](../../architecture/domains/user-feedback.md)为准。

**2026-10-27 新增实测证据**：[F07 Chrome/真实 JWT/本地私有 S3 / Admin AAL2 ZIP](./2026-10-27-f07-private-s3-e2e-evidence.md)。在 Core 运行 `node scripts/test-f07-edge-images-local-s3.mjs`：Lens Chrome 两图→Edge→Postgres+独立 S3 正向 PASS，Core 1/2 图、同号重试、本人60秒私图签名 GET、他人403、临时 Admin AAL1 拒绝/AAL2 ZIP 图片字节一致及 QA 清理 PASS。真实 Cloudflare R2 和 Admin UI 人工验收仍 OPEN。

## 1. 用户结果与边界

Lens设置/帮助内，已登录、邮箱已确认、非blocked本人可提交一段文字及0～2张图片；Core形成一条反馈/附件/必要事件，Admin按V3四队列处理，图片私有且ZIP结果可核对。失败保留当前输入，重试不重复收件，成功只表示收到。

不新增联系邮箱模型/输入、不把邮箱塞正文、不自动附项目/日志/素材/存储/Key；不做游客反馈、反馈中心/历史/进度页/追加说明/站内消息/回复。本人查询只供必要原号恢复和安全验证，不推导旧五态为处理进度。注销申请渠道未定，不借反馈假报受理。

## 2. 实际入口、职责与依赖

| 层 | 现有位置/能力 | 本包处理 |
| --- | --- | --- |
| Lens | `features/feedback/FeedbackForm.tsx`、设置弹窗及其内存draft | Lens `FeedbackForm` 已移除自由联系邮箱/账号邮箱模拟输入、调用者与浏览器断言；已用官方会话将 message→content、当前产品 `aisenlens`、稳定 request_id、category=other 提交至正式 Edge，设置弹窗仅真实已确认登录会话启用；未知响应保留同 request_id/正文，不把失败当成功，切号清草稿。已实现最多2张 PNG/JPEG/WebP 选择、逐张移除/3MiB 客户端限制、0图兼容，UNKNOWN 时冻结文字与附件且保留原 request_id；真实 Chrome 使用有效两图触达 Core Edge 并因未配置本地私有存储正确收到503，重复提交仍使用同 UUID，数据未持久新增；第三张拒绝、用户显式清空与 QA 清理通过。同浏览器另验真实零图首次 Core 已提交 `201`、前端模拟网络丢失只看到 `503` 后以**完全相同 request_id**重试，Core 回 `200 replay` 且 PostgreSQL 仅一条记录，PASS。暂不自动压缩原图或上传敏感附件；真实隔离本地 S3 正向已由 Chrome 两图与 Core 1/2 图验证 PASS；真实云 R2 未授权/未验。 |
| Edge提交 | `supabase/functions/feedback-submit/index.ts` | 本人JWT/确认邮箱/blocked/真实产品/限流、大小/类型/完整性验证、条件写及可信RPC |
| 查询/签发 | `my_feedback`、`my_feedback_events`、`feedback-image-access` | 用户/产品/原号恢复作用域；安全附件ID签发，不暴露key/内部字段 |
| DB | 最新反馈SQL、RLS、可信提交/事件及`feedback_referenced_keys` | 幂等/归属/计数与引用安全；旧写路径按单向合同清理，不保留兼容写入口 |
| Admin | 现有四队列、图片/受控ZIP | AAL2当前管理员复核、version/筛选范围、敏感默认关闭，收件/处理与字节一致 |
| 本地对象 | 第一阶段 F07 已验证受限 `local-test` S3、真实业务处理函数本机 HTTP/故障注入（模拟 Auth/DB），但非真实 JWT+Edge middleware+数据库全链 | Edge 当前运行容器未设置任何 R2_FEEDBACK_*，真实浏览器两图得到503且服务端未落库（拒绝而非成功）；Core Deno 单独 S3 协议/ZIP 替身测试已覆盖正向 1/2 图。本轮已用自动生成的临时 supabase/functions/.env 和专用本机 S3 fixture，完成真实 Lens Chrome→Core Edge→DB 2 图、真实 Core 1/2 图、本人/他人鉴权、60秒短签名以及 Admin AAL2 ZIP 字节比对；测试结束清理所有合成对象和身份。fixture 只检查签名结构，不能替代真实 R2 加密签名验证；故障对账、真实 R2 和 Admin UI 仍 OPEN |

正文5000字符、单图3MiB、请求7MiB、当前5条/用户/小时、图片URL60秒先沿现有实现做隔离测试，正式运营参数按实测冻结，不自动扩为生产承诺。

## 3. 施工顺序

| 步骤 | 先建立的失败/检查 | 实施与输出 |
| --- | --- | --- |
| C-01 Core基线 | 第一阶段F05/F07及旧写路径/安全对账有真实证据 | 核对最新SQL/Edge/配置与锁文件，独立缺陷未解决则回第一阶段关闭，不靠客户端吞错 |
| C-02 零图收件 | 正常FeedbackForm无onSubmit、字段不符合Core | 接真正会话和multipart；category无选择器时other。真实Lens→Edge→DB→Admin一条收件 |
| C-03 UNKNOWN | 首响丢失、同号异参、跨产品同号、回收站空查询 | 本人/真实产品/原号/原参数重放；修既有查询/Edge作用域，不用空列表证明从未提交，不造第二单 |
| C-04 图片接线 | 第三图、超大/非法/截断/伪MIME拒绝 | 0→1→2图递进；全部校验后写，失败保留原号/正文/当前流程文件，不建上传框架 |
| C-05 私图/Admin | 裸读、他人附件、撤权、图片/ZIP失败不能假成功 | 短签名/过期窗口、四队列/version、敏感ZIP范围与实际字节/hash |
| C-06 故障对账 | 一图成功二图失败、R2成功DB失败、DB成功丢响应、并发同号 | 引用安全/保护期/受限实际清理与失败记录，不在单请求catch直接删共享key |
| C-07 清理回归 | 联系邮箱/旧回调/无用公开回复写路径不能并存 | 更新调用者/测试/文档，保留历史读和安全/ZIP证据，正常入口焦点/错误/窄屏可用 |

不先做新反馈中心再接后端。Core改安全/业务，Lens只消费结果及必要表单/附件交互，不让用户看R2 key、内部队列或对账细节。

## 4. 幂等、事务与恢复规则

- 同一当前提交保留一个UUID，身份/产品固定；相同内容/分类/图片顺序和字节恢复。修改内容前与旧UNKNOWN明确区分，不能偷偷换号重发；异参409保留原输入。
- Core F06 已编码 `my_feedback(p_product_key,p_request_id?)`：普通列表按产品仅返回可见的最近100条，精确原号查询不受列表截断，回收站仅返回本人最小存在证明，不显示管理员队列、正文或附件。迁移未持久部署；Lens 仍须以原号同参重放处理 UNKNOWN，单纯查询空数组不能证明提交失败，不新增历史浏览接口。
- 当前设置窗口内draft/文件/原号用于失败恢复，不新增持久截图/反馈隐私存储。关闭窗口/刷新后的恢复能力按实际保留信息如实记录，不能用新号自动补提交。
- key由可信产品UUID/本人/原号/slot/hash生成、条件写不可覆盖；客户端不能伪user_id或任意key。提交RPC及必要限流/事件同事务，写对象不代表已收件。
- 对象成功但DB结果不明，先核查原请求/当前引用再对账；保护期内和已有引用对象不删。软删可恢复不等于物理删除，业务留存/永久清理政策公开前确定。
- 新签名每次查owner/当前管理员/blocked，短URL有效期有撤权窗口；不能把60秒说成瞬时吊销。回收站隐藏与附件owner权限分别测试，不凭列表隐藏推断全部URL无效。

## 5. 必测矩阵

| 用例 | 可观察断言 |
| --- | --- |
| C-T01 身份/成员 | 确认邮箱Free/none/left/suspended可反馈且不建成员/Grant；匿名/未确认/blocked拒绝 |
| C-T02 零图/字段 | 一条收件/首事件、201首次/200重放；空/超限/非法分类拒绝，无联系邮箱/日志泄漏 |
| C-T03 一图/两图 | 数量/实际MIME/大小/hash/slot与DB/字节一致；第三图/伪造/截断/畸形拒绝 |
| C-T04 原号恢复 | 丢首响、并发同号、不同图/分类/正文409、跨产品同号/回收站空结果，最终只允许的一条反馈 |
| C-T05 上游故障 | Auth/本人RPC/图片鉴权RPC5xx为服务故障，非未确认/无权；真实无权仍403 |
| C-T06 部分失败 | 第二图失败、R2成功DB失败/未知、DB成功丢响应；不假成功/误删引用，可安全对账 |
| C-T07 私图 | 本人/当前AAL2 Admin允许；他人/撤权/blocked拒绝新签，裸读不可用，过期可复测 |
| C-T08 Admin/ZIP | 四队列/version409/原位恢复；冻结范围/敏感确认，缺图/中途变更拒绝，字节/hash可验 |
| C-T09 限流/隐私 | 原号恢复不重复计数，429可处理；JWT/明文码/私图URL/正文不进日志与业务审计 |
| C-T10 入口/本机 | 错误保留输入、切号旧响应无效、中英/键盘/窄屏；项目/模板/Provider/Free不变 |

区分Edge handler、可信RPC、S3协议替身和真实浏览器证据，不能只mock SDK返回就把全链路标PASS；本阶段没有真实云R2许可。

## 6. 测试入口、准出和交接

复用Core008～012适用SQL、`supabase/functions/tests/feedback-*.test.ts`、`scripts/test-feedback-auth-http.py`、`test-fb-real-http.mjs`、`test-fb-v3-browser.mjs`、`test-fb-v2-export-http.mjs`；名字含v2不代表现行ZIP安全测试无用。Lens扩账号/设置浏览器测试，补真实提交/图片/错误/原号恢复，不保留旧联系邮箱断言。

代码改后执行相关SQL/Edge/HTTP/浏览器及两仓工程门；图片/ZIP验证实际字节，密钥/截图脱敏。交付稳定multipart/错误矩阵、原号恢复边界、私图链路、对账负例、Admin实收截图、删除旧路径及未测生产项。

准出：C-T01～10适用范围真实通过，0/1/2图与Admin交叉核对，无重复/串号/越权/误删，已有安全能力无回归；不新增客户端中心或后台。交[综合验收](./06-stage2-integration-acceptance.md)复核组合流程，唯一TODO不变。

## 7. 验证记录

| 范围 | 当前状态 | 后续记录 |
| --- | --- | --- |
| C-01～07 / C-T01～10 | **PARTIAL**：2026-10-28 Lens零图/丢201回复同号重放/无S3时503保留输入1/1 PASS；真Chrome双图→Core Edge/本机私有S3/SQL→本人短签URL/他人403→Admin AAL2 ZIP原图一致 PASS；Admin D3四队列/409 Chrome PASS；F07 Deno故障协议15/15、SQL反馈116/116 fixture PASS。**真实Edge第二图S3 PUT持续503**：第一对象保留、DB未提交/引用RPC空，恢复同UUID同图201/200且引用RPC两图已登记，异参409且未多写；**真AAL2 Admin ZIP临时缺一张已登记私图时503拒绝残缺包，恢复隔离S3后200/两原图字节完全一致、DB两条附件保留；在第一张私图GET在途将临时QA Admin active撤为false，真实Edge在最后权限/快照复核时403/409安全拒绝ZIP，恢复临时管理员后正向ZIP再次PASS**；普通JWT直调引用RPC403，整条F07 exit0且QA/对象清理PASS。仍未覆盖真实DB提交未知、长期孤儿安全删除、导出传输真正断连/敏感选项全矩阵及真实云R2（后者延期） | 最新可复测入口及未测在[独立收口执行计划](./2026-10-28-stage2-local-closure-execution-plan.md)，本地协议fixture不等于真实Cloudflare R2 |
