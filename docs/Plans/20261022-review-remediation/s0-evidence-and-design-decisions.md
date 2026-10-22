# S0｜基线、问题证据与设计优化台账

> **版本语义**：以下初始 DOC/RISK/GATE 分类与“DEC 未批准”用词仅是 **S0 原始审查时点快照**。2026-10-22 用户后续已明确批准 DEC-01～06 全部推荐 A，并同步长期 [spec](../../spec/requirements.md)/[architecture](../../architecture/README.md)；最终状态与尚待实测门禁以[统一决策记录](./owner-batch-decisions.md)、[整改总计划](./master-plan.md)为准。初始工作区事实及未跑测试仍有效。

> **DOC REVIEW IN PROGRESS / RUNTIME NOT RUN** · 2026-10-22。审查基线为 AisenCore main / f2d1f90dd8bd92d0cbae0f8ffc4f6119520e881b；起始 git status --short 为空；仓库根目录未检出 .gitattributes。该证据仅适用于本次开始时的工作区，后续实施需重新取证。没有访问 Supabase/PostgreSQL、Cloudflare 或生产接口。

## 分类与当前结论

**DOC** = 当前文档可复核的冲突/缺漏；**RISK** = 静态设计推定的隐患，未确认为运行缺陷；**PREVENTIVE** = 预防性工程项；**GATE** = 必须得到独立批准或演练的准入条件。

| ID | 现状证据 / 类别 | 设计出口与阻塞 |
| --- | --- | --- |
| G-01 | DOC：数据库访问文档反向依赖 F01/F02 临时 Plan 才可找到详细规范 | [长期 RPC/锁合同](../../architecture/database/rpc-security-and-locking-contract.md)已创建；其它引用与语义去重仍需全面静态检查 |
| G-02 | DOC：requirements §6 管理员 MFA 已确认，§11 曾称 MFA 冲突未关闭 | [requirements](../../spec/requirements.md) 已修正文档；真实 AUTH 测试 NOT RUN |
| G-03 | RISK：F03/D2 可信 R2 验证组件未被主架构收编 | DEC-02 未批准，不能把 Edge/Worker 候选直接写成现行架构 |
| G-04 | PREVENTIVE：起始版本没有 .gitattributes，但不存在该次检出的全文件伪 diff 证据 | 规范化应独立更改、检查；不混入本轮架构正文 |
| B-01 | RISK：RedeemCode(code) 从 code 定位产品再判 left/suspended 的先后次序可能泄露码有效性 | DEC-01 与 REV-B01-01～08；既有 128-bit 高熵及失败限流不能被误写为“完全失效” |
| B-02 | RISK：全局 L0 排他有吞吐成本，锁键编码和隐含 FK/唯一键需要并发验证 | 保留安全版本 L0；在[长期锁合同](../../architecture/database/rpc-security-and-locking-contract.md)约束；LCK-01～07 未运行 |
| B-03 | RISK：Free 冻结/版本演化与累计续期展示缺少明确接口语义 | DEC-04，历史 grant/code 不能默改 |
| M-01 | DOC：D0/D1/D2/D3/F01/F05 有 U03～U11 旧状态和历史补丁 | 以[现行需求](../../spec/requirements.md)、[U 决议](../aisencore-mvp/aisencore-u03-u11-user-decisions-2026-10-22.md)为准逐一对齐，未全部完成 |
| M-02 | RISK：多余指纹/隐藏列可能影响 select=* 与重复请求语义 | DEC-05；不能无验证删除幂等元数据 |
| M-03 | RISK：备份 pending 过期预留及 R2/DB 单侧成功需要逻辑释放和实际对账 | DEC-02、故障注入 REV-M03-01～08，未运行 |
| A-01 | GATE：UI-G0 是经确认的正式 UI 编码前视觉门禁 | DEC-03 未批，不解除 BLOCKED |
| A-02 | RISK：Auth Admin 按页补成员邮箱可能形成 N+1 | DEC-06 比较有限 SQL RPC、可信 Edge/身份投影，先实测权限与成本 |
| A-03 | RISK：命令适配器与 React-admin 标准 DataProvider 表单/缓存映射未统一 | 标准 CRUD + 特殊命令分流的架构设计待补；编码仍受 UI-G0 |
| A-04 | GATE：名册至少一名管理员不保证拥有可用 MFA/会话 | [管理员恢复控制](../../architecture/domains/platform-admin-and-account-lifecycle.md)已编入；实际责任人与演练未完成，公开生产 P0 |
| X-01 | DOC/RISK：各业务 API/Plan 的错误优先级边界尚未归一；兑换侧信道例外尤其重要 | [API 契约](../../architecture/backend/api-contract-and-mvp-acceptance.md)做错误矩阵，DEC-01 前标明未闭环 |
| X-02 | RISK：备份/身份的跨系统未知结果、重试与孤儿清理尚未故障注入 | 与 M-03 同步形成故障恢复矩阵，NOT RUN |
| X-03 | GATE：测试说明不等于实际验证 | D4 I/R/A、LCK、F05-C、V、AUTH-P、D3-UI-X、REV 全部未运行 |
| X-04 | GATE：六项设计选择未视为用户已批准 | [DEC-01～06 历史候选与现行批准](./owner-batch-decisions.md)保持 PENDING |

## 施工顺序与停止线

1. **先修不需新增政策的权威冲突**：G-02 当前 MFA 结论、F01/F02 安全合同、A-04 恢复控制、X-01 已定错误优先级；同步 M-01 的过期状态引用。
2. **不替用户选择的改造**：RedeemCode(product_key, code) 新签名、L0 共享锁、R2 Edge 小 JSON 上传、Free 默认版本指针、请求幂等元数据删改、Admin SQL 身份查询、UI-G0 分级，均在 DEC 门禁之前保持为方案。
3. **运行前重新核验**：工作树、文件差异与 SHA、数据库角色和 RLS、独立双连接事务、SDK/Auth/Edge/R2 版本、前端真实浏览器与生产恢复责任。测试如未执行必须标记 NOT RUN。

**本轮已运行的仅为文档读取、静态核对与本地 Git 基线观察**；没有编译/SQL/云端/性能测试，更无业务代码、部署或发布结果。证据入口：[原审查](../../review/20261022.md)、[整改总计划](./master-plan.md)、[架构总索引](../../architecture/README.md)、[当前 TODO](../TODO.md)。
