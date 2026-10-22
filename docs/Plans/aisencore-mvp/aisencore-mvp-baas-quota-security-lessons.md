# MVP｜Supabase BaaS、原子配额与低请求量鉴权：外部建议采纳/拒绝及安全检查清单

> **状态：DESIGN REVIEW ONLY / RUNTIME NOT VERIFIED（2026-10-22）**。已完成的阶段执行清单按 Plans 规则清理，技术采纳/拒绝及测试依据保留于本文。本文件**仅审查第三方通用技术建议对 AisenCore 的适用性**，不表示照抄示例 SQL/JavaScript，也未在真实 Supabase/R2 执行。业务事实以 [正式需求](../../spec/requirements.md)为准，已有 [Auth/Pro/Admin MFA 低请求量方案](./aisencore-mvp-auth-entitlement-mfa-efficiency-design.md)、[F01～F04](./aisencore-f01-f04-security-convergence-design.md)、[F05～F08](./aisencore-f05-f08-contract-compatibility-readiness-design.md)继续有效。

## 1. 逐项采纳决议（优先保持 MVP 简单）

| 第三方建议 | 本项目决定 | 对现有设计的具体影响 |
| --- | --- | --- |
| 无独立公共云服务器，使用 Supabase 原生 Auth/PostgREST/PostgreSQL/RLS/RPC + 少量 Edge | **已采纳，保持** | 不建独立应用服务器、Redis、通用 API 网关；R2 私有对象服务仍由可信窄 Edge/产品组件负责。BaaS 不是“没有服务器端代码”：RPC、RLS 和 Edge 都是可信后端 |
| Supabase Free Unlimited Data API Requests | **事实需正确解释** | 官方定价为不限固定 API 请求次数，但**不代表无限 CPU/内存/连接/DB 空间/出站带宽或可靠性 SLA**；MAU 不按同一用户每次查 Pro 累增，Auth/DB/Edge/R2 分别计量。预算以真实 Project Usage 与当时定价为准，不把免费额度数字固化在业务规则里 |
| 前端权益 5～10 分钟 TTL / 页面前后台返回就查 | **条件采用，已覆盖大部** | 保留 Aisenlens **启动/进入 Pro/关键操作按需复核 + single-flight**，不固定 15 分钟轮询、也不每次 window focus 强制查；15 分钟只是待测新鲜度候选。登出、切换用户/会话、兑换、失效/撤销、已知到期、恢复网络按事件失效；云端受保护操作另做实时授权 |
| PostgreSQL RPC 原子验证与扣减，前端无直接余额/权益写权限 | **适用时采用，不新增无需求的账本** | AisenCore 已用 RPC 负责发码、授权、兑换/撤销；Aisenlens R2 通过产品元数据进行 `ready+reserved` 事务预留和最终结算。只有未来需要真实**平台计费次数**时才讨论消费型 RPC/账本 |
| 把简单 `consume_user_quota(cost_amount)` SQL 直接建到 `public SECURITY DEFINER` | **明确拒绝照搬** | 客户端可以传 0/负数/溢出值，原示例可能**负数加余额**；`VIP` 查询与消费没有一致事务/锁序、重复网络请求不幂等；公开 definer 可能以高权限 owner 绕过 RLS，默认 EXECUTE 暴露；未处理业务来源/属主/审计/角色和错误 |
| JWT Hook 加入 `is_pro`、`vip_until`，RLS 不查 DB | **不作为当前授权权威** | Custom Access Token Hook 可用于非敏感稳定 claim，但客户端已有 JWT 直到过期/刷新都可能陈旧，无法承担跨产品动态 Pro、blocked、成员/套餐撤销和配额真实性。仍由当前 DB `check_access`/管理内核鉴权；Admin `aal2` JWT 是**认证等级**，不是过期的资格名单 |
| JWT + Redis 黑名单、Redis/Lua 扣费 | **MVP 不采纳** | Supabase SDK 原生 access/refresh 生命周期 + DB 当前资格/成员/blocked + PostgreSQL 条件 UPDATE/行锁足够表达现行需求；只有实测 P95/CPU/并发显示 DB 真瓶颈且 SQL/RLS/调用优化不足时才新开架构审查 |
| 通过 Edge 代理所有 AI/视频并代持 OpenAI/第三方密钥 | **当前不采纳** | Aisenlens AI 用用户自带 API Key 在客户端直连第三方，不由公共 AisenCore 承担模型调用费用/统一扣费；仅 Auth Admin、R2 签发/校验等**确需可信秘密**的窄服务使用 Edge，R2 文件字节直接客户端 ↔ R2 |
| 业务权限、配额全部写 JWT | **不采纳** | 会话身份和业务授权分离，不能因为降低数据库查询而牺牲及时的撤权、封禁和产品归属校验 |

## 2. 可复用的原子配额/消费安全合同（适用于未来真正有配额的可信业务）

**不要把本节当成新建 `public.profiles.quota`、积分业务、`consume_user_quota` 可调用 RPC 或实际迁移批准。** 当前 AisenCore 核心权益是可用功能与数值上限；**实际已消费量应由拥有资源的产品业务库/可信元数据维护**。客户端声称“我已经有配额/需要消耗的成本”不可作为可信事实。

### 2.1 必须通过的实现审查（即使使用 PostgreSQL 原生事务也不能省）

1. **成本可信**：消费操作由可信产品端根据固定操作类型/资源计算有效 `cost`；客户端不能任意提交扣减数值。若确需传 `cost_amount`，检查 `integer>0`、类型/上限/溢出/NULL，不能是 0、负数、字符串、小数、极大值或无穷。
2. **当前主体与准入**：由真实验签 JWT 获取 actor，检查平台 blocked、产品 active、成员 active、当前有效功能及资源属主；没有通过检查的请求不能写入、预留或绕过 RLS。
3. **受控权限边界**：普通客户端只读自己安全的可展示列；授权、余额、已用额度与配额预留列不可直接 UPDATE/UPSERT/DELETE。实现确需扩权时沿用 F01 的 **public INVOKER 薄包装 → 非暴露 private 最小 DEFINER 内核**，限制 schema USAGE/函数 EXECUTE/函数 owner、固定 search_path、严查真实 actor；**不要复制原文 public SECURITY DEFINER 示例**。
4. **原子不变量**：在**一项数据库事务**里取得已定 F02 锁序/目标行锁，确认余额/上限（包含已预留量）并条件更新/插入唯一键；保障 `remaining>=0`、`ready+reserved<=effective_limit`、不会超量；不能“先从前端 SELECT、再前端 UPDATE”。SQL 条件更新保障余额并发不足，但其他资格/价格/撤销的预读取也须纳入一致性锁序。
5. **幂等与来源**：以可信 actor、产品/资源、逻辑操作的 `request_id` 建来源唯一性、对**规范化真实有效参数**记录指纹；重复同键/同指纹返回首次结果的**安全非秘密字段**，同键改金额/对象/功能返回冲突。网络超时先查持久状态后同键重试；不能二次消费、两次预留或增加多条审计。
6. **审计与失败回滚**：实际消费/授权/审计同事务提交；业务拒绝和技术 5xx/SQL 异常区分清楚，不把异常当作“余额不足”。外部对象/第三方 API **不能和 PostgreSQL 事务原子提交**，需 staging、reservation、幂等、过期补偿与孤儿对账，不能声称单个 RPC 能跨 R2 精确同时完成。
7. **产品归属与聚合**：公共 `plans.limits` 只是额度上限来源，不建共享余额事实来覆盖所有产品；真实 R2 备份大小/数量由 Aisenlens 可信元数据计量，人工兑换码按 D1 的 `redemptions` 与约束计数；本地用户自己负担的第三方 AI 调用不经过公共 AisenCore 扣费。

### 2.2 对第三方样例 SQL 的具体拒绝理由

样例 `update profiles set quota=quota-cost_amount where quota>=cost_amount` 在 `cost_amount=-100`、正余额时可以使余额**增加 100**；`cost_amount=0` 允许零成本无限触发该操作，除非业务明确规定可免费调用。样例先 `SELECT vip_expire_at` 再 `UPDATE`，未必与并行 revoke/blocked、Plan 编辑和消费具备一致锁序。样例没有请求幂等键、实际资源属主/审计约束，还把高权限 definer 放在默认可暴露的 `public`，可能绕过 RLS。**它展示概念，不是可用于生产的安全代码**。

**可重复使用的抽象流程（不是 SQL）**：

```text
用户携带本人 JWT → 受保护的一次业务 RPC
  → 验证 JWT/actor/blocked/产品成员/有效能力与资源属主
  → 服务端确认实际业务成本、请求 UUID 与规范化参数指纹
  → 全事务统一锁序 → 同键幂等读取或唯一键竞争处理
  → 判断真实剩余/预留量并原子更新 → 必要审计同事务
  → 安全响应；超时先查状态，技术异常整体回滚
```

### 2.3 R2 与未来服务额度的适用性区分

| 类别 | 当前决定 | 正确计量 |
| --- | --- | --- |
| **R2 配置备份** | U02 首批必须实现，私有、严格白名单 | 产品拥有的 `ready+reserved` 元数据按实际对象大小/数量锁内预留、final 校验并结算；R2/数据库跨系统失败进行可恢复补偿，和 F03 final 不可变方案一致 |
| **第三方 AI 分析** | U04 Pro 有该功能，但使用用户自己的第三方 API Key | AisenCore **仅检查 AI capability**，不代理调用、不默认扣公共 AI credits；模型供应商负责其 API 消耗结算 |
| **将来平台付费 API、AI credits、共享积分** | **尚未批准此类商业业务** | 未来单独确定成本单位、上下限/周期、账本/调账、失败退额度、幂等模型，再决定是否新增消费型 RPC/表，而不是本轮先发明通用余额系统 |

## 3. JWT Hook、客户端快照与撤销时间窗

- **允许 JWT 解决身份**：服务端严格验签、`sub/iss/aud/exp`，Admin `aal2` 只是认证等级。对于非对称 JWT 及可缓存 JWKS 可减少不必要 Auth `getUser` 网络请求；Supabase Auth SDK 负责 refresh。
- **禁止 JWT 作动态权益权威**：`is_pro`、`vip_expires_at`、`remaining_quota`、`is_admin`、平台 blocked 或某产品会员状态在 Token 过期前可变，**不能只靠 Custom Access Token Hook 在 RLS 中当实时值**；不将用户可修改的 `user_metadata` 用于授权。
- **客户端快照只节流 UI/已批准的本地行为**：保持 [Auth/Pro 专项](./aisencore-mvp-auth-entitlement-mfa-efficiency-design.md#3-aisenlens-权益复核事件驱动--短期快照候选) 的 key/15 分钟候选/single-flight/按需失效；`Date.now()` 只能提供 UX 判断，不能延长服务端有效权益、已知自然到期日期或决定新云端操作。用户切换、登出、兑换、会员/账号限制已知变化、恢复联网与服务器授权拒绝应触发失效；不因为窗口切前台就无条件重复查询。
- **真正的当前资格**：`check_access` 由可信 DB 判断当前成员、产品、grant 和 blocked；Admin 数据 RLS/业务 RPC 在原请求内检查 `aal2`+当前 admin，Auth Admin Edge 仍执行 F04 原 JWT 资格复核；新 R2 URL/complete/download 校验用户/对象/权益/容量。
- **不承诺免费缓存等于授权安全**：完全离线但缓存还未超过候选 15 分钟时启动**新**纯本地 Pro 操作的边界仍由 U11 另行决定；已启动纯本地任务可完成，不自创永久离线 Pro 授权。

## 4. 免费配额、数据库性能与发布验证

**截至 2026-10-22 官方 [Supabase Pricing](https://supabase.com/pricing) 的 Free 宣传**为 Unlimited API requests、50,000 Auth MAU、500 MB database、共享 CPU/500 MB RAM、5 GB egress，免费实例可能因闲置而暂停。**这些不保证服务器资源无限**；Edge Function、R2 额度单独评估，不将宣传页数值写入公共 API 合同。MAU 与同一已计数用户的第 N 次 `check_access` 不是同一个计量维度。

| 需要测试的瓶颈/风险 | 真实测试方法（未来获授权） | 不可接受的误读 |
| --- | --- | --- |
| `check_access` 与管理列表慢 | 锁定 PG/PostgREST 版本，测 `EXPLAIN (ANALYZE,BUFFERS)`、热点索引、是否不必要 join / SELECT *、RPC P50/P95 | API 次数“不限”即可忽略 CPU、连接、带宽 |
| RLS 对每条业务行重复查询 admin/profiles | 用匿名/用户 A/B/aal1/aal2 负向测试，评估适当的 `(select auth.uid())`/只依赖请求状态的 helper、过滤索引及是否重复扫描 | 把本该逐行判断的对象所有权缓存成全局放行 |
| R2 备份控制 | 比较签发、confirm、下载、删除各 Edge 调用次数及对象负载，证明 direct R2 不经 Supabase 数据出口和 trusted final 完整性 | Data API 无限等于 Edge 和对象操作无限 |
| 客户端权益更新/会话 | 100/1,000 用户模拟：固定轮询 vs 事件驱动/去重，测 MAU、Auth RPC、DB RPC、Edge、出站、CPU、P50/P95 和授权撤销延迟 | 缓存 10/15 分钟就可以跳过所有服务器 ACL |
| 公共数据库数据保护 | 灾备计划和真实 restore 演练（公共永久授权、兑换码/审计、R2 元数据对应） | 独立 R2 配置备份就是公共数据库的备份 |

## 5. 未来验收用例（均 NOT RUN，独立于原 55 与 AUTH-P01～12）

| Case | 负向/边界输入 | 必须符合的结果 | 状态 |
| --- | --- | --- | --- |
| **BAAS-Q01** | 可信消费候选接收 -1/0/NULL/浮点/超范围/极大正数 | 安全拒绝，不允许余额增加、不越界、不写审计成功；没有消费能力时本案例为**设计门槛**而非强制先发明新接口 | NOT RUN |
| **BAAS-Q02** | 两连接并发在仅剩 1 单位时各消费 1 | 仅一次成功，余额不负、无重复审计；有真实计量业务时再跑 | NOT RUN |
| **BAAS-Q03** | 同 actor/request_id 重试、响应丢失和改变 cost/产品/资源 | 相同参数幂等一次，改参数冲突，任何消费/预留不重复 | NOT RUN |
| **BAAS-Q04** | 普通用户尝试基表直接 UPDATE/UPSERT `quota`、`grant`、`reserved` | 无直接写权限；必须经过受保护、精确授权的 RPC；匿名与跨用户拒绝 | NOT RUN |
| **BAAS-Q05** | public 中任何函数的默认 PUBLIC EXECUTE、owner/RLS bypass、缺少 search_path | 无预期外 EXECUTE 或 actor 冒充；最小 private 内核仍严格身份/属主检查，不能靠公开 definer 获得越权 | NOT RUN |
| **BAAS-Q06** | JWT Hook 旧 `is_pro`/旧授权、撤权/blocked/永久权益、管理员 `aal1` | 可信服务端依当前 DB 拒绝失效能力；普通 JWT 不能取得 admin `aal2` | NOT RUN |
| **BAAS-Q07** | 用户退出、换号、完成兑换、已到自然到期点、断网重连 | Pro 缓存不会串号、不超自然到期；未批准的离线新 Pro 不被缓存默许 | NOT RUN |
| **BAAS-Q08** | R2 同账号并发备份/超限/confirm 超时/已 ready 覆盖 | `ready+reserved` 原子且幂等、可信 final 不可被旧 URL 修改，异常孤儿补偿 | NOT RUN |
| **BAAS-Q09** | 相同使用模式固定轮询与按需合并，并放大真实 DB / RLS 规模 | 比较 HTTP/SQL 次数、扫描/锁等待、CPU、带宽、P95、Edge 调用；没有实际数据前不得断言“省 80%/85%” | NOT RUN |
| **BAAS-Q10** | 重新登录/刷新时 JWT 声明陈旧，禁用 Admin 后仍持有效 access token | 后续 RLS/RPC 校验当前资格；MFA 正常会话不需逐操作挑战，也不因不查询 Auth 每次而放宽撤销边界 | NOT RUN |

原 I-01～I-28、R-01～R-15、A-01～A-12、AUTH-P01～P12 均继续保持原设计/NOT RUN；**不将条件性“未来平台消费 RPC”误算成已经确定的 MVP 交付需求**。

## 6. 当前官方核验与落地门槛

- [Supabase database functions](https://supabase.com/docs/guides/database/functions)：RPC/Definer、schema 与权限的安全注意事项。
- [Supabase row level security](https://supabase.com/docs/guides/database/postgres/row-level-security)：逐行身份与索引/查询优化。
- [Supabase Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)：Hook 只在签发/刷新令牌时调整 claims，不会实时同步 DB 变化。
- [Supabase Pricing](https://supabase.com/pricing)：Free 的 API、MAU、DB 与计算/流量边界。数值和定价需按真实实施时重新查验。
- [D1/F01～F05 安全合同](./aisencore-mvp-d1-database-implementation-design.md)、[F01～F04](./aisencore-f01-f04-security-convergence-design.md)、[F05～F08](./aisencore-f05-f08-contract-compatibility-readiness-design.md)：真正编写 SQL 前对齐 actor、RLS/EXECUTE、锁序、原子幂等、错误码与 M1～M5；再结合 D4、AUTH-P 与本文件新增条件性 BAAS-Q 负向验证。

**阶段结论**：保留 Supabase 原生后端、轻量客户端缓存与可信原子 RPC；拒绝不安全示例 SQL、把动态权益/管理名单硬写 JWT、初期加 Redis/独立服务器和不必要的 Edge AI 代理。**没有执行真实 SQL/SDK/HTTP/云服务测试，性能节省百分比也未测量**。
