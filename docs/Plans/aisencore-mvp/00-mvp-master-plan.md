# AisenCore MVP｜正式开发总计划

> 状态：**ACTIVE · 当前 D1**；更新 2026-10-24。本文件是**唯一 MVP 阶段计划入口**，不定义第二套业务规则。权威优先级：[当前需求](../../spec/requirements.md) → [长期架构](../../architecture/README.md) → [AGENTS](../../../AGENTS.md) → 本执行计划；代码/迁移与真实测试决定实施状态。当前剩余任务见[TODO](../TODO.md)。

## 1. 当前事实、目标与阶段边界

- **已实现/验证**：本地 PostgreSQL 17.11 已应用[首份六表/RLS 迁移](../../../supabase/migrations/20261024011528_core_foundation.sql)；[001](../../../supabase/tests/database/001_core_foundation.test.sql) 25 项与 [002](../../../supabase/tests/database/002_membership_rls.test.sql) 10 项 pgTAP，共 **35 PASS / 0 FAIL**，第二组使用 **SQL 模拟 JWT 声明**。
- **尚未验证**：Pro/兑换表、可信 RPC 与 LCK 并发、完整本地 GoTrue/PostgREST、签名 JWT/`aal2`、真实 React-admin、AisenLens Edge/R2 与生产部署。不得从局部 35 项 PASS 推断整个 D1 的百分比，更不得将 Mock/原型当 E2E。
- **MVP 目标**：可信 Core 身份/成员/Pro 资格、兑换与管理；统一 Auth 与受保护 HTTP API；独立 Admin；首发 AisenLens 的本地优先准入与非敏感小型私有配置备份；分环境验收与明确的发布审批。
- **不做**：公共 `plans`、SaaS 功能/额度配置、`check_access(...,capability)`、第二套 JWT/Node API、AI 代理、Redis/通用插件、未获批准的 SaaS 反馈服务端。

## 2. 阶段关系：实现可以适度并行，安全发布不能越级

| 阶段 | 唯一详细计划 | 可以开始的条件 | 阶段完成/发布门禁 |
| --- | --- | --- | --- |
| **D1 数据库/RPC** | [D1](./d1-database-and-trusted-rpc.md) | 本地隔离 PG 和首迁移/35 测试可复现 | 目标结构/RLS/GRANT/RPC、pgTAP 正反例与 LCK-01～07 双连接断言 PASS；SQL 失败原子回滚/限流持久化 |
| **D2 Auth/API/MFA** | [D2](./d2-auth-public-api-and-mfa.md) | 可并行准备完整本地 Auth；受保护接口的联调要等各自 D1 安全合同稳定 | 完整 GoTrue JWT、真实 HTTP、`aal1/aal2` 管理门禁、Auth 会话与用户查询正负例 PASS |
| **D3 React-admin** | [D3](./d3-admin-console.md) | 前端脚手架、Theme 可在 D2 后端联调期间准备；正式写操作必须等待对应后端安全验证 | `apps/admin/` 完整工程、构建/类型检查、浏览器 E2E、首响明文/UNKNOWN、无障碍与所有者 UI 评审 PASS |
| **S1 AisenLens/R2** | [S1](./s1-aisenlens-r2-backup.md) | 相关 Core Pro/JWT API 已真实验证；U09/U10 确认真实备份白名单/额度/留存；U11 决定断网新 Pro 任务规则 | 独立 Edge 元数据/R2 故障对账、属主 ACL 和真实 R2 测试；AisenLens 客户端由其仓库独立验收 |
| **D4 发布准入** | [D4](./d4-release-acceptance.md) | 对声明的发布范围，其相关阶段均已验收；可在开发过程中逐项积累证据 | 全链路 I/R/REV、恢复/注销、性能和生产配置核查，发布审批独立于测试 PASS |

**发布范围明确化**：若首发承诺 AisenLens 私有备份，则 S1 **不是可跳过项目**；若仅申请 Core + Admin 的阶段性部署，需要向所有者明确书面说明不包含 AisenLens。所有者未明确批准前不使用生产/云环境、不推送 Git、不创建云资源。

## 3. 执行子里程碑（每项需独立证据）

1. **D1-M1**：补齐 Pro Grant、兑换批次/码、核销和最小防枚举限流表，执行 CHECK/RLS/GRANT/函数访问负向测试；候选运营数值不得写死进 DDL。
2. **D1-M2/M3**：按 L0～L8 唯一锁序完成 `public SECURITY INVOKER` + `private SECURITY DEFINER`、成员生命周期、Pro 续期、兑换、直授/发码/撤销、幂等/UNKNOWN；显式校验私有函数直调与隐含行锁。
3. **D1-M4**：在可重建的隔离数据库运行结构/权限 pgTAP 和独立连接 LCK-01～07；记录环境、连接数、锁等待、失败回滚与实际证据。
4. **D2-M1～M3**：按真实服务签名方式验证 GoTrue、邮箱、会话、JWT/HTTP 错误映射、管理员 `aal2`、撤权、DEC-06 受限用户查询；只有 SQL 安全和性能不满足才采用受保护 Edge 条件回退。
5. **D3-M1～M4**：仅在 `apps/admin/` 初始化 pnpm≥12 workspace + Vite/React-admin/MUI/TypeScript，提交真实 `pnpm-lock.yaml`；逐 Resource 完成 UI、敏感发码与 UNKNOWN；按真实浏览器用例验收。
6. **S1-M1～M3**：按[项目目录规范](../../architecture/infrastructure/repository-structure.md)建立 AisenLens 专属元数据/可信 RPC/`supabase/functions/aisenlens-config-backup/`；与产品独立客户端协作，记录 Mock 与真实 R2 分开的故障恢复证据。
7. **D4-M1～M3**：整合全阶段测试、账号删除/留存矩阵、MFA 失设备/旧 JWT 应急撤权、数据库恢复、请求次数和性能阈值，形成范围明确的发布准入报告。

## 4. 需由项目所有者确定的参数

| 进入阶段前 | 待确认内容 | 当前可做的工作 |
| --- | --- | --- |
| D1 发码生产规则 / D3 操作界面 | 单批数量上限、码自身到期、永久码发行权限、真实管理员/备用 MFA 管理责任 | 可写最小正确数据库约束与合成安全用例；**100/批等候选值不是最终运营合同** |
| S1 实际私有备份 | U09 的版本化字段白名单、JSON 字节数及配额；U10 的数量/保留时间 | 可写备份状态机与隔离 Mock 测试，不向真实用户开放存储；**256 KiB、10 版是候选** |
| AisenLens 本地 Pro 接入 | U11 的断网能否启动新纯本地 Pro 任务和缓存新鲜度 | 可落实启动/关键操作按需校验与 single-flight；**15 分钟是候选**，云端操作始终复核 |
| D4 公开运营 | 生产域名/回调、SMTP/发件身份、反滥用、人工账号注销渠道/合法留存、密钥/备份/恢复责任 | 可准备本地演练与配置清单，不连接生产 |

## 5. 交付规则、验证记录与计划生命周期

- 每次只派发**一个独立可验收子任务**。AI 开工前读取 `AGENTS.md`、目标阶段计划、真实代码/迁移、相关权威架构和当前 Git 状态。调度模板在[阶段 Agent 指令](../../prompt/mvp-stage-dispatch.md)。
- 每次完成代码/迁移时同步更新所属阶段**验证记录**、[TODO](../TODO.md)、实际受影响的架构与 README；禁止把候选设计当作执行结果。阶段计划必须区分 `SQL ROLE PASS`、`JWT HTTP PASS`、`BROWSER PASS`、`MOCK R2 PASS`、`REAL R2 PASS`、`NOT RUN`。
- `supabase migration new` 创建新文件，不编造时间戳、不重排已经应用的迁移；重置数据库只针对已经检查过的本地隔离实例。不得在规划期新建空 `apps/`、`packages/` 或 Node 服务。
- 按`AGENTS.md` 文档治理规则：阶段完成后将仍有长期价值的安全契约、测试与剩余事项迁入当前权威文件，再移除完成计划与交接过程；Git 历史提供已跟踪文件的追溯。
- **默认不执行** Git 提交、推送、Cloudflare/Supabase/R2 生产变更，除非所有者在当前任务明确要求。计划本身不构成外部操作授权。
