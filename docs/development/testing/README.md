# 测试规范

> 状态：建立开发测试专题入口，**尚未选定测试框架与测试流程**。

## 当前可确定的质量要求

- **业务正确性**：公共用户身份、不同产品的权益边界、兑换码开通会员、后期订单权益同步必须有可靠验证方式。
- **关键安全场景**：普通用户不得执行 Admin 高权限操作；他人的兑换码/权益/文件不能无授权访问；不能仅依赖浏览器 UI 控制权限。
- **重复/并发与失败恢复**：重点覆盖重复兑换、并发争抢码、重复或漏发支付通知、支付状态与权益状态不一致。
- **客户端权益**：首版在线 Pro 在启动时校验，并按具体产品关键操作复核；离线免费功能不受无关错误牵连。
- **Admin UI-G0 编码前硬门槛与 UI-G3 运行质量**：先取得 [全局设计系统/视觉基线](../../architecture/applications/admin-ui-design-system.md)四类高保真页面及统一 Token、实际用户签收和版号，未获批准不得启动正式 Admin 前端编码；编码后还须对照视觉基准，在真实浏览器检查排版、字号、布局、表单/表格/弹窗状态、1440/1280/820/375/320 宽度、键盘/对比度与资源权限，不能以文字规范或静态测试充当截图/可用性已验收。
- **Admin 测试时的规则与页面映射**：使用[开发设计验证矩阵](../frontend/admin-design-verification.md)和[结构化规则目录](../frontend/admin-design-rules.md)挑选适用的中文混排、错误恢复、列表/详情返回、MFA/发码等场景；62 条规则的建议 `browser-test/manual-audit` **不是已经执行的自动化检查**，也不会替代 D3-UI-X01～X18、UI-G0-G01～G12 的既有 NOT RUN 状态。

## 待实际实施时补充

选定与代码栈相符的测试框架、测试分层、用例模板、测试数据管理、持续集成、测试覆盖范围、上线前验收。**此处不提前确定 Vitest、Playwright 或其它具体工具**。

相关需求：[当前统一需求](../../spec/requirements.md)；相关架构：[计费与权益专项](../../architecture/domains/billing-and-entitlements.md)。

## BAAS-Q 安全负向用例与条件触发（来自已完成的 2026-10-22 技术评审）

**沿用原 BAAS-Q01～Q10 用例号，全部 NOT RUN。** Q01～Q03 消费型余额/积分业务**只有未来真的引入后才启用**，不能据此给 MVP 新建余额表、通用消费 RPC。Q04～Q10 对现有 RLS/GRANT/JWT/备份配额与请求量性能的适用部分在真实实现时验证。禁止从匿名前端传任意成本；任何受保护扣减如引入必须正数、可信 actor/属主、原子幂等/并发、统一锁序及审计同事务。拒绝复制 public SECURITY DEFINER 且允许负 cost_amount 的样例；动态 Pro/Admin/blocked 不靠可能陈旧的 JWT 自定义 claim 作权威；不为减少网络请求就默认增加 Redis、独立 API 服务或 AI 代理。\n\n### BAAS-Q01～Q10 场景矩阵

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
