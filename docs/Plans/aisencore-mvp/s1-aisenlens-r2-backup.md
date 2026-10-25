# 阶段 S1 执行计划（正交专项）：AisenLens 本地优先接入与 Edge → R2 小 JSON 安全备份

- **阶段代号**：`PHASE-S1`（可在 `PHASE-D2` 完成后与 `PHASE-D3` 并行推进，或在 `PHASE-D3` 后执行）
- **新的三阶段归属（以所有者 2026-10-24 规则为准）**：S1 是**第二阶段与 AisenLens 本地真实业务数据联调时同步实施的技术专项**，不得为了便于施工跳过**第一阶段 Admin 完整视觉/业务/无障碍/性能签收**。第二阶段同步完善 AisenCore 后端和 AisenLens 对应前端/客户端，以本地真实操作数据而非 `seed:admin-demo` 作为验收依据；S1 的真实云 R2/已部署 AisenLens 功能端到端准出属于第三阶段。旧条目中的“可与 D3 并行”仅指技术准备，**不授权提前进入第二阶段正式验收**。参考 [三阶段交付总则](./three-stage-delivery-gates.md)。
- **前置依赖**：相关 Core 资格 RPC 与真实 JWT/HTTP 安全验证已通过；实际备份字段、限额、保留期由所有者按 U09/U10 决定；U11 在产品客户端进入新本地 Pro 任务时决策。隔离演示可使用明确标记的模拟数值但不能发布。
- **权威依据**：
  - [统一需求 §4, §8, §9（DEC-02 已批准 A）](../../spec/requirements.md)
  - [产品业务数据与文件存储专项架构（G-03 / M-03 / X-02）](../../architecture/database/product-data-and-files.md)
  - [本地优先产品专项架构](../../architecture/applications/local-first.md)
  - [轻量会员认证边界（DEC-04）](../../architecture/domains/membership-qualification-boundary.md)
  - [公共 API 契约与 MVP 验收（REV-DEC02-01~08）](../../architecture/backend/api-contract-and-mvp-acceptance.md)

---

## 1. 阶段边界声明（Scope & Hard Boundaries）

### 1.1 准入条件（Entry Gate）
- 阶段 D1/D2 的 `ensure_membership`、`check_access` 与 GoTrue Auth 已在本地验证通过。
- **参数门禁（U09/U10/U11）**：若所有者尚未冻结最终生产数值，对 `MAX_BACKUP_BYTES`、`MAX_VERSIONS_PER_USER`、`PRO_CACHE_TTL_MS`、JSON 字段白名单，在真实服务发布前必须取得业务决定；隔离原型可使用集中且标注为待决的测试配置，不把 256 KiB/10 版/15 分钟写入持久化规则，并在文档中明确标注“候选配置，待所有者最终冻结”。

### 1.2 本阶段必须完成的交付范围（In-Scope）
1. **AisenLens 备份元数据与配额原子预留层（PostgreSQL）**：
   - 建立归属于 AisenLens 存储职责的备份元数据表与配额预留表（不污染 AisenCore 公共 `products` 或 `entitlement_grants` 表结构）。
   - 实现单事务受保护 RPC：创建/幂等查询 `pending` 备份预留（原子核算 `已占用配额 = ready 真实字节 + 未过期 pending 预留字节`）、确认提交 `ready`、标记 `failed` / `deleting` / `deleted`、以及查询过期孤儿记录。
2. **受保护 Supabase Edge Function（`aisenlens-config-backup`）**：
   - **上传路径（DEC-02 A）**：接收用户 JWT 与非敏感配置 JSON → 验证 JWT、调用 Core `check_access('aisenlens')` 确认当前 `allowed = true` 且 `pro_active = true` → 严格校验 JSON 字节大小、UTF-8 编码、白名单 Schema（主动拦截并拒绝任何包含 `video`, `timeline`, `project`, `ai_result`, `api_key`, `token`, `secret` 等敏感/禁止字段的 payload）→ 计算 SHA-256 → 调用 DB RPC 原子预留 `pending`（支持同 `(user_id, request_id)` 幂等重放）→ 使用服务端受限 R2 凭据执行**唯一 final key 条件创建（`If-None-Match: "*"`，严禁覆盖已有对象）** → 再次核验预留后调用 DB RPC 提交 `ready`。
   - **下载与恢复路径**：每次恢复/下载请求实时验证 JWT 与准入权限 → 签发短 TTL 预签名 R2 GET URL（或受控读取） → 客户端实现“手动选择历史版本 → 预览分类差异（Diff） → 用户确认后仅替换所选配置类别（局部失败可回滚）”。
   - **跨系统故障补偿与孤儿对账**：处理“R2 写入成功但 DB 提交 `ready` 失败”、“pending 超时未完成”、“删除时 R2/DB 单侧失败”的对账与隔离清理逻辑。
3. **AisenLens 客户端认证与低请求量 Pro 校验对接合同（跨仓库）**：
   - 匿名本地 Free 模式：零 Auth/RPC 请求，断网 100% 可用。
   - 在线 Pro 模式：启动时异步校验 `check_access('aisenlens')`（不阻塞本地 Free 界面启动），关键 Pro 操作前按需复核，同账号同产品并发请求 `single-flight` 合并去重，无后台固定 15 分钟轮询定时器。

### 1.3 严禁越界行为（Hard Out-of-Scope）
- **严禁**将 AisenLens 的备份配额、导出限制或功能开关写回 AisenCore 的 `products`、`entitlement_grants` 或新建 `plans` 表。
- **严禁**允许客户端直接获取 R2 `final` 路径的长期写凭据，或将“Edge 代理上传 JSON”的例外扩大到视频、切片、项目工程文件或 AI 分析输入/输出。
- **严禁**建设第三方 AI 模型代理网关（客户端必须使用用户本地自备的 AI API Key 直连第三方模型服务）。
- **严禁**建设公开分享链接、配置广场或模板市场（私人备份与公开分享完全隔离）。

---

## 2. 详细技术设计与实施子任务（Milestones & Tasks）

### Milestone S1-M1：备份元数据表与配额预留受保护 RPC

使用 Supabase CLI `pnpm dlx supabase migration new aisenlens_backup_metadata` 生成迁移时间戳；仅在 S1 开始实施时按需创建，可置于独立 schema `aisenlens` 或带明确前缀的受控表，遵循相同的 RLS/GRANT 最小权限准则）：

1. **表结构设计**：
   - `aisenlens_backup_versions`：
     - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
     - `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT`
     - `request_id text NOT NULL`
     - `r2_object_key text NOT NULL UNIQUE`（格式如 `aisenlens/backups/<user_id>/<version_uuid>.json`）
     - `status text NOT NULL CHECK (status IN ('pending', 'ready', 'failed', 'deleting', 'deleted'))`
     - `byte_size integer NOT NULL CHECK (byte_size > 0)`；技术安全上限由受保护 RPC 与 Edge 的请求体限制检查，业务上限等待 U09 定稿，不能硬编码候选 262144
     - `content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$')`
     - `categories text[] NOT NULL`（如 `ARRAY['settings', 'templates']`）
     - `schema_version integer NOT NULL DEFAULT 1`
     - `reservation_expires_at timestamptz`（仅 `pending` 预留过期），另设 `retention_expires_at timestamptz`（`ready` 备份保留，U10 决定）；不能用一个 `expires_at` 混淆两类时效
     - `created_at timestamptz NOT NULL DEFAULT transaction_timestamp()`
     - `ready_at timestamptz`
     - `deleted_at timestamptz`
     - `UNIQUE (user_id, request_id)`
2. **原子配额预留与状态流转 RPC**：
   - `reserve_aisenlens_backup(...)`：获取用户级备份事务锁 → 复核 `check_access('aisenlens')` 为 `allowed=true AND pro_active=true` → 检查 `(user_id, request_id)` 幂等（若已 `ready`，直接返回已有摘要；若同键但 `byte_size` / `content_sha256` 不同，抛 409 `STATE_CONFLICT`）→ 计算当前有效占用量 `SUM(byte_size) WHERE status = 'ready' OR (status = 'pending' AND reservation_expires_at > transaction_timestamp())` 及有效版本数 → 若超配额则拒绝，否则插入 `pending` 行并返回唯一 `r2_object_key`。
   - `finalize_aisenlens_backup(p_version_id uuid, p_etag text)`：再次复核当前用户未被 `blocked` 且成员未 `suspended` → 将 `pending` 更新为 `ready`（若 `pending` 已超时或被标记 `failed`，返回冲突以便 Edge 触发孤儿清理）。

---

### Milestone S1-M2：受保护 Edge Function 与 R2 条件写 / 对账机制

实现 `supabase/functions/aisenlens-config-backup/index.ts`，与[仓库目录规范](../../architecture/infrastructure/repository-structure.md)保持一致：

1. **严格输入与白名单 Schema 校验器**：
   - 检查 `Content-Length` 与实际读取字节流不超过上限（拒绝超大 body 防内存耗尽）。
   - 解析 JSON，严格使用所有者确认的版本化 JSON Schema 和全层字段白名单，验证嵌套类型/路径/长度/键名，拒绝所有未授权键；疑似秘密关键词检查仅为补充，不能替代确定性的 Schema 验证。
2. **R2 唯一 Final 条件创建与跨系统故障恢复**：
   - 调用 R2 S3 兼容 `PutObjectCommand`，显式携带 `IfNoneMatch: "*"`（防止任何覆写已有 `ready` 对象的可能）。
   - **故障分支 1（R2 Put 失败）**：调用 DB RPC 将 `pending` 标记为 `failed`，立即释放配额预留，返回 503。
   - **故障分支 2（R2 Put 成功，但 `finalize_aisenlens_backup` DB 调用失败/超时）**：绝不向客户端返回成功或暴露该孤儿对象下载权限；Edge 尝试立即删除该 R2 对象，若删除仍失败则保留 DB `pending`/`failed` 记录供后台对账任务（Reconciler）按 `r2_object_key` 清理。
   - **故障分支 3（DB `ready` 已提交，但客户端因网络断开未收到 HTTP 响应）**：客户端以相同 `request_id` 重试时，Edge 在第一步 `reserve_aisenlens_backup` 即识别出已处于 `ready` 且哈希一致，直接幂等返回成功摘要，不二次写 R2、不双倍扣减配额。

---

### Milestone S1-M3：客户端接入与故障注入测试（REV-DEC02-01 ~ 08）

编写自动化集成与故障注入测试脚本 `scripts/test-s1-aisenlens-config-backup.mjs`（Mock/MinIO 仅作为协议与故障注入证据，R2 条件创建需在获授权的真实测试桶单独验证；未经明确要求不创建或连接云资源）：

- 验证 `REV-DEC02-01`：上传合法白名单小 JSON 成功，超体积、非法 schema、夹带 `api_key` / 视频数据 100% 拒绝。
- 验证 `REV-DEC02-02`：无 JWT、`blocked` 用户、`left/suspended` 成员、无有效 Pro Grant 用户尝试上传 100% 拒绝且不写入 R2。
- 验证 `REV-DEC02-03`：模拟尝试覆盖同一 `r2_object_key`，验证条件写 `If-None-Match: "*"` 拒绝覆盖。
- 验证 `REV-DEC02-04`：模拟客户端预留 `pending` 后断网，验证过期后逻辑配额自动释放，新上传不被永久锁死。
- 验证 `REV-DEC02-05`：注入“R2 写入成功、DB finalize 失败”故障，验证孤儿对象不可被列举或下载，且对账器可清理。
- 验证 `REV-DEC02-06`：注入“DB ready 成功、HTTP 响应丢失”，验证同 `request_id` 重试幂等返回原对象，异参返回 `409 STATE_CONFLICT`。
- 验证 `REV-DEC02-07`：验证手动恢复流程（列举 `ready` 版本 → 获取短期下载签名 → 预览分类 Diff → 仅替换勾选的配置类别）。
- 验证 `REV-DEC02-08`：验证匿名本地 Free 零网络请求运行，以及 Pro single-flight 并发复核去重。

---

### S1 归属与验收补充

- **跨仓库**：本仓库负责共用 Supabase 中的专属备份元数据、RPC、Edge 和接口测试；AisenLens 自己仓库负责客户端界面、业务额度、Free/Pro 功能、Diff/恢复逻辑。跨仓任务必须分别交付证据，不能假设客户端已在 AisenCore 中实现。
- **可信身份**：reserve/finalize/delete 始终以可信 JWT/受保护 RPC 确认 owner，禁止接受可伪造的目标 user_id。每次新的 GET 签名要复核属主、blocked、产品成员及当前 Pro 资格；预留逻辑过期与物理 R2 孤儿清理必须分别处理。
- **输入与存储**：U09 未确认时不公开真实备份接口。白名单 Schema 优先于关键词匹配；本地 Mock/兼容网关 PASS 不得冒充真实 Cloudflare R2 条件写与故障恢复的 PASS。

## 3. 阶段 S1 退出门禁清单（Exit Gate Checklist）

- [ ] `REV-DEC02-01` ~ `REV-DEC02-08` 全部正负向与故障注入测试 100% PASS。
- [ ] 核查确认 AisenCore 公共核心表（`products`, `entitlement_grants`）未混入任何 AisenLens 专属业务功能开关或配额列（符合 `REV-DEC04-01~05`）。
- [ ] 客户端代码中无任何 R2 长期凭证，AI 分析路径零经过 AisenCore 服务器。
- [ ] 同步更新 `docs/Plans/aisencore-mvp/s1-aisenlens-r2-backup.md` 验证记录与 `docs/Plans/TODO.md`。


---

## 4. 验证记录（Verification Log）

| 日期 | 命令或场景 | 退出码/结果 | 范围与限制 |
| --- | --- | --- | --- |
| 待执行 | `REV-DEC02-01` ~ `08` Edge 白名单 JSON 校验、R2 条件写与故障注入恢复 | `NOT RUN` | 须在 D2 准出后执行；U09/U10 未冻结前使用集中可配置常量 |
