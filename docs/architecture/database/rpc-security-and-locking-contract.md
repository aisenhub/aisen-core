# 受保护 RPC 与事务锁序：长期安全合同（F01/F02）

> 状态：设计基线已收敛，**首批 6 表/RLS/列权限已在本地数据库执行并通过 35 项 pgTAP；受保护 RPC、真实 JWT、并发与性能仍 NOT RUN**。本文保存长期必须遵循的授权与锁顺序，不代替[计费权益业务规则](../domains/billing-and-entitlements.md)和[公共 API/错误契约](../backend/api-contract-and-mvp-acceptance.md)，DEC-01 已批准双参数新兑换签名，**L0 仍保持原全局排他锁模式**，实现前不得宣称安全测试已通过。

## 1. 可信入口与权限隔离（F01）

- 客户端/独立 SaaS 使用经过 Supabase 验证的本人 JWT；public 下暴露的业务 RPC 为 **SECURITY INVOKER** 薄包装层，不接收可伪造的 actor、管理员标志或高权限服务密钥。
- 有状态业务操作交给 **非 exposed schema 的 private SECURITY DEFINER 内核**；内核应具受控、最小权限的 NOLOGIN owner、固定空 search_path、全限定的表/函数名；禁止可被输入操纵的 SQL 对象名和动态 SQL。
- public invoker 包装器要调用 private 内核，authenticated 通常须具备受控的 private schema USAGE 和**精确内核签名**的 EXECUTE。**非 exposed 不意味着内核绝不可能被直接 SQL 调用**：每个内核必须再次验证 auth.uid()、可信 JWT、目标用户/产品/属主与操作资格；管理写入同时验证当前 aal2、platform_admins.active 和非 blocked。
- 创建/更新函数的同一版本化迁移必须收紧 PUBLIC 默认 EXECUTE、anon/authenticated 的函数授权、schema 权限、表 GRANT/RLS、默认权限、函数 owner 与搜索路径；对客户端禁止受保护表直接 DML。管理 RLS 的 private.is_platform_admin() 只返回当前会话是否合格，不提供查询任意他人资格的接口。
- **一项状态变更、计数变化及审计在一个 PostgreSQL RPC 事务内完成**。独立 Edge Function、Auth Admin API、R2 操作与数据库事务之间不能宣称 ACID；必须由对应备份/身份方案定义幂等和补偿。

## 2. 唯一锁总序（F02，当前保守版本）

按操作需要取得相应锁子集，顺序固定为 **L0 → L1 → L2 → L3 → L4 → L5 → L6 → L7 → L8**，禁止已取高层锁后倒回取低层锁。多对象按 UUID 固定顺序获取；隐含的 FK/UNIQUE/行锁和锁升级需在真实 PostgreSQL 双连接测试中观察。

| 层级 | 现行职责及锁模式 | 核心保证 |
| --- | --- | --- |
| **L0** | **所有管理写入口**先取同一个全局事务级排他 advisory lock | 锁后重新检验管理员资格与 aal2；撤权/全局封禁共同保证 M1 最后一名合格管理员 |
| **L1** | 目标账户事务 advisory lock | 用户本人受保护写入与针对该用户的管理写入共享顺序；锁后复核 blocked，即使限制行尚不存在也能锁定 |
| **L2** | 本人 redemption_rate_limits 失败窗口行锁 | 串行化失败计数；超限时不继续取得码/授权锁 |
| **L3** | 产品行：需要 active 的普通写入使用共享行锁，状态修改使用排他行锁 | 锁后验证当前产品状态；跨对象不得倒序 |
| **L4** | 保留锁序编号，本期无公共套餐行可锁定 | 不取得任何已删除 plans/功能版本的锁；所有实际写入口继续遵循现行剩余层级 |
| **L5** | 已存在成员行的更新锁；无成员时先只读判定 | left/suspended 不隐式恢复；兑换成功才首次创建成员 |
| **L6** | 兑换码行更新锁；从 hash 初步查到 ID 不是授权结果 | 锁内重验码及归属；历史本人已兑与当前有效性遵循 API 优先级 |
| **L7** | 同用户+同产品 Pro 续期 advisory lock | 续期按最新未撤销的同产品 Pro 周期授权最远到期日串行计算；永久授权不可当作无限周期顺延 |
| **L8** | 受保护变更与审计的同事务最终写入及唯一约束 | 成员、grant、redemption、次数与审计一致；不再倒序补锁 |

主要操作锁子集：ensure/rejoin/leave 使用 L1 和适用 L3/L5；redeem 使用 L1/L2/L3/L5/L6/L7/L8；admin_create_codes 使用 L0/L3/L8；admin_grant_entitlement 使用 L0/L1/L3/L7/L8；admin_block/revoke_admin 使用 L0、适用 L1、L8。撤码/撤授/成员封禁等只取得必要锁。严格禁止已取高层锁后回取低层锁；已删除的公共套餐和能力配置不进入任何锁路径。

### 2.2 已确认的逐操作获取锁矩阵（长期规范）

表中“—”表示无须获取该锁，**不是许可倒序获取其他锁**；只列逻辑锁，真实 SQL 仍受 FK/UNIQUE 隐含锁和隔离级别影响。先用非锁定只读识别目标 ID（包括码 hash、批次或 grant），不得据此授予权限；拿到规定的锁后必须重新读取目标行并验证归属、状态及资格。

| RPC 类别 | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | 写入与复核 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ensure_membership / rejoin_product | — | 本人 | — | 产品 SHARE | — | 已有成员 UPDATE／唯一性 | — | — | blocked / active / left / suspended；不可隐式复活 |
| leave_product | — | 本人 | — | 适用时产品 | — | 成员 UPDATE | — | — | 仅退出不撤销 grant、备份或项目 |
| redeem_code(product_key, code) | — | 本人 | 限流行 UPDATE | 声明产品 SHARE | —（无 plan 表） | 先已有成员 UPDATE，left/suspended 先拒绝 | 后码 UPDATE 并确认产品、tier=pro 和原始授权天数 | 本人+产品 Pro | 成功才写必要成员/Grant/核销与次数，失败只能保留限流计数 |
| admin_create_codes | 全局排他 | — | — | 产品 SHARE | —（无 plan 表） | — | 新码/批次唯一性 | — | 发 Pro+固定授予天数；首响明文，重放只能读非秘密 |
| admin_grant_entitlement | 全局排他 | 目标用户 | — | 产品 SHARE | —（无 plan 表） | — | — | 用户+产品 Pro | duration / explicit_window，同 actor 幂等；不自动入会 |
| admin_revoke_grant | 全局排他 | 目标用户 | — | — | — | — | — | 视续期竞争而定 | 只撤销当前 grant，审计同提交 |
| admin_suspend / restore_membership | 全局排他 | 目标用户 | — | — | — | 成员 UPDATE | — | — | 精确恢复 pre_suspend_status；不得隐式 rejoin |
| admin_revoke_code / batch | 全局排他 | — | — | 产品 SHARE | — | — | 多码 UPDATE，ID 固定排序 | — | 撤码仅影响后续兑现；审计同事务 |
| admin_set_product_status | 全局排他 | — | — | 产品 UPDATE | — | — | — | — | 产品停用不批量覆盖成员状态 |
| admin_block / unblock_account | 全局排他 | 目标用户 | — | — | — | — | — | — | 当前资格与 M1 保底；阻止锁后新受保护写 |
| admin_grant / revoke_admin | 全局排他 | 目标用户 | — | — | — | — | — | — | 修改后有效管理员数至少 1 |
| check_access / get_my_products / admin_check_access | — | — | — | 产品一致性只读 | — | 成员一致性只读 | — | Grant 一致性只读 | 无副作用，仅 Pro 资格；不跨外部 HTTP 保持 DB 锁 |

**L0 性能候选**：将普通管理写改共享 L0、撤权/封禁改排他 L0 是尚未批准/验证的方案。当前发布基线**全部管理写均用排他 L0**；测试不过则保留较慢但安全边界清楚的版本。L1 的共享范围包括本人兑换、重新加入与作用于该用户的管理写，封禁锁后不得存在新获准写入。旧码停用与本人已经兑换的优先级按 API 规则执行，不能以此绕过 left/suspended 或 blocked。

**锁实施验证**：LCK-01～07 用真实双连接检查管理员互撤/封禁、同产品 Pro 续期、发码撤销核销、失败计数、幂等/UNKNOWN、锁超时和死锁；具体运行证据见当前测试记录，未运行项不得标 PASS。

### 2.1 锁键映射的尚未完成项

L0、L1、L7 的 advisory lock 编码必须在物理 DDL/RPC 实现前明确固定 namespace、类 ID、UUID 的编码/哈希算法、字节序、版本及稳定性。采用 PostgreSQL 双 int4 class_id 分域只能防**不同类**键空间冲突；同类 32-bit 哈希仍可能碰撞，须评估虚假串行化、等待和吞吐。没有实际证明前**不改现行 L0 全局排他为共享/排他混合锁**，也不得宣称哈希零碰撞。

## 3. 失败事务、重试与权限边界

- 兑换业务拒绝只在核销/授权成功写入之前判定，合法失败计数应由正常返回路径提交；未知 SQL、权限、审计故障应抛出并**整笔事务回滚**。不使用宽泛异常捕获把真实技术错误转换为业务失败。
- 只有码最终检查成功才创建缺失成员、join event、grant、redemption 并增加码次数；失败不能半提交。补充业务处理所需的 PL/pgSQL 子事务只能采用窄范围、明确回滚的实现并经测试，不作为默认机制。
- 同用户同码唯一、来源键唯一、actor 域 request_id、首次请求持久化参数校验共同保证重试安全。发码明文只在**首次创建响应**返回，查询、超时重放、审计与日志均不得恢复/保存明文。
- **B-01 设计已获批准，运行未修复**：RedeemCode(product_key, code) 在 L3 锁定**声明**产品并于 L5 校验其成员 left/suspended（同失败码与计数，**不读码**）；none/active 才在 L6 读真实码并核对产品归属。既有发行码引用的套餐权益已冻结，因此该操作**不需倒序补 L4**。旧单参 RedeemCode(code) 不得在迁移期继续可探测地读取码表，应撤销公开 EXECUTE 或仅固定返回升级指示。REV-B01 / 两连接锁测试通过前，不能称漏洞已运行修复。
- 普通成员或 Admin 凭证被封禁后，下一受保护可信事务应拒绝；既有外部 R2 短 URL、执行中任务和历史授权不保证即时跨系统撤销。

## 4. 强制实测

后续隔离环境需验证真实 JWT 与 RLS/GRANT/EXECUTE 负向用例、private 函数直接执行的安全性、M1～M5、两连接 LCK-01～07、未知码/已兑/left/suspended、审计故障回滚、码超兑、续期竞态、锁等待/P50/P95。首批 SQL/角色模拟的 35 项验证已通过，但本段列出的**可信 RPC、真实 JWT/MFA、双事务 LCK 与性能验证仍 NOT RUN**。

相关：[数据库访问隔离](./database-access-and-transactions.md) · [兑换约束](./entitlements-and-redemption-constraints.md) · [API 错误模型](../backend/api-contract-and-mvp-acceptance.md) · [当前待办与未验证项](../../Plans/TODO.md)。
