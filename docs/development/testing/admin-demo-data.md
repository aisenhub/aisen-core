# Admin 本地数据与浏览器验收

> **当前基线（2026-11-02）**：上线测试前本地清理已授权执行，仅保留 AisenLens 产品和原管理员/MFA/会话。旧 demo 的产品/用户/成员/授权数量不再是当前数据库事实。清理与审查证据见[后端复核](../../reviews/2026-11-02-aisencore-backend-supabase-audit.md)，未完成事项见[唯一 TODO](../../Plans/TODO.md)。

## 启动与测试数据

在仓库根目录按[根 README](../../../README.md)启动本地 Supabase 和 Admin。已有管理员不需要重新 bootstrap 或重绑 MFA；不要把本地固定开发凭据用于公网。

当前联合开发/上线测试准备库不再执行 `seed:admin-demo`。保留的旧造数脚本不构成现行验收路径，未在本轮重跑或证明其符合全部新信用/单次码合同。业务数据通过 AisenLens 实际操作产生；数据库边界使用独立事务夹具并 ROLLBACK。浏览器 QA 只能删除自身精确创建的用户/产品/业务记录，必须保全基线数据。

空业务基线检查：

```powershell
python scripts/check-local-admin-qa-cleanliness.py
```

该检查要求 Auth/Admin/AisenLens 各1，其他 public 业务表为0；开始正常客户端测试后出现业务数据是预期变化，不是自动清除授权。

## 清理与恢复

[清理脚本](../../../scripts/reset-local-joint-dev-data.py)只允许已核对的本地容器 `supabase_db_Aisencore` / `55322`，当前迁移版本必须与仓库一致。

```powershell
python scripts/reset-local-joint-dev-data.py
python scripts/reset-local-joint-dev-data.py --apply --backup E:\Projects\Aisencore-local-backups\已验证归档.dump
```

默认执行事务后 ROLLBACK；apply 会删除非管理员身份、非 AisenLens 产品及全部旧业务数据，必须有当前任务的数据删除授权和仓库外完整备份。遇附件引用先拒绝，需另审对象清理；不使用 db reset，不删除框架 schema/迁移。

脚本在同一事务中对比保留的管理员整行、身份/MFA/会话/刷新链、产品整行、迁移记录；管理员密码哈希与 AisenLens UUID 不变。公开开发密码、Token、MFA Secret 和备份内容不得写入日志或 Git。

## 浏览器与数据库验收

```powershell
node scripts/test-d3-authenticated-pages.mjs
python scripts/test-f07-local-sql-rollback.py
pnpm typecheck
pnpm lint
pnpm build
```

浏览器脚本的现行接入基线为 AisenLens，不再要求 aisenhub 产品存在；运行前后保全非 QA 对象。Lens真实Chrome/Edge/隔离S3已按新基线复测，Admin及完整准出范围以修复计划证据为准。多产品隔离仍使用本次 QA 自建产品测试，不能把“只保留一个集成产品”解释成删掉多产品安全测试。

最新修复后的16组SQL为543/543；004已补信用账户/条目夹具，权限断言不变。原516/517是修复前证据。真实JWT、MFA、Edge、私有对象、无障碍/视觉和线上验证分别验收，不用静态/SQL模拟声明代替。
