# 第二阶段A详细计划｜环境、身份、成员、昵称与生命周期

> **状态：本地真实注册/确认/恢复、登录登出主路径 PASS；全生命周期负例 PARTIAL。** 对应TODO LENS-01～03，审查F01/F03及决定7/8/9。必须先取得[第一阶段准出](./01-stage1-core-readiness.md)，本包通过后进入[资格与兑换](./03-stage2-entitlements-and-redemption.md)。总范围见[总计划](./00-integration-master-plan.md)。

**2026-10-27 可复测切片**：Lens `features/auth/coreAuth.ts` 新建唯一 `@supabase/supabase-js@2.76.1` 共享浏览器 client（仅配置公开 `VITE_AISENCORE_URL`/`VITE_AISENCORE_PUBLISHABLE_KEY` 时启用、自动刷新、session 独立 storageKey）；真实 `AuthPage`/设置 AuthForm 接上登录/注册/邮件/恢复操作，配置缺失时 Free 及本机项目仍可用。设置展示真实会话邮箱/昵称，local 登出先锁 `aiCredentialVault` 内存密钥，再调用 `signOut({scope:'local'})`，不删除已加密仓库或项目。Core `supabase/config.toml` 新增仅 localhost/127.0.0.1:8443 的 confirm/reset 白名单，**配置尚未重启验证实际应用**。Lens 浏览器 QA `tests/features/workflow/core-account-feedback.browser.test.js` 使用真实临时确认账号、正常 `/login`→GoTrue→设置→Edge 零图→PostgreSQL 和 local logout，含用户名/产品归属、反馈不产生 membership、临时身份/反馈清理断言 **1/1 PASS**；WebApp TypeScript PASS。邮件确认/密码重置真实邮件链接、跨标签、多用户切换旧任务与 MFA 等仍 NOT RUN；不把当前切片记完整 A 包验收。

**2026-10-27 本轮邮件复验补充**：直接运行 Core `node scripts/test-d2-auth-api-mfa.mjs`，真实 GoTrue+Mailpit 注册/确认、签名 JWT、密码重置链接/恢复密码及 HTTP/MFA 全部 PASS，合成测试账号清理。**环境差异仍 BLOCKED**：读取运行中 `supabase_auth_Aisencore` 非秘密配置发现 `GOTRUE_URI_ALLOW_LIST` **尚未包含 Lens `localhost/127.0.0.1:8443`**，虽然源文件 `supabase/config.toml` 已添加；尚未为载入配置停止/重建现有 DB/Auth，故不能将此标作 Lens 8443 邮件页面 E2E PASS。需要安全地重新加载 Auth 配置并复测 Lens 确认/找回页面、跨浏览器回调及无旧会话边界。

**2026-10-27 最新实测（覆盖上方历史环境叙述）**：已安全更新正在运行的 GoTrue Auth，仅新增 localhost/127.0.0.1:8443 的回调，Kong/DB 保持健康；旧 Auth 以停机容器保留回滚。由于现有 8443 IPv4 Vite 是未配置 Core 公共变量的其他开发进程，不终止它；通过 `python scripts/test-stage2-lens-mail-browser.py` 在临时 9443 回调与独立 Vite/多个全新 Chrome 配置中，实测真实 GoTrue+Mailpit 注册、跨浏览器邮件确认及恢复密码，旧密码被拒/新密码成功、注册不产生会员、合成身份清理，**完整退出码 0 / 1/1 PASS**，最终恢复 8443 Auth 配置。修复 Lens `coreAuth.ts` 在 SDK 抢先消费 PASSWORD_RECOVERY 时 React effect 迟订阅造成的重置失败；普通登录不允许当作恢复会话。正式 8443 进程仍须启动时注入公开 Core 连接变量，撤销 refresh、多标签、切换在途任务负例仍开放。

## 1. 输入与完成结果

输入：第一阶段正式签收/修复证据、当前Core实际API、两仓真实工作区、可确认隔离的Auth/DB/Admin/Mailpit和本地对象环境。仅整理源码或看到55321 health返回200不满足入口条件。

结果：Lens正常项目库/工作台账号入口可用同一官方Auth会话，注册/邮箱确认/登录/密码恢复/刷新/local登出与Core实际身份一致；仅合法产品操作建立成员，资料及旧响应按账号隔离，本机项目/普通配置/加密凭据保留。无后端配置或短暂故障不能白屏/阻塞Free工作流。

## 2. 开工环境表

在实施记录填实际值，不粘贴秘密：

| 必填项 | 核对方式/预期 |
| --- | --- |
| 两仓版本 | HEAD、dirty差异及本包范围，不能用旧审查提交号替代当前工作区 |
| 包与运行工具 | 各仓packageManager、Node、Supabase CLI/Edge runtime及SDK锁定版本，既有工具优先 |
| Core身份/数据实例 | project_id、API/DB容器或实例标识、issuer/签名算法/JWKS、公开key类别；确认非远程生产，不输出密钥 |
| Web origin/回调 | Admin3000、Lens8443及实际localhost/127.0.0.1；确认HTTP/精确confirm和reset路径/allowlist |
| 邮件与产品 | Mailpit实际55324，真实邮件生成/落地；当前运行DB中的aisenlens产品key及状态，不在代码伪造产品 |
| 测试账号 | 两个普通已确认账号、未确认账号、不同成员状态；管理员单独AAL2会话，不通过seed代替Lens注册 |
| 本地内容基线 | 隔离浏览器的项目/模板/普通设置/加密凭据可复核摘要；不得读取真实Key或全量导出用户存储 |

缺产品时通过现有受保护管理能力准备；缺环境时停止依赖步骤并记录NOT RUN，不默默切到远程项目、关闭JWT或用service_role代替用户调用。

## 3. 修改位置与实施顺序

| 步骤 | 先建立的失败证据 | 最小实施及位置 | 验收输出 |
| --- | --- | --- | --- |
| A-01 环境与回调 | 指定Lens回调未被允许、旧origin/无效邮件不能完成流程 | Core `supabase/config.toml`精确增补本地URL，保留Admin site_url；应用运行版本验证配置加载 | 实际邮件/回调、错误/过期分支、浏览器OPTIONS与Auth调用证据 |
| A-02 官方会话接入 | 正常AuthPage/设置表单当前无回调，不能登录；无env时Free应仍可进入 | Lens `features/auth/`集中一份官方SDK/client与会话订阅；公开env示例、必要路由/设置接线 | 无假会话、无重复client/刷新、未配置状态不顶层抛错阻塞Free |
| A-03 认证全流程 | 注册确认前不能当已登录，过期/失效/recovery混普通session等真实负例 | 复用AuthForm/AuthPage/authRoutes，接注册/确认/登录/忘记/重置/刷新，重发由用户明确触发 | 普通会话与PASSWORD_RECOVERY区分，成功/失败只按真实Auth结果显示 |
| A-04 成员准入 | 仅登录/查询/反馈不应产生join；left/suspended不能ensure恢复 | 当前产品参数在最小适配中固定，合法首次产品操作才ensure；leave/rejoin为明确用户动作 | 当前成员关系及事件与UI一致，同用户产品唯一且合法重试不重复事件 |
| A-05 资料 | 旧昵称保存/邮箱修改没有真实结果；切号不能沿用前一账号draft | Auth用户可编辑资料保存可选昵称，邮箱变更用官方认证，更新显示；不新建profiles表 | 稳定user_id不变，昵称只显示，恶意metadata不能获得Pro/Admin |
| A-06 登出/切号 | 全局登出会影响其他应用；旧请求/私图/云清单可串号 | 显式local登出，失效本账号请求/缓存；复用现有保险库lock、会话Key释放和任务收尾/取消入口 | 两应用独立会话、两标签旧响应保护、Key释放与加密密文/项目保留 |
| A-07 正常入口回归 | 工作台打开账号可能丢位置/草稿，认证落地或无配置阻塞Free | 仅必要App/WorkspaceSettingsDialog组合、已有组件状态和中英错误文案 | 项目库/工作台/独立认证页均真实可用，键盘/窄屏无阻断 |

A-02所需新文件只有实际职责成立时建立，不按每个按钮建service。普通查询不重复getUser/强制刷新；登录状态不等于当前产品allowed或Pro。邮箱和昵称不是资源owner主键。

**成员取证分层**：本包用真实用户JWT独立验证成员RPC与调用时机，不新增仅为测试的加入按钮。实际首次业务加入由B的合法兑换或D的用户主动云操作产生，交对应工作包和综合验收记录；反馈不建成员的实际页面负例由C验证。A的Auth准出不依赖尚未接好的兑换/反馈/备份UI。

## 4. 生命周期的明确边界

- 主动切号/登出前，账号相关任务由用户选择等待完成或明确取消；不得静默取消付费请求，不对结果不明的外部AI请求自动重发。
- 复用已有任务完成/取消入口和保险库lock，释放未持久保存会话Key；保留加密凭据，不删除连接/Provider，不触发孤立凭据回收来实现登出。
- 网络中途失效或远端SIGN_OUT也要使旧账号异步结果失效；无需新任务平台/复杂状态机。新请求只能归当前环境、用户和产品，晚到结果不能改变当前账号显示或应用模板。
- 不更改AI执行/Provider算法、项目数据库、视频导出、新建/导入门控。若已有接口确实无法表达必要收尾，列出现实阻塞和最小调用点再处理，不能顺势重构。
- 注销具体渠道上线前决定；本包不建自动删号、反馈代申请或假“已受理”按钮。普通登出不是leave，也不是注销或删除本地数据。

## 5. 必须运行的行为矩阵

| 用例 | 行为与服务端/本机断言 |
| --- | --- |
| A-T01 注册/邮件确认 | Lens真实提交→Auth待确认→Mailpit链接→确认后会话；注册/登录不自动建成员 |
| A-T02 过期/错误/重放链接 | 错误可恢复、不假成功、不错误进入reset；固定受控返回路径，无开放重定向 |
| A-T03 恢复密码 | 正常session不冒充恢复凭据，真实恢复后新密码有效/旧密码失效，界面状态与Auth一致 |
| A-T03B 异浏览器邮件 | 浏览器配置A发起注册/找回，独立且无原会话/存储的配置B打开Mailpit确认/恢复链接；确认及改密成功，记录B会话与A重新登录/继续行为，不复制token；失效/重放仍正确拒绝 |
| A-T04 会话刷新/重开 | 唯一会话源、必要刷新，token过期/refresh撤销/网络故障分开；不按每次render重查 |
| A-T05 成员 | none合法首次加入一次；active幂等；left需明确rejoin；suspended/blocked拒绝；查询/反馈不加入 |
| A-T06 资料 | 昵称共享显示且不授权；邮箱修改前后user_id/成员/Grant/对象不变；校验失败保留输入 |
| A-T07 两应用/两标签 | 独立Admin及Lens会话，Lens local登出后Admin仍可刷新；A账号晚到响应不写B |
| A-T08 凭据/任务 | 等待/明确取消后登出，保险库锁定、会话Key释放；密文/项目/模板仍在，无隐式AI重发 |
| A-T09 离线/缺配置 | 匿名Free无需Auth/RPC；后端未配置或不可用仍进本地工作流，错误不被判封禁 |
| A-T10 正常入口UI | 项目库与工作台打开/关闭、返回位置/输入/草稿、键盘焦点/中英/窄屏；不依赖DEV预览 |

A-T03B属于本包准出，不等第三阶段才验证；真实HTTPS、邮件投递及设备差异在第三阶段复验。旧access JWT在自然有效期内不一定因signOut立即失效，需按实际窗口记录；blocked/成员/Admin资格的新可信检查仍应拒绝，不混为一个“旧token全部401”断言。

## 6. 测试入口、交付与准出

Core复用 `scripts/test-d2-auth-api-mfa.mjs`、成员004 SQL及对应HTTP测试；Lens扩 `tests/features/workflow/account-entry.browser.test.js`，新增真正覆盖SDK/回调/会话与切号的最小测试。不得把旧“提交禁用”用例PASS充当接入成功，也不能为保留旧断言禁用真实功能。

代码完成后运行各仓typecheck/lint；Lens执行现有WebApp构建/验证及账号浏览器回归，Core配置/后端变更执行相关HTTP/SQL验证；本机数据不变用实际隔离存储检查，不只比较UI文本。测试脚本运行前确认其服务与QA清理约定。

交付：运行环境表、公开env示例及固定回调清单、实际Auth/成员/错误DTO、相关改动与先红后绿证据、A-T01～10和请求量/数据保护记录、删除的占位/无用回调说明、未测范围。

准出：正常入口真实JWT/Auth/成员闭环与负例、资料和生命周期保护通过，未向浏览器引入秘密或第二套会话，原Free/项目/模板不回归。A通过才依赖它开展后续业务；不能因登录按钮成功就宣称所有账号安全已验收。

## 7. 验证记录

| 范围 | 当前状态 | 后续记录 |
| --- | --- | --- |
| A-01～07 / A-T01～10（含A-T03B） | **PARTIAL**：2026-10-28 真GoTrue/Mailpit→独立Chrome注册确认/找回/旧密码拒绝/已消费恢复凭据重放拒绝1/1 PASS；Lens真实登录/登出、兑换首次加成员/只读不加、本人反馈也已PASS；refresh撤销、错误或过期邮件链接、多标签旧响应、跨产品切号与任务/凭据边界仍OPEN | 当前证据与逐项缺口见[2026-10-28 本地三端收口执行计划](./2026-10-28-stage2-local-closure-execution-plan.md)，不是整个A包PASS |
