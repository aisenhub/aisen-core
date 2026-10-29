# Admin 管理概览：三张双指标统计卡（2026-10-29）

## 已确认 UI 合同

移除原「产品／成员关系／Pro 授权／发行批次／待筛选反馈」5 张单指标卡，替换为 3 张双指标卡：

| 卡片 | 第一指标 | 第二指标 | 入口 |
|---|---|---|---|
| 用户 | 当前范围正常用户数 | 本月新增用户数 | 用户中心 `/users` |
| 订阅 | 当前有效 Pro 会员数 | **本月新增 Pro 会员** | 权益／授权 `/grants` |
| 反馈 | 收件箱（历史称“草稿箱”）+处理工作台总数 | 收件箱中的新反馈数 | `/feedback` |

顶部产品选择器为唯一工作范围选择。全平台去重；单产品按产品 ID 过滤。统计异常或权限不足显示“—”并明确报错，不得伪称 0。本月以 **Asia/Shanghai (UTC+8)** 的自然月边界定义，数据库单次快照计算。

## 统计口径

- **正常用户**：全局为没有平台级封禁的 Auth 注册账号（含尚无成员关系的账号）；单产品为该产品当前 `active` 成员且未被平台级封禁的不同账号。
- **本月新增用户**：全平台为 `auth.users.created_at` 在本月的不同账号；单产品为该产品 `product_memberships.joined_at` 在本月的不同账号，包括本月加入后退出的历史成员。不是第一页记录数。
- **当前 Pro 会员**：具有活动产品和活动成员关系、没有全局封禁，并且 `private.pro_credit_summary(...)->>'pro_active'` 为 true 的**不同用户数**。全平台跨产品按用户 UUID 去重，不能用历史 Grant 行数或计划中的未来发放数量替代。
- **本月新增 Pro 会员**：本统计范围内，一个账号**首次真正取得 Pro 资格**的时间在本月，按不同用户数统计；由 `entitlement_grants` 历史资格与 `GREATEST(created_at,starts_at)` 判定，排除尚未生效的未来授予及在生效前被撤销的记录。全平台以该用户在所有产品第一次获得 Pro 为准；单产品以该产品第一次获得 Pro 为准。续期与重复授权不计入；本月新增后到期或退出的，仍属于该月历史新增。此月度获取指标不等同于当前有效 Pro 会员存量。
- **待处理反馈数**：当前 `queue_state IN ('inbox','workbench')` 的反馈数。
- **新反馈数**：当前 `queue_state='inbox'` 的反馈数。

## 实施与验证

- 源码：`apps/admin/src/Dashboard.tsx`、`apps/admin/src/data/dataProvider.ts`。
- 基础只读受保护 RPC：`supabase/migrations/20261029190000_admin_dashboard_metrics.sql`；需求修正追加迁移 `supabase/migrations/20261029191000_admin_dashboard_new_pro_month.sql`，把原 `new_feedback_month` 指标改为 `new_pro_month`；保留已安装原迁移不更改历史。外层 Invoker/内层受限 NOLOGIN 函数依旧实时检验 AAL2、平台管理员有效且未封禁；不向浏览器提供 Auth 表或信用账本读权限。
- 本地 SQL 先在 BEGIN/ROLLBACK 中验证：真实测试管理员 AAL2 分别查询全局与单产品有不同统计；AAL1 被拒绝 PT403；不存在产品拒绝 PT422。完成验证后，仅在本地 Supabase **以单次 SQL 事务持久安装了只读 RPC**，并登记 `20261029190000` 迁移版本；未修改任何用户、成员、授权或反馈业务记录。
- 最终证据：`npm run build` PASS、`npm run lint` 0 错误／0 警告、`node scripts/test-admin-dashboard-metrics.mjs` 静态合同 PASS、圆角回归与 `git diff --check` PASS。安装后的数据库以真实 AAL2 管理员身份再次执行全局/单产品只读不变量检查 PASS。
- **发布门禁**：两条 Dashboard RPC 迁移均仅在本地安装，远程/生产未部署。FB-V4 永久删除迁移 `20261029210000` 已在 AisenCore 本地数据库安装（迁移前后反馈/附件/事件行数不变），其新视图自动排除删除中的行；尚未迁往远端 Supabase。真实 AAL2 浏览器中的 3 张卡、跨产品切换、错误态及 320/390/768/1440px 响应式签收仍开放。未提交、未推送、未部署。
