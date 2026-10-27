# AisenCore → AisenLens｜本地对接的 Core 侧接口与缺口清单（2026-10-27）

> **用途**：本清单是 [阶段过渡优化计划 B0-03](./phase-transition-optimization-plan-2026-10-27.md) 的**实现核对结果**，不是第二份长期 API 业务合同。准入/稳定错误/状态唯一权威为 [API 契约](../../architecture/backend/api-contract-and-mvp-acceptance.md)、[反馈 V3 领域规则](../../architecture/domains/user-feedback.md)与[当前需求](../../spec/requirements.md)。
>
> **证据范围**：2026-10-27 双仓 SQL/Edge/Admin 与 Lens 源码、路径/提交/入口已静态核对，详见[双仓审查](../aisenlens-aisencore-local-integration/2026-10-27-cross-repository-audit-and-integration-plan.md)。Core 代码基线7735052e，文档合入后4f698d5，Lens c83de232；两端真实 JWT/HTTP/客户端联调及云 R2 **NOT RUN**。本轮业务决定已确认、只改文档；CODED 不等于运行或验收。

## 1. 环境与鉴权边界

- **身份**：复用 Supabase Auth 邮箱/密码、确认/会话/刷新；每个本人公开 RPC 使用真实 **Bearer JWT**，不能用自报的 `user_id` 取代 `auth.uid()`。匿名离线 AisenLens Free 不强制登录/发网络请求。
- **本地服务**：以运行时 `supabase/config.toml` 的端口与当前隔离项目为准；先核对本地 JWT issuer/JWKS/anon 公开 key 与 CORS/回调，绝不复制持久 `service_role` 或 R2 密钥到客户端。当前静态清单无法证明服务已启动。
- **权限**：AisenCore 只判平台账号、产品成员及产品级 Free/Pro 资格；拉片任务、视频、本地 AI、无水印等具体功能/资源/额度由 AisenLens 自己决定，不向 `check_access` 传 `capability`。产品切换器只是查询过滤，**不是服务器权限**。
- **管理业务**：下表「仅 Admin」受当前有效平台管理员 + `aal2` + blocked 校验；普通 AisenLens 客户端**禁止**调用管理/发码/用户枚举接口。

## 2. 本地 Core public RPC 实际签名（均为 CODED，运行验收未执行）

| 调用方 / 函数（PostgREST RPC） | 真实参数 | 返回/错误必须遵循的合同 | 源码及联调注意 |
| --- | --- | --- | --- |
| 本人 `get_my_products()` | 无 | 本人已有成员关系产品的 JSON 数组，各条叠加 `check_access` 资格；未登录 401 | [可信 RPC](../../../supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql)；不应枚举全部产品或自动加入 |
| 本人 `check_access(p_product_key text)` | 真实产品 key（预期 `aisenlens`，需核对运行 DB） | JWT 无效 401；**可信业务拒绝 HTTP 200 + `allowed:false,reason`**（ACCOUNT_RESTRICTED / PRODUCT_UNAVAILABLE / MEMBERSHIP_REQUIRED/LEFT/SUSPENDED）；允许时 `allowed:true,reason:OK,tier:free/pro,pro_active,is_lifetime,effective_ends_at,evaluated_at`；技术失败 5xx/503，**不是默认为 Free** | [可信 RPC](../../../supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql)；只读、不建成员、不输出产品 Features/Limits |
| 本人 `ensure_membership(p_product_key text)` | 产品 key | 首次合法加入 `active` 并写事件；已有 active 幂等；left/suspended/blocked 不隐式恢复，非法状态应拒绝 | [成员 RPC](../../../supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql)；仅首次真正受限业务触发，非启动即无条件调用 |
| 本人 `leave_product(p_product_key text)` / `rejoin_product(p_product_key text)` | 产品 key | 主动退出 / 明确重新加入，`membership_status`、`changed`；不得由登录/查询/付款回调自动 rejoin；恢复成员状态不会自动恢复过期 Pro | 同一 [成员 RPC](../../../supabase/migrations/20261024032247_trusted_rpcs_and_locking.sql)；真实并发/旧请求负例待双端测试 |
| 本人 `redeem_code(p_product_key text,p_code text)` | **两参**：目标产品 + 用户输入兑换码 | 预期成功 **HTTP 200 + `ok:true,grant_id,tier,starts_at,ends_at`**；预期拒绝/限流 **HTTP 200 + `ok:false,code,retry_after_seconds?`**；认证 401 与技术故障 5xx 不伪装业务拒绝。新账号可与合法兑换同事务首次加入，left/suspended 不能偷重入 | [兑换 RPC](../../../supabase/migrations/20261024033040_redemption_and_grant_rpcs.sql)；**不存在可供客户端使用的旧 `redeem_code(code)` 单参合同**，需核对 UI 的失败重试/本人授权查询 |

**注意**：`check_access` 的 `allowed:false` 不是浏览器 403；`redeem_code` 的 `ok:false` 不是 HTTP 请求失败。读503为不可核验，写结果无法确定才UNKNOWN；成员按当前关系恢复，兑换只有两参、同用户/产品/同码重试，不添加request_id；反馈/备份才按原请求号恢复。不能假成功或将故障视为取消Pro。RLS 与 RPC 仍需真实 JWT 负例验证。

## 3. 反馈 V3 本人入口与 Edge（CODED，双端 NOT RUN）

| 入口 | 身份、参数与事实 | 缺口 / 测试边界 |
| --- | --- | --- |
| `feedback-submit` Edge，POST | 本人 JWT + 已确认邮箱，`multipart/form-data`：`product_key`、UUID `request_id`、`content`、`category`、0～2 个 `images`；当前代码校验正文最多 5000 字符、图片各自上限 3 MiB、请求体 7 MiB。受控图片私有 R2 条件写，经可信 RPC 原子登记；同请求号恢复/409/422/429 | [Edge 源码](../../../supabase/functions/feedback-submit/index.ts)、[反馈领域合同](../../architecture/domains/user-feedback.md)；数字是**当前代码上限**，不自动等于最终运营批准值；真实 AisenLens→Edge→R2 含图 NOT RUN |
| 本人 `feedback_submit_preflight(p_product_key text,p_request_id uuid DEFAULT NULL)` | 本人 JWT，受控产品/已提交请求及限流预检 | [最新签名迁移](../../../supabase/migrations/20261025144322_feedback_preflight_product_id.sql)显式删除旧单参函数；预检不是写入授权，提交事务必须再次校验 |
| 本人 `my_feedback(p_product_key text, p_request_id uuid DEFAULT NULL)`、`my_feedback_events(p_feedback_id uuid)` | 只读本人有限 DTO/公开历史；包含反馈版本及受限附件标识，不包含 R2 object key/内部备注 | [F06 后继迁移](../../../supabase/migrations/20261027151000_feedback_scoped_recovery.sql)（尚未持久部署；按产品列表、回收站原号最小存在性证明）；AisenLens V3 **当前设计是用户单向提交**，旧 `reply_to_feedback` 的历史存在不构成自动新增客户端回复功能许可 |
| `feedback-image-access` Edge，POST | 本人或实时有权限的 AAL2 Admin，传 `attachment_id`，响应短期 `url,expires_in,mime_type`，错误 403/422/503 | [Edge 源码](../../../supabase/functions/feedback-image-access/index.ts)；私有 GET 链路和签名过期/撤权窗口须单独测试，不向业务界面暴露长期 key |
| `feedback-export` Edge，POST | **仅 AAL2 Admin**；`scope:selected/filtered`、队列/已选 ID 或过滤快照、可选字段开关；每次最多 20 条；敏感内部资料/身份默认关闭，返回 ZIP | [Edge 源码](../../../supabase/functions/feedback-export/index.ts)；不得让普通 AisenLens 客户端访问；完整含图、ZIP 失败/权限撤销/回收仍 OPEN |
| 管理 `admin_feedback_v3(p_feedback_id,p_expected_version,p_action,p_priority?,p_tags?,p_is_starred?,p_internal_note?)` | AAL2 Admin、版本锁，动作 `save/triage/archive/trash/restore/reopen`，四队列原位恢复 | [V3 迁移](../../../supabase/migrations/20261026060213_feedback_v3_lightweight_workflow.sql)；**非客户端接口**。旧五态/负责人/公开回复只属于历史数据，不恢复为新 Admin 操作 |

## 4. AisenLens 专用私有 JSON 配置备份：设计已批准，**当前未编码准出**

- [S1 方案](./s1-aisenlens-r2-backup.md)实施当前完整分析模板的专属RPC/Edge、20份原子预留、唯一条件写及失败对账，手动完整差异后整体恢复个人模板；现有三条反馈Edge不能充当备份入口，专属备份仍未编码准出。
- U09/U10/U11 的业务方向已收敛：20份、5MiB已采纳待测、到期取回/删除、正常服务无年龄删除、完整个人恢复，以及短时断网新纯本地Pro有效快照暂按最多15分钟测试。剩余是全层schema固化、运行参数/权限实测和代码，不再等待所有者重复决定；新AI/云请求在线核验，AI/去水印/第二项目门槛本轮不改。
- 视频、拉片项目/时间轴、AI 输出、用户 API Key/Token 不得进入公共 Core 或该 JSON 备份，AI 分析不经过 Core 服务端。

**新增已确认实现差距**：昵称使用Auth用户可编辑资料仅显示；注销渠道上线前确定。有效永久Pro拒兑其他码且不耗码尚未写入SQL。反馈错误误报403、产品/回收站查询与旧回复写路径清理、隔离对象入口仍待实现；本人查询只作必要恢复，不新增客户端历史/进度/回复页。现有安全列Grant历史可复用，不造新接口。

## 5. 双端联调前的对照项目（静态已核对，真实运行未执行）

| 项目 | 当前 Core 侧 | 待读取/实测的 Lens 侧 | 准出 |
| --- | --- | --- | --- |
| 本地仓库/构建/测试 | SQL/Admin/Edge已有分层证据 | 路径/版本/入口静态已核对；实际隔离配置、构建/启动待本轮验证 | 固定实施版本与环境，可独立启动 |
| 本人 Auth/注册/成员 | public签名已核对 | 尚无真实服务接线；普通登录/反馈不ensure，local登出及最小凭据/在途任务接线待做 | JWT/blocked/left/suspended/切号与离线Free真实测试 |
| Pro/兑换码 | 签名已核对；新增永久拒兑保护未实现 | 资格/安全历史/同码恢复待接；不做本轮业务Pro门槛 | 200业务拒绝/限流/到期/撤权/首响丢失及并发 |
| 反馈 V3 | Edge/RPC CODED，错误/查询/旧写路径缺口仍在 | 已确认邮箱本人文字+最多两图、必要原号恢复；不建历史页 | 真0/1/2图及AdminV3，隔离对象与真R2分开 |
| 配置备份/恢复 | 专属Edge/RPC未编码 | 现有仅模板v1/完整个人恢复已静态确认；云适配待做 | 5MiB/20份/到期取回及部分失败、恢复冲突 |
| 发布条件 | 第一阶段签收与安全/性能/人工门禁仍 OPEN | **NOT RUN** | 先处置 P0/P1，再有明确第二阶段准入授权 |

**联调执行入口**：[唯一 TODO](../TODO.md)的 `LENS-01～07`，以及[第二阶段具体顺序](./phase2-aisenlens-local-integration-plan.md)。本清单仅为 Core 侧静态核对，不把后续预期值标成已签约/已测试。
