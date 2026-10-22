# AisenCore｜2026-10-22 审查整改：文档设计阶段闭环证据

> 状态：**DEC-01～06 ALL A APPROVED / DOCUMENT CONTRACT SYNCED / RUNTIME NOT RUN**。仅表示本次在 `main` 工作区**完成可独立开展的架构/计划文档优化**，不是 14 项业务缺陷已运行修复，也不是生产 READY。源基线 HEAD `f2d1f90dd8bd92d0cbae0f8ffc4f6119520e881b`。所有更改在本地尚未提交/推送。

## 1. 逐项事实、设计处理与后续关口

| ID | 本轮设计成果 | 文档状态 / 运行状态 / 后续门禁 |
| --- | --- | --- |
| **G-01** | F01 public invoker/private definer 权限、F02 L0～L8 锁序与逐 RPC 矩阵、F05 幂等/列级 SELECT 从阶段 Plan 内联回 database；Admin Resource/DataProvider 与 R2 永久边界也进入 architecture；主要规范源不再依赖临时 Plan 才可读懂 | **DESIGN CONVERGED**；权限 SQL 和客户端实装 NOT RUN |
| **G-02** | requirements §6/§11 与管理员领域统一：TOTP MVP 必做、有效会话低打扰、普通用户不强制、管理 RPC/RLS 需当前 aal2 | **DOC CONFLICT RESOLVED**；AUTH-P/aal1 安全实测 NOT RUN |
| **G-03** | 项目所有者批准 **DEC-02 A：Aisenlens 限定非敏感 JSON 经 Supabase Edge 校验并写 R2 final**；主架构/技术栈/文件数据明确该例外，避免未批准 Worker 幽灵依赖 | **ARCH DESIGN APPROVED**；真实 Edge/R2 尚未创建/验证 |
| **G-04** | 根目录新增 `.gitattributes`，统一 md/ts/json/sql/yaml 等 LF、bat/cmd CRLF、二进制标记；确认原初工作区没有报告所称大规模假 diff | **POLICY FILE PREPARED**；独立 `git add --renormalize`/分离提交未运行，不能宣称已完成仓库级行尾迁移 |
| **B-01** | 以成员状态×码状态×产品归属设计拒绝矩阵、失败限流、写副作用与新签名兼容方案，不虚构已证实的无限暴力枚举 | **DEC-01 A APPROVED**；REV-B01 与旧入口安全迁移实测仍阻断 |
| **B-02** | 长期锁合同补 L0～L8、全部核心 RPC 获取矩阵、优先回滚技术故障、有限子事务、隐含锁/命名空间/碰撞/双连接测试要求；保留原全局排他 L0 | **DESIGN CONVERGED**；实际 hash/命名空间物理版本与 LCK-01～07 仍 NOT RUN |
| **B-03** | Free 当前默认版本 vs 历史不可变 grant/code、时间 current/effective/lifetime、未来时段不提前生效、跨套餐不叠加模型已形成候选 | **DEC-04/05 A APPROVED**；权益 API/迁移与时段并发实测未执行 |
| **M-01** | requirements 当前事实、D0 历史定位、D1/D2/D3/D4/F01/F05/MVP 总计划已更新 U03/U05 与部分 U04～U11 的方向/参数区别；旧历史行仅代表当时快照 | **STATIC DESIGN SYNC**；真实 U 参数和运行验收仍按 TODO |
| **M-02** | 已保存当前 F05 idempotency、NULL/UTC、actor-scoped 来源键、不同参数冲突与敏感列安全投影要求；强类型参数比较、直授时段模式在候选中隔离 | **DEC-05 A APPROVED**；F05-C01～12 和强类型/时间/权限未运行 |
| **M-03** | 长期备份权限、staging/final、ready + 未过期 pending 配额、孤儿对象/单边成功恢复和无敏感字段白名单；详细故障注入矩阵已保存 | **DEC-02 EDGE ROUTE APPROVED**；U09/U10 具体值与 R2/DB 双端实测未运行 |
| **A-01** | 四类典型高保真签收、G0A/G0B/G3 的成本优化作为候选，但**未解除原 UI-G0 正式编码硬门槛** | **DEC-03 STAGES APPROVED**；G0A 四类真实画板/视觉签收仍未完成 |
| **A-02** | Admin 单页邮箱 N+1 与 SQL 只读 RPC/一次 Edge 批量聚合/投影候选、最小字段与降级、真实 auth.users 权限/索引要求清楚 | **DEC-06 SQL-FIRST APPROVED**；权限不可行按批准的 Edge 回退，性能/越权实测 NOT RUN |
| **A-03** | 长期 Admin DataProvider 合同：普通资源 create/update → 单个安全 RPC，危险命令使用自定义 Mutation；统一返回 id、缓存失效与秘密明文易失状态 | **ARCH DESIGN CONVERGED**；React-admin SDK/浏览器尚未实现，UI-G0 BLOCKED |
| **A-04** | 管理员两因素独立保管/恢复主体/官方 Auth MFA 首选流程/受控运维/撤销旧会话与演练关口写入管理员长期架构 | **SAFETY PROCEDURE DEFINED**；备用责任人/因素、演练 NOT RUN；生产前 P0 |
| **X-01** | API 唯一错误优先级与 HTTP 200+allowed=false、200+ok=false、401/403/409/429/503、失败允许副作用已合并 | **DESIGN CONVERGED**；redeem 双参数 DEC-01 已批准，实际旧入口下线/负向安全测试 NOT RUN |
| **X-02** | DB/R2 单侧成功、请求重放、清理失败、撤权 URL 时差、恢复/对账责任的故障矩阵与幂等边界已形成 | **DESIGN CONVERGED**；R2 SDK/故障注入 NOT RUN |
| **X-03** | S0 证据、实施方案、统一决策包、每项测试 ID、未跑场景和真实退出条件均有独立可审阅记录 | **STATIC VALIDATED**；测试设计不等于运行 PASS |
| **X-04** | DEC-01～06 的推荐/备选/收益/损失/业务影响、拒绝方案下保持旧合同、U03～U11 剩余参数合并为[统一决策包](./owner-batch-decisions.md) | **DEC-01～06 ALL A APPROVED / RUNTIME NOT RUN** |

额外 MCP-01 继续 DEFERRED，不纳入本轮 MVP；既定单人运营、Supabase Auth 与 React-admin 复用优先、用户 AI Key 留本地、无平台 AI 网关均不更改。

## 2. 实际静态验证证据

| 验证 | 实际观测 | 说明 |
| --- | --- | --- |
| 起始工作区 | `main`，HEAD f2d1f90；起始 `git status --short` 为空 | 当前工作区因本轮文档改动现为 dirty，不能把它误称他人污染 |
| 文档相对路径检查 | 全量 docs **63 个 Markdown 文件、829 个 Markdown 链接、705 个相对路径、缺失 0** | 本地 Python 仅读文本与文件存在性，**未证明每个 fragment 锚点、外部 HTTP 链接或页面渲染** |
| `git diff --check` | **PASS** | 存在 Windows 工作副本 CRLF→LF 的 Git 提示，未做独立 renormalize；该 PASS 仅表明当前被检查的跟踪差异没有空白错误 |
| `git check-attr` | md 文件 `text=set, eol=lf` | 新 .gitattributes 生效为属性规则；**不等于已有所有 blob 已独立规范化提交** |
| Markdown fragment 静态近似检查 | **49 条带 #anchor 的 Markdown 关联，未发现缺失标题锚点（近似算法）** | 以 GitHub 类似 heading slug 算法检测，仍非真实渲染器或浏览器证据 |
| 业务运行测试 | **NOT RUN** | 无数据库迁移、PostgREST、Supabase Auth、Edge/R2、浏览器 UI、P50/P95 或云成本测试 |

## 3. 必须保持的失败/回滚标准

- 管理员在现有 `aal1`、被撤权、全局 blocked 下不可执行管理 Data API/RPC；失去 TOTP 无后门。
- 技术故障不得包装成 `CheckAccess.allowed=false` 或 `RedeemCode.ok=false`；限流失败的允许记账不等于成员/grant/码次数可以半提交。
- Free 版本变化与续期改造不得回写已承诺的 plan/grant/code 历史，未到 starts_at 的授权不可提前产生能力。
- DB/R2 不是同事务，未 ready 对象不可下载；过期 pending 释放**逻辑额度**不等于 R2 物理对象已删。
- Admin 明文码只首次成功响应能出现，不能缓存、存日志或重放恢复；最后一名可用管理员必须有**真实**恢复演练，数据库人数检查不足。
- DEC-01～06 A 已批准改变**设计合同**；在代码/迁移与隔离负向测试正式实施前，旧 RPC/R2 路线不得被误认为已消除安全问题。尤其 UI-G0A **仍无真实视觉签收**，不授权 Admin 编码；U04～U11 真正未定的运营字段保持待落实。

## 4. 终止条件与下一阶段

文档设计与六项新架构**批准/同步阶段可收尾**，已记录[用户全 A 决策](./owner-batch-decisions.md)，但**主整改尚未 CLOSED / READY**。未来另获必要开发/隔离测试环境授权后，依 [总计划](./master-plan.md) 核验已批准的现行权威、做迁移兼容评审、运行数据库双连接/权限/幂等/备份 Auth/浏览器验收；对每一项上传真实命令、日志、用例通过/失败及回退记录。在此之前不存在生产发布许可。
