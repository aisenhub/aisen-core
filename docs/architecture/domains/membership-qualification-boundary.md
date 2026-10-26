# AisenCore 轻量会员认证边界

> **现行职责约束**：公共 Core 不存储或计算 SaaS 的 Free/Pro 功能、额度和版本，不存在公共 `plans`、`products.free_features/free_limits` 或 `CheckAccess(..., capability)`。本文件只规定领域边界，不代表所有数据库/API/安全能力已实现。

## 公共后端仅认证身份、产品成员和 Pro 资格

AisenCore 保存 Auth 身份、公共账号限制、产品运行状态、按产品独立的成员关系（active/left/suspended）、同产品 Pro 授权事实、开始/截止时间、明确永久、来源、兑换码与核销、撤销、幂等、最小审计、管理员与 MFA。Free 不是可授予计划、Grant 或兑换码，而是“当前无有效 Pro”的派生展示；不在用户/成员行写持久 is_pro。

`GetMyProducts` / `CheckAccess(product_key)` 查询可信当前资格：账号/产品/成员准入与稳定拒绝理由、tier=free|pro、pro_active、当前有效期/可续期末期、is_lifetime、evaluated_at 等。未来开始的 Grant 不提前激活；其他 Pro 仍有效时不会因为一条到期/撤销就误降级。401 与 503 不是业务 Free/denied。业务中的具体功能/额度不由公共 API 判断，不返回 `features`、`limits`、`capability`、余额或导出权限。

## SaaS 负责业务策略、计量及执行

AisenLens、AisenNote 各自定义 Free/Pro 功能、4K 导出/水印、次数上限、备份额度、产品配置与版本发布。桌面本地操作由客户端校验（不能保证抗本机篡改）；**可信的云端导出/私有文件/备份必须在对应 SaaS 的后端/Edge 重新验证身份、产品会员资格、资源所有权、自有额度并原子执行**。部署在同一套 Supabase/Edge/R2 基础设施并不改变职责归属。

AisenLens 已确认的匿名本地 Free 能离线且不登录。已确认的 R2 私有配置备份需求继续保留为 AisenLens 专项存储流程，遵守既有 DB/R2/Edge 签名与防 TOCTOU 安全合同，但不纳入通用会员功能策略引擎。跨 SaaS 用户反馈已形成[独立公共反馈领域合同](./user-feedback.md)，目前三表/RLS、可信 RPC、Edge 与 Admin 反馈页面有本地代码，但反馈真实端到端闭环尚未验收；它不属于会员资格/配额，不因提交反馈而自动加入产品或授予 Pro。

## Pro 等级与授权期限分离

MVP 只有每产品 Pro 资格；30 天、365 天、永久是**发码与直授的期限预设或参数**，不是三套独立的功能方案。历史 Grant 的 product/tier、来源、首次可信计算的时段、撤销与幂等必须保存且不可偷改。`duration` 按同用户同产品 Pro 可信顺延，`explicit_window` 要求完整的 start/end（显式 null 才永久）；周期/永久和未来授权要正确合并。原有自有码的明文仅首响、UNKNOWN 核查、精确撤销重发、M1 最后管理员和 AAL2 不因去除功能版本而失效。

新产品功能的发布只修改 SaaS 自身策略，不创建公共 `pro_v2` 或冻结功能快照；不必建设 `plans` 表作为 Pro 功能版本库。如果保留一个发行“期限模板”的运营对象，它只能含 Pro、期限、展示名称和启停配置，不能含功能/额度；本轮默认更简化为界面期限选项。未来 Team/Enterprise、多档定价、赠品/试用和旧用户专属权益有真实需求时再立项。

## 防越界的验收例子

调整 AisenLens 4K 导出限制、AisenNote PDF 导出次数、AI Key 本地策略和 R2 备份业务额度，不应要求 AisenCore schema/RPC/Admin Pro 配置改动；AisenCore 仅提供可信 Pro 状态，业务由对应 SaaS 可信执行端落实。新增 Pro 30天码、365天码、永久直授、单条或多条 Grant 到期、封禁/暂停及 UNKNOWN 仍需要完整公共安全与时段验收。
