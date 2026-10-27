# AisenCore → AisenLens｜本地对接的 Core 侧接口与缺口清单（2026-10-27）

> **用途**：本清单是 [阶段过渡优化计划 B0-03](./phase-transition-optimization-plan-2026-10-27.md) 的**实现核对结果**，不是第二份长期 API 业务合同。准入/稳定错误/状态唯一权威为 [API 契约](../../architecture/backend/api-contract-and-mvp-acceptance.md)、[反馈 V3 领域规则](../../architecture/domains/user-feedback.md)与[当前需求](../../spec/requirements.md)。
>
> **证据范围**：2026-10-27 静态读取本地 `E:\Projects\Aisencore`、`main` @ `7735052e` 的 SQL 迁移、Edge 入口与 Admin 代码；**本次没有启动真实 JWT/HTTP 服务、没有测试 AisenLens 客户端、没有连接 R2 云环境**。`CODED` 表示在本仓库有源码，不等于部署或双端 PASS。AisenLens 本地仓库的路径、接口调用与版本仍 **NOT VERIFIED**。

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

**注意**：`check_access` 的 `allowed:false` 不是浏览器 403；`redeem_code` 的 `ok:false` 不是 HTTP 请求失败。HTTP 503、无响应/超时为未知，前端不能写入错误成功提示、盲换 `request_id` 或错误视为已取消 Pro。RLS 与 RPC 仍需真实 JWT 负例验证。

## 3. 反馈 V3 本人入口与 Edge（CODED，双端 NOT RUN）

| 入口 | 身份、参数与事实 | 缺口 / 测试边界 |
| --- | --- | --- |
| `feedback-submit` Edge，POST | 本人 JWT + 已确认邮箱，`multipart/form-data`：`product_key`、UUID `request_id`、`content`、`category`、0～2 个 `images`；当前代码校验正文最多 5000 字符、图片各自上限 3 MiB、请求体 7 MiB。受控图片私有 R2 条件写，经可信 RPC 原子登记；同请求号恢复/409/422/429 | [Edge 源码](../../../supabase/functions/feedback-submit/index.ts)、[反馈领域合同](../../architecture/domains/user-feedback.md)；数字是**当前代码上限**，不自动等于最终运营批准值；真实 AisenLens→Edge→R2 含图 NOT RUN |
| 本人 `feedback_submit_preflight(p_product_key text,p_request_id uuid DEFAULT NULL)` | 本人 JWT，受控产品/已提交请求及限流预检 | [最新签名迁移](../../../supabase/migrations/20261025144322_feedback_preflight_product_id.sql)显式删除旧单参函数；预检不是写入授权，提交事务必须再次校验 |
| 本人 `my_feedback(p_request_id uuid DEFAULT NULL)`、`my_feedback_events(p_feedback_id uuid)` | 只读本人有限 DTO/公开历史；包含反馈版本及受限附件标识，不包含 R2 object key/内部备注 | [反馈 RPC](../../../supabase/migrations/20261025131845_feedback_trusted_rpcs.sql)；AisenLens V3 **当前设计是用户单向提交**，旧 `reply_to_feedback` 的历史存在不构成自动新增客户端回复功能许可 |
| `feedback-image-access` Edge，POST | 本人或实时有权限的 AAL2 Admin，传 `attachment_id`，响应短期 `url,expires_in,mime_type`，错误 403/422/503 | [Edge 源码](../../../supabase/functions/feedback-image-access/index.ts)；私有 GET 链路和签名过期/撤权窗口须单独测试，不向业务界面暴露长期 key |
| `feedback-export` Edge，POST | **仅 AAL2 Admin**；`scope:selected/filtered`、队列/已选 ID 或过滤快照、可选字段开关；每次最多 20 条；敏感内部资料/身份默认关闭，返回 ZIP | [Edge 源码](../../../supabase/functions/feedback-export/index.ts)；不得让普通 AisenLens 客户端访问；完整含图、ZIP 失败/权限撤销/回收仍 OPEN |
| 管理 `admin_feedback_v3(p_feedback_id,p_expected_version,p_action,p_priority?,p_tags?,p_is_starred?,p_internal_note?)` | AAL2 Admin、版本锁，动作 `save/triage/archive/trash/restore/reopen`，四队列原位恢复 | [V3 迁移](../../../supabase/migrations/20261026060213_feedback_v3_lightweight_workflow.sql)；**非客户端接口**。旧五态/负责人/公开回复只属于历史数据，不恢复为新 Admin 操作 |

## 4. AisenLens 专用私有 JSON 配置备份：设计已批准，**当前未编码准出**

- [S1 方案](./s1-aisenlens-r2-backup.md)定义受限 JSON 白名单、JWT/Pro 检查、DB 配额原子预留、Edge 对 R2 final 条件写、pending/ready 和失败对账、客户端选版本→差异预览→按类别恢复；但当前 `supabase/functions` 已有入口只有 `feedback-submit`、`feedback-image-access` 和 `feedback-export`，**没有可供 AisenLens 调用的专用备份 Edge API**。不得把反馈图片上传路径误作配置备份已实现。
- `U09/U10/U11` 的字段白名单、最大字节数、版本数/保留期、断网 Pro 新任务与 15 分钟候选窗口**未冻结**；正式确定前不得写死为生产合同。
- 视频、拉片项目/时间轴、AI 输出、用户 API Key/Token 不得进入公共 Core 或该 JSON 备份，AI 分析不经过 Core 服务端。

## 5. 真正进入双端联调前的对照项目（均未开始）

| 项目 | 当前 Core 侧 | 待读取/实测的 Lens 侧 | 准出 |
| --- | --- | --- | --- |
| 本地仓库/构建/测试 | SQL 迁移与 Admin/Edge 已有部分分层证据 | **NOT VERIFIED**：仓库路径、分支、代码状态、启动命令 | 版本、环境和测试身份固定，可独立启动 |
| 本人 Auth/注册/成员 | public RPC 签名已核对 | **NOT VERIFIED**：令牌获取、成员首次加入时机、离线 Free 请求量 | 401/blocked/left/suspended/跨产品和同号并发实测 |
| Pro/兑换码 | 成员、资格、两参兑换契约已核对 | **NOT VERIFIED**：UI 自有业务权限、状态码分支、兑换码幂等告知 | 200 + `allowed/ok`、503/UNKNOWN、到期/撤权测试 |
| 反馈 V3 | Edge/RPC CODED，历史本地零图与部分 Chrome 已有记录 | **NOT VERIFIED**：上传/本人状态展示/附件异常 | 真客户端 0/1/2 图与 Admin V3 交叉检查，区分隔离存储/真 R2 |
| 配置备份/恢复 | 仅 S1 设计与安全边界，Core 专用 Edge 未编码 | **NOT VERIFIED**：实际 schema、配置类别、版本合并/冲突策略 | 双端先冻结 U09/U10/U11，再施工和测试 |
| 发布条件 | 第一阶段签收与安全/性能/人工门禁仍 OPEN | **NOT RUN** | 先处置 P0/P1，再有明确第二阶段准入授权 |

**联调执行入口**：[唯一 TODO](../TODO.md)的 `LENS-01～07`，以及[第二阶段具体顺序](./phase2-aisenlens-local-integration-plan.md)。本清单仅为 Core 侧静态核对，不把后续预期值标成已签约/已测试。
