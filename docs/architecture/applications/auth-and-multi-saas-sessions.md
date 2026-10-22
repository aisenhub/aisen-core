# 统一登录、邮件验证与多 SaaS 会话架构

> 状态：MVP 登录体验与会话边界的架构决定；实际邮件服务商、授权回调域名、跨站体验与客户端实现细节需在产品上线前配置和验证。复用 Supabase Auth，不自建认证或无感 SSO 系统。

## 1. 核心身份方案

- 所有产品复用**一个公共 Supabase Auth 身份源**及稳定 `auth.users.id`；邮箱只作登录与联系资料，非跨产品主键。
- 首版：**邮箱 + 密码**；Supabase Auth **启用 Confirm Email**，未确认邮箱不能取得正式可用会话，不再自行增加一套邮箱核验分支；正式开放前验证密码找回和可靠邮件发送能力。OTP/免密链接、Google、微信（非默认内置）、手机登录、企业身份后续按需评估。
- **登录只建立身份会话，不自动加入任何 SaaS**；只有首次进入需要账号的合法产品服务时，按已确认的双路径调用 `EnsureMembership`。
- 统一 Auth 并不等于跨不同顶级域名/桌面应用共享浏览器 Cookie、刷新令牌或自动无感登录。首版接受各应用分别完成登录、持有自己的会话；不搭建中心化 OAuth 代理、专门 SSO 网关或跨站令牌同步服务。

## 2. 各类应用的登录流程

| 产品形态 | 入口与会话 | 成员触发点 |
| --- | --- | --- |
| 云端浏览器 SaaS | 应用使用受支持的 Supabase Auth 官方客户端/服务端流程登录并维护会话；各源站自己处理安全存储与回调 | 用户首次合法请求需要登录的产品业务时，由可信 SaaS 后端用现有用户 JWT 请求公共 `EnsureMembership` |
| 纯本地优先 | 匿名免费功能可离线使用；需要云端账号/Pro/私有备份时再登录 | 本地客户端以本人 JWT 直调同一公共用户 `EnsureMembership` |
| 混合 SaaS | 本地与云端会话按执行位置分层，公共身份同一 `user_id` | 需登录的云端能力参照云端，纯本地免费能力不触发 |
| React-admin | 内部受保护登录入口；UI 只负责导航与界面状态 | 不借 Admin 登录自动加入全部产品，管理权限由可信服务端单独核验 |

MVP 尽量用 Supabase 官方 Auth SDK 的登录、令牌刷新、登出与密码重置机制。浏览器部署需正确配置允许的回调/重定向地址、防开放重定向及 HTTPS；若采用服务端渲染/PKCE，要按框架使用受支持方案，不自行手写交换令牌与存储协议。桌面端回调与凭据存储按具体客户端能力实现，不能把 refresh token 记入本地备份或日志。

**低请求量会话原则（MVP）**：由 SDK 集中管理 `getSession` / `onAuthStateChange` 及必要刷新；`getSession` 读取本地存储且必要时可能联网，不等于可信服务器验签。采用非对称签名 JWT 时，`getClaims` 可以通过可缓存 JWKS 验签，而 `getUser` 会访问 Auth 服务器，因此禁止对每次 render、页面导航、Pro 按钮或 Admin 列表访问重复调用 `getUser`。信任边界和完整方案见[低请求量 Auth / Pro / MFA 专项](../../Plans/aisencore-mvp-auth-entitlement-mfa-efficiency-design.md)；普通用户 MVP **不强制 MFA**。

## 3. 邮箱确认、找回密码与账户恢复

- Supabase Auth 项目配置 **Confirm Email=on** 作为“确认邮箱后才可登录正式受保护业务”的唯一执行机制；应用负责提示和正确回调，不另造应用层 `email_verified` 访问判断。注册时不自动创建产品成员。
- 使用 Supabase Auth 的确认邮件和密码重置流程；重置时要求使用可信、单次/时效适当的链接与允许的回调地址。提示语避免向未授权人员泄露邮箱是否已注册。
- 生产环境邮件发送能力要验证到达率、退信与限额；默认邮件服务限制可能不满足实际用户规模，发信供应商和域名以后选择。
- 用户可用的恢复过程应清晰区分：密码找回、会话重新登录、产品成员 `left` 的明确重新加入、管理员解除 `suspended`、全局账号恢复。前两项不改变成员封禁。
- 内部管理员**必须**启用并完成 Supabase Auth 的 **TOTP MFA**：`aal1` 只能进入官方 TOTP enroll/challenge/verify，取得新的可信 `aal2` JWT 后才能查询 `admin_check_access` 及任何管理数据；管理 RLS 与 RPC 还要读取当前管理员名册和 blocked。只读 Auth Admin Edge **先验 JWT/`aal2`、用该原 JWT 复核当前资格，之后才执行服务端 Auth Admin 查询**，详细的最小权限与在途撤权窗口见 [F04 安全收敛](../../Plans/aisencore-f01-f04-security-convergence-design.md#5-f04管理员-totp当前资格与-auth-admin-密钥链)；按[管理员专项](../domains/platform-admin-and-account-lifecycle.md)执行，不自建 2FA。
- **2026-10-22 用户进一步确认 Admin TOTP MFA 为 MVP 必做**：一次可信 challenge/verify 建立 `aal2` 会话后，**普通列表读/管理 RPC 用现有 JWT 在同一业务请求/事务内检查 MFA 等级和实时管理资格，不额外串行调用 MFA/Auth API、也不每操作弹验证码**；刷新后真实 `aal` 若降级或会话失效，须重新完成必要挑战。UI `checkAuth/canAccess` 可短期缓存导航资格，但不得让后端信任缓存。因素丢失恢复属 MVP 验收，真实备用账号身份尚待确定。

## 4. 会话、登出与失效语义

- 各产品内可维持自己的访问/刷新令牌会话，**登录/登出本产品默认不刻意影响其他 SaaS**；需要统一“从所有设备退出”时再明确触发全局会话终止，且提示影响范围。
- Supabase Auth 的 `signOut` 支持不同作用范围；实现时须**显式选择本地会话登出**以避免不同 SDK 默认作用范围不同或误杀其他产品会话。全局登出由用户明确请求或严重安全事件触发。
- Access JWT 与刷新令牌生命周期独立。撤销刷新令牌或禁用登录不代表已签发 JWT 当场失效；对平台封禁、产品封禁、Admin 敏感操作分别读取可信当前限制/成员/管理状态。
- MVP 无需强制“一人单设备”、跨设备踢下线或自定义会话数据库。多设备允许并存，按 Supabase Auth 原生刷新和到期机制运作；安全敏感操作可在必要时校验会话 ID 的最新状态。
- 临时网络不可用时不能把“未能在线验证”误认为用户被封禁；云端新受保护操作不默认放行，本地离线免费功能继续可用；本地 Pro 按启动联网 + 关键操作合理复核，不能承诺无限离线授权。
- **权益查询与 Auth 刷新分开**：`check_access` 是数据库只读权益 RPC，不要求每次查询先 `getUser()` 或强制 refresh JWT；本地 Pro 按需、single-flight 去重，15 分钟是待测新鲜度而非固定轮询。Auth Admin Edge 另有可信资格查询例外；MFA 与角色不因减少客户端请求而削弱。

## 5. 跨产品身份与会话安全

- `product_key` 是要访问的公共产品，不是登录提供商身份；公共 `user_id` 连接各 SaaS 数据，项目/文件权限仍由各 SaaS 决定。
- 每个 SaaS 独立持有自己来源的浏览器会话或客户端安全存储；不通过 URL 参数、跨源 localStorage 复制、共享 refresh token 或前端手工转发高权限密钥实现“伪 SSO”。
- **各独立 SaaS 后端验证 AisenCore JWT**：公共 Supabase Project 使用非对称签名密钥，SaaS 从该项目 `/auth/v1/.well-known/jwks.json` 获取可缓存且可刷新轮换的 JWKS；验证签名、允许的算法与 `kid`、固定预期 `iss`（公共 Auth 发行者）、`aud`、`exp`、必要的 `sub`、`nbf`，拒绝不合法密钥/过期签名，不把浏览器可写元数据当权限。SaaS 不共享 JWT 对称签名秘密或平台级 service_role。关键时刻仍向公共 `check_access` 查询当前平台限制、产品/成员及权益，不能只信 JWT。
- 普通用户不能通过更改可写的 Auth `user_metadata` 升级权限，浏览器不得持有 `service_role`/secret。
- 若 SaaS 的业务数据位于**另一 Supabase Project**，那个项目的默认 Auth/RLS **不自动认得** AisenCore JWT。MVP 默认：SaaS 自己的可信后端验公共 JWT，并用自己业务库的后端凭据执行严格的用户/资源授权；也可把数据放在公共 Project 的隔离 Schema（正确配置 GRANT/RLS）。Supabase 对第三方 JWT 的原生支持随具体版本另行核验，不能假定直接透传即可跨 Project 使用原生 RLS。
- **共享单一 Auth Project 的固有限制**：各产品共用 Site URL、允许的 redirect URL 清单、邮件模板/发件人、SMTP 配额、密码策略、Auth 速率限制；确认/重置邮件不会天然随产品自动切换品牌，最多由受控 `redirect_to` 进行有限导航区分。上线新 SaaS 前审核合法回调清单、邮件品牌/通知文案与配额影响。
- 产品级 `suspended` 只影响该产品，平台级账号限制影响全部受保护产品；两者均不要求修改其他产品的业务数据。

## 6. MVP 验收与后续

- 同一邮箱/密码身份登录两个 SaaS 后具有同一 `user_id`，但无需共享登录态；只使用产品 A 不会自动加入产品 B。
- 未验证邮箱、密码重置链接过期、错误回调地址与退出会话的异常路径均能被正确拒绝或引导。
- 在 SaaS A 登出默认不影响 B；显式全局登出需明确告知用户影响范围，已签发短期 JWT 的实际失效窗口须如实处理。
- 本地匿名 Free 不要求登录；首次需登录服务才触发成员；本地 Pro 按既定在线复核。
- 管理员资格和 `aal2` 必须由管理 RPC/RLS 复核；跨 Project SaaS 需验证非对称 JWT 的签名、iss/aud/exp 并单独核验具体资源权限；单项目共享回调/发信/安全配置限制应在上线清单中检查。
- **MVP Admin MFA 真实验收**：完成首次 TOTP enroll、challenge/verify、新 `aal2` JWT、正常会话不逐请求再次挑战、会话刷新/新登录/AAL 降级与因素遗失恢复；在列表和写 RPC 中量测额外 Auth/MFA HTTP 应为 0（不包括实际 JWT 刷新、必要新 MFA），参照 [AUTH-P06～P11](../../Plans/aisencore-mvp-auth-entitlement-mfa-efficiency-design.md#43-admin-测试矩阵全部-not-run)。
- 产品封禁及平台全局阻断在新关键授权判断时不可被旧 JWT 中的过期权限声明绕过。

不在首版建设第三方身份融合、跨域无感 SSO、通用用户画像、多设备风控平台；具体邮件供应商、回调清单、各产品界面文案及日常会话参数在上线前按产品确定。**MFA 强制策略与邮箱确认开关已确定**，不是实施时的任选项。

参见：[管理员与账号生命周期](../domains/platform-admin-and-account-lifecycle.md)、[公共 SaaS API](../backend/public-api-and-saas-integration.md)、[API 契约与验收](../backend/api-contract-and-mvp-acceptance.md)。

官方依据：[Supabase Sessions](https://supabase.com/docs/guides/auth/sessions)、[Signing out](https://supabase.com/docs/guides/auth/signout)。
