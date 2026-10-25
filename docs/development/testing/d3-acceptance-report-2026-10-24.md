# AisenCore D3 Admin 真实验收报告（2026-10-24）

状态：**本地已实现测试 PASS；完整 D3 退出门禁仍未通过**。全部执行对象均为本机 `E:\Projects\Aisencore`、Supabase `127.0.0.1:55321` / PostgreSQL `127.0.0.1:55322`，未连接真实 SaaS；没有 Git commit/push/生产部署。长期 demo 与固定开发管理员必须保留。

## 1. 可重复验证命令

在仓库根目录、本地 Docker / Supabase 已启动且 `apps/admin/.env.local` 已就绪后执行：

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm audit --prod
pnpm build
pnpm dlx supabase test db --local
python scripts/test-d1-concurrency.py
node scripts/test-d2-auth-api-mfa.mjs
node scripts/test-d3-missing-config.mjs
node scripts/test-d3-browser-smoke.mjs
node scripts/test-d3-bundle-secrets.mjs
node scripts/test-d3-source-boundaries.mjs
node scripts/test-d3-authenticated-pages.mjs
$env:AISENCORE_UIQA_PREVIEW='1'; node scripts/test-d3-authenticated-pages.mjs
git diff --check
```

注意：D3 浏览器真实写入脚本会创建**随机临时**管理员、普通账号、产品、成员、Pro 授权及兑换码，执行真实受保护操作，然后按归属清理并检查是否删除成功。只有隔离本地数据库才能运行。正式预览独立端口 3396，临时 Chrome 用户目录，不会操作正常打开的 3000 端口会话。测试验证码、一次性兑换码及凭证不得截图、记录或上传。

## 2. 执行结果摘要

| 检查 | 结果 | 证据与限制 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS | lockfile 无变动、供应链策略检查通过 |
| `pnpm typecheck` | PASS | TypeScript 构建 |
| `pnpm lint` | PASS | 0 errors / 0 warnings |
| `pnpm audit --prod` | PASS | 0 known vulnerabilities（本次即时结果） |
| `pnpm build` | PASS | Vite 8 共 2362 modules；主要 JS 216/308/366/428 kB，无 >500kB 警告 |
| `supabase test db --local` | **PASS，286/286** | 6 个 pgTAP SQL 文件，数据库保持长期 demo 与管理员数据；SQL claim 是模拟而非签名 JWT |
| `python scripts/test-d1-concurrency.py` | **PASS，7/7** | 独立 PostgreSQL 双连接真实锁等待，不是模拟延迟；包括续期、抢码、管理员互撤和限流 |
| `node scripts/test-d2-auth-api-mfa.mjs` | **PASS（例外如下）** | 本地实际 GoTrue/Kong/PostgREST/Mailpit、签名 JWT、TOTP AAL2、RLS、HTTP 拒绝、独立会话、Mailpit 找回密码；最后管理员 HTTP 409 条件不成立见第 5 节 |
| `node scripts/test-d3-authenticated-pages.mjs` | **PASS** | 隔离 Chrome + 真实 TOTP AAL2；全部 10 个其余列表、8 类详情、表单；真实读写、响应式、身份治理和清理 |
| `AISENCORE_UIQA_PREVIEW=1` 同脚本 | **PASS** | 正式构建的 `vite preview`，非开发模式，功能与数据库真实测试复验一致 |
| 缺配置引导 / 登录烟测 | PASS | 两个独立 Chrome 测试，不能冒充实际登录 |
| 打包密钥扫描 | PASS | 静态 JS 不含服务端高权限 secrets，不代表 HAR/全网络证明 |
| 源码安全边界扫描 | PASS | 22 个前端模块 |
| `git diff --check` | PASS | 文件补丁格式无错误 |

## 3. 真实浏览器写入与安全事实

- 产品：创建全新草稿；通过有理由的管理对话框启用、暂停、恢复，数据库及对应审计核对。
- 成员：使用临时账号加入临时产品；真实 `active → suspended → active` 与 `left → suspended → left`，暂停原状态与 4 条管理员事件一致。
- Pro：人工授予 30 天时长，核对真实数据库与审计；从详情撤销，验证 revoked_at。
- 兑换码：首次发行，码明文仅暂存当前页面组件内存；实际 TXT/UTF-8 BOM CSV 下载并在临时文件核对一致性，未打印/截图明文。确认保存、关闭后清空；sessionStorage/localStorage/URL 中无明文。历史码摘要不包含 `code_hash`，REST 直接 SELECT 哈希受拒。
- UNKNOWN：真实产生批次的既有 request_id 通过 UI 查到并撤销；相同幂等请求重放 `plaintext_available=false`。不存在的 request_id 经 UI 校验后**原编号重试一次**，产生唯一批次；未注入真正的中途断网故障。
- 单码与 Grant 撤销：实际 UI 操作并核对数据库变化。
- 账号治理：普通账号/管理员仅 AAL1 的特权 RPC 都拒绝；对临时普通账号 UI 封禁/解封、赋予/撤销管理员，核查四条审计；被撤销的旧 AAL2 token 再调用 privileged RPC 立即受拒。
- 作用域：`aisenlens` 无 demo 成员时，UI 空状态可点击恢复到全平台 48 条成员；邮箱精确 RPC 正确返回目标用户。
- 响应式与键盘：320/390/768/1000/1280/1440 CSS px × 5 页 = 30 组页面横向溢出检查 PASS；Tab 焦点可落在有名称的元素；Escape 不触发敏感状态变更。
- 临时数据：脚本对随机管理员、普通账号和产品执行精确清理、验证身份与产品行消失，清理失败即退出码非零；长期 demo 和固定管理员未更改。

## 4. D3-UI-X01～X18 验收矩阵

该矩阵对应 `docs/architecture/applications/admin-console.md` 定义，不等同于 18 项全 PASS。**PARTIAL** 表示已经实际验证有代表性的关键正/负场景，但原合同尚有未覆盖子条款。

| 编号 | 状态 | 已验证 / 仍需 |
| --- | --- | --- |
| X01 | PARTIAL | 30 组布局无整页横向溢出；尚需更多实际设备、系统缩放、裁切和遮挡检查 |
| X02 | PARTIAL | 管理概览来自实际授权查询、列表来源数据库；尚需逐 KPI 业务交叉核算 |
| X03 | PARTIAL | 签名 AAL2 管理员可进入，普通用户与 AAL1 特权 API 拒绝；尚需所有未认证路由拦截验证 |
| X04 | PARTIAL | 真实 MFA 会话、撤权后旧 AAL2 立刻拒绝；尚未抓取全部翻页过程的 MFA/身份请求计数 |
| X05 | PARTIAL | 产品列表/新建/暂停/恢复、服务端审计 PASS；尚需完整分页、竞争/输入负例 |
| X06 | PARTIAL | UUID/邮箱受限查询及签名 JWT，50 UUID 本地 15 次 HTTP 性能 smoke；不构成 DEC-06 规模验收 |
| X07 | PASS（规定的状态链） | active 与 left 两条暂停/恢复真实 UI、数据库与事件核验通过 |
| X08/X09 | 已取消 / 替代 | 历史套餐克隆与冻结用例取消；需按 Pro 授权与发码事实约束审核 |
| X10 | PARTIAL | duration 30 天、Grant 撤销、SQL explicit_window/永久相关约束；UI 互斥与超时全路径未覆盖 |
| X11 | PARTIAL | 真正发行、单次约束、幂等与 D2 的 HTTP 422；边界参数与重复提交的浏览器负例待补 |
| X12 | PARTIAL | 首响明文、TXT/CSV、存储/URL 不泄露、清除 PASS；未完成 Network HAR/Cache-Control 全测 |
| X13 | PARTIAL | UNKNOWN 已存在与不存在路径、原编号重试、撤销 PASS；未注入真实丢失响应/503 |
| X14 | PASS（可访问字段约束） | Redacted view 仅安全字段；哈希读取拒绝；无历史明文回显 |
| X15 | PARTIAL | 产品/成员/平台封禁/管理员撤权对本地实际生效；“全系统唯一管理员”HTTP 409 无安全前置条件见下 |
| X16 | PARTIAL | HTTP 401/403/409/422、状态拒绝、UNKNOWN UI；429/503/断网/超时全组合未完成 |
| X17 | PARTIAL | 30 断点页面、Tab 焦点、Escape 不误提交；完整 WCAG 2.2 AA、读屏、IME、颜色对比未审 |
| X18 | PARTIAL | 正式构建秘密扫描、特权 RPC 与存储校验、静态边界；未做正式部署 HAR/全网络安全审计 |

## 5. 不可误报为已验收的事项与环境限制

1. **真实“全平台最后一名管理员”的 HTTP 409**：已有固定开发管理员处于 active 状态，不能为了构造最后一名而封禁或撤销用户真实本地资格。SQL pgTAP 使用事务 SAVEPOINT 局部调整并回滚以测试同一 invariant；D2 HTTP 套件动态检测额外管理员，在该条件下正确验证撤销合成管理员后旧 AAL2 失权，明确标记 HTTP 409 特定条件 **NOT RUN**。
2. **真实 429/503/断网/浏览器失焦/令牌过期/设备丢失、全部无障碍**：尚未完成稳定故障注入与逐用例严格验收，不能因为主要 happy paths PASS 就宣布完整。
3. **用户主观视觉奖项标准/实际设备签收**：自动化无法取代项目所有者的最终 UX/视觉签收，不得宣称 “无可见改进余地”。
4. **历史 D2 QA 账号清理**：曾检测到一条早期失败的 `d2-...-user@example.invalid` 测试账号。经验证它没有管理员、成员、Pro、批次、核销、审计或限流引用后，使用精确 UUID+完整合成测试邮箱及无业务引用的 SQL 条件删除。最终查询 `ephemeral_auth=0`、`qa_products=0`、`demo_products=4`。仅删除这个孤立的测试账号，未清空真实数据或固定管理员。
5. **没有真实 SaaS、暂不生产部署**，任何线上压力测试、运维验收和 MFA 恢复责任都不能基于隔离本地数据签收。

## 6. 本轮测试发现并修复的测试隔离问题

保留演示数据库意味着对整张表的 `count(*)`、无过滤 `LIMIT 1` 以及假定只有两个管理员的用例不再可靠。仅修改了 pgTAP 四个 SQL 测试文件、D1 并发脚本和 D2 HTTP 验证脚本的合成作用域与环境前置条件，**没有更改生产数据库业务约束、永久开发账号或演示记录**。修复后 pgTAP **286/286**、实际并发 **7/7**、真实 D2 HTTP、D3 dev 和 production preview 全 PASS（各有上述范围限制）。

最终状态：**已实现的本地可自动执行测试通过；D3 18 项完整退出门禁未获签收**。
