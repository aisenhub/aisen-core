# 第二阶段B详细计划｜产品资格、安全历史与兑换闭环

> **状态：Lens↔Core↔Admin 本地资格/发码/兑换/直授/撤销/封禁 Chrome 正向 PASS；剩余 B-T 异常矩阵 PARTIAL。** 对应TODO LENS-04和审查F02/F03。入口为[第二阶段A](./02-stage2-auth-and-membership.md)真实会话/成员准出；有效永久Pro拒兑的独立SQL保护应已在[第一阶段](./01-stage1-core-readiness.md)修验。业务以[计费](../../architecture/domains/billing-and-entitlements.md)、[API与R-16](../../architecture/backend/api-contract-and-mvp-acceptance.md)为准。

**2026-10-27 最新实测**：Lens 新建 `features/auth/coreEntitlements.ts`，通过真正 Auth JWT 的 `check_access` 读取可信资格，本人授权历史仅查询安全字段、分页有界；`redeem_code` 两参数，HTTP200业务拒绝与网络故障分开，账号切换时丢弃旧结果，不因后续刷新失败反转已成功兑换。执行 Lens `node --test tests/features/workflow/core-entitlements.browser.test.js` **1/1 PASS**：真实 TOTP AAL2 Admin 发 30 天码→Chrome Lens 首次兑换→同事务创建会员/Grant/核销→Admin撤授权→Lens Free→Admin直授永久 Pro→Lens Lifetime→新期限码因 R-16 拒兑不消耗→Admin封禁/解封→Lens立即拒绝/恢复，完整 QA 清理。**Core 永久兑换码发行受既有运营政策明确禁止（`LIFETIME_CODES_NOT_ENABLED` HTTP422）**，不得更改此安全规则；永久 Pro 经 Admin 正式直授。限流、真实竞争、跨产品、失效链接、切换竞态等剩余 B-T 须实测后关闭本包。

## 1. 完成范围与非目标

Lens正常权益页准确显示当前资格/有效期、本人安全授权历史，并能向Core两参兑换、识别业务拒绝/限流/UNKNOWN、同码恢复；Admin直授/撤权/码管理与Lens显示可交叉核对。

不改AI发起/视频编码或去水印/第二项目创建入口，不将资格显示当作实际业务权限门槛落地；不接报价/爱发电/付款订单，不新增通用会员功能键、plans、capability或第二套权限数据库。

## 2. 接口/DTO与最小数据访问

| 输入/能力 | 可信结果 | Lens处理 |
| --- | --- | --- |
| `check_access(p_product_key)` | allowed/reason，允许时tier/pro_active/is_lifetime/有效截止/evaluated_at | 先判断业务准入；allowed:false不当网络错，不用缺字段默认Free |
| 本人Grant历史 | 已有RLS及显式安全列：id、产品、source_type、grant_mode、requested_duration_days、starts/ends、revoked_at、created_at等 | 按当前product_id、有界、显式列读取；不select*，不读source_ref或Admin用户查询 |
| `redeem_code(p_product_key,p_code)` | HTTP200内ok/code/retry_after_seconds或真实成功Grant摘要 | 只保留两参；RATE_LIMITED按后端时间，不能只看HTTP成功 |
| 兑换恢复 | 同本人/产品/码唯一核销；已兑本人REDEEM_ALREADY_USED不返回原成功Grant DTO | 保留同码手动重试，必要本人历史和当前资格核对，不新造请求ID/通用请求表 |
| 15分钟快照 | 有效本地资格复用窗口、自然到期和已知撤权约束，待实测 | 同环境/用户/产品去重/短缓存；新AI/云操作实时核验，本包不扩业务门槛 |

历史与摘要分开：创建时间不是授权开始时间；days=null的有限explicit_window不等于永久；未来或已撤销Grant仍可能是合法历史，但不能由历史重算Pro。读取失败不显示“暂无记录”，本来已有Pro也不能证明刚才那张码兑成。

## 3. 分步实施

| 步骤 | 先观察/补失败测试 | 最小修改/交付 |
| --- | --- | --- |
| B-01 API/状态对齐 | 200 allowed:false/ok:false、503、期限空值、历史错误会误显示 | 更新Core唯一API中实际字段/拒绝码与Lens最小转换；不构建通用状态机 |
| B-02 资格与历史 | 当前AccountSettingsContent没有email/access/onRefresh，有限直授误报永久、未知记录变空 | 接AccountPanels当前账号和真实摘要/安全历史；必要调整测试DTO以表达当前合同 |
| B-03 兑换 | 无真实onRedeem；首响丢失/重复输入/限流不能误成功或重复授权 | 接两参RPC和明确反馈；账户/产品变化使旧结果失效，码不进日志/备份/持久缓存 |
| B-04 永久/期限交叉验证 | SQL新保护虽独立修验，真实页面/HTTP仍可能绕过；未来授权与多份Grant易误判 | 真实Lens兑换与Admin直授/撤销对照R-16，普通周期续期/永久升级/管理员操作保持合同 |
| B-05 时效与失败恢复 | 断网/到期/撤权/刷新失败不能自动降为Free或沿用另一账号缓存 | 按事件复核/同请求去重/自然到期失效；验证最多15分钟窗口及真实网络量，不固定轮询 |
| B-06 清理和回归 | DEV样例records/假回调/销售参数影响正常页面 | 只移除证实已替代的占位；保留独立DEV预览与真实组件验证所需能力，购买未开放不伪造价格 |

R-16稳定业务拒绝码须在实现前与Core API/全部调用者同次固定，计划不伪称当前已有此响应。并发正确性以服务端事务/锁及唯一约束保证，按钮防重复仅为体验。

## 4. 具体用户闭环

1. 测试用户由Lens登录，权益查询返回无成员/Free/Pro或真实业务拒绝；不能为展示摘要无条件ensure。合法首次产品接入与兑换自身建成员路径按A和Core合同区分。
2. Admin以AAL2对同产品给有限、未来或永久Grant；Lens下次必要核验显示当前事实，历史保留来源/时段/撤销信息，不显示内部source_ref。
3. Lens输入真实测试码；Core合法成功后才显示成功，刷新摘要和必要历史。失败/未知保留输入供用户处理，不把已兑本人当新授权。
4. 注入首响丢失后按同码恢复；查询不确定时继续标待核对，不能换账户、换产品或再次发码掩盖结果。
5. Admin撤销某条Grant、所有当前Grant、码或产品状态；分别核验“撤码不撤既有Grant”“还有其他有效Pro不误降级”“最后有效资格失效”。
6. 用户local登出或切号，旧资格/历史/兑换结果失效，本地项目和加密凭据仍保留。

## 5. 必测矩阵与证据

| 用例 | 服务端和客户端必须一致 |
| --- | --- |
| B-T01 无/单/多Grant | Free派生、有限当前Pro、多份部分撤销、未来未生效，不写用户永久等级 |
| B-T02 永久与有限并存 | is_lifetime/截止准确；有限explicit_window不误永久，历史不代替当前资格 |
| B-T03 周期续期 | 30/365天及已有剩余时间按Core可信顺延；同用户并发不覆盖/重复顺延 |
| B-T04 永久拒兑R-16 | 当前有效永久拒兑其他周期/永久码且不耗码；同码重放仍已兑；未来/已撤销永久不误拦；Admin直授独立 |
| B-T05 无效/跨产品/限制 | 不存在/过期/撤销/用尽统一规则；blocked/left/suspended及声明产品先于码探测，不误恢复成员 |
| B-T06 竞争与幂等 | 两用户抢最后一次、同码多点击、首响丢失；Grant/核销/码次数均只发生允许的次数 |
| B-T07 错误/限流 | HTTP200 ok:false、200 RATE_LIMITED、401/真实403、5xx/超时；倒计时可信，故障非Free |
| B-T08 缓存与身份 | 多标签/切号/改邮箱/产品切换、迟到响应；最多15分钟/自然到期/已知撤权约束，非每点击联网 |
| B-T09 权限与隐私 | 本人历史列/产品有界、跨用户拒绝、秘密列无权；明文码不在日志/本机或云备份 |
| B-T10 页面与不回归 | 正常入口、错误保留、刷新、焦点/中英/窄屏；AI/视频/创建业务门槛未被顺便启用 |

每条记录Lens操作→请求→Core返回→Grant/核销/码次数/成员事件→Admin核对；涉及竞争必须保留并发开始/完成和真实DB断言，不以顺序调用或Mock假冒。

## 6. 运行入口、准出与交接

复用Core005数据库测试、`scripts/test-d1-concurrency.py`、实际Auth/HTTP脚本；Lens在现有账号浏览器/领域测试附近补真实资格/兑换与迟到响应场景。扩现有代码，不单独建设授权历史服务或客户端权益引擎。

代码修改后执行两仓typecheck/lint、受影响构建、SQL/真实HTTP及Lens浏览器；已在第一阶段通过的后端测试只在依赖/源码变化或未解决疑虑时重跑，不无限重复全套。记录请求量/时效与失败恢复，不修改实际AI/导出入口以“演示Pro”。

准出：B-T01～10适用场景和R-01～16本包部分有真实证据、永久保护无旁路/重复消耗，Core/Admin/Lens结果一致，未知与拒绝没有假成功，历史安全且本地内容不变。交付给[反馈](./04-stage2-feedback.md)与[备份](./05-stage2-template-backup.md)稳定的Auth/当前资格/错误入口；两者不能直接信本地Pro缓存。

## 7. 验证记录

| 范围 | 当前状态 | 后续记录 |
| --- | --- | --- |
| B-01～06 / B-T01～10 | **PARTIAL**：2026-10-28 Lens真实AAL2发码→Chrome兑换/Grant/会员→撤权→永久直授/R-16拒兑→封解1/1 PASS；Core pgTAP 93/93及独立PostgreSQL并发LCK-01～08全部PASS，同一用户再提交反馈→Admin AAL2审计的联合子链PASS；其他跨产品、会话竞争/缓存15分钟和部分真实HTTP故障矩阵仍OPEN | 最新命令、清理和范围见[独立收口执行计划](./2026-10-28-stage2-local-closure-execution-plan.md)，不将PARTIAL列为全部B包签收 |
