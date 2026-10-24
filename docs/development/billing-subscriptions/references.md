# 兑换码与支付订阅开发参考

> 本文件记录**外部参考**，不是批准使用这些 SDK/开源项目，也不代表已完成接入。以各服务商最新官方文档及实际账户权限为准。

## 当前优先：自有兑换码与管理界面

| 资料 | 官方/源码入口 | 适用场景 |
| --- | --- | --- |
| React-admin 管理框架 | [GitHub：marmelab/react-admin](https://github.com/marmelab/react-admin) | 在 Admin 提供兑换码与产品 Pro 授权等管理页面 |
| React-admin Data Provider | [GitHub：Data Providers 文档](https://github.com/marmelab/react-admin/blob/master/docs/DataProviders.md) | 将列表、创建、查询等操作与受保护 API 衔接 |
| React-admin 身份与授权 | [GitHub：Authentication 文档](https://github.com/marmelab/react-admin/blob/master/docs/Authentication.md) | 管理界面的登录状态与操作许可；**服务端授权仍不可省略** |
| Supabase Edge Functions | [官方文档](https://supabase.com/docs/guides/functions) | 可信服务端创建兑换码、完成兑换和处理外部订单通知 |
| Supabase Edge Functions 安全 | [官方文档](https://supabase.com/docs/guides/functions/auth) | 区分已登录用户 API 与外部 Webhook 的调用身份/安全边界 |
| Supabase PostgreSQL RLS | [官方文档](https://supabase.com/docs/guides/database/postgres/row-level-security) | 保护普通用户查询与产品/用户授权数据 |

## 初期暂定：爱发电（Afdian）

| 资料 | 官方入口 | 适用场景与注意事项 |
| --- | --- | --- |
| **爱发电开发者 API 与 Webhook** | [官方开发者文档](https://guide.afdian.com/creator/developer) | **首要参考**：Webhook 订单通知、API 查询历史订单/赞助者、API 请求的签名规则、订单字段及回调响应格式 |
| **爱发电开发者后台** | [开发者配置入口](https://afdian.net/dashboard/dev) | 将来配置 Webhook、获取 API 所需的开发者身份与 Token（真实秘密不得放入文档） |
| **Supabase Edge Functions 安全** | [官方文档](https://supabase.com/docs/guides/functions/auth) | 外部 Webhook 不携带 Supabase 登录 JWT，需要在函数内部按**提供方实际支持的可信验证方式**核实请求并核对订单 |

**重要核对点**：爱发电官方文档明确建议 Webhook 与订单查询 API 结合使用，提示网络异常时可能漏推送、未来可能重复推送。**API 主动请求爱发电时的签名算法，不等于平台向我方发送 Webhook 的验签机制**；正式实施时必须核实回调真实来源、订单状态、金额/套餐、对应产品和 AisenCore 用户的可信关联，不能仅依赖收到一条回调。官方页面可能更新缓慢，实施前需重新核对可用字段和服务条款。

## 后期支付参考（目前不接入）

| 方向 | 官方资料 | 状态 |
| --- | --- | --- |
| 支付宝个体工商户支付 | [支付宝开放平台](https://open.alipay.com/) | 待具备个体工商户与商户资质，再筛选准确的产品/API 资料 |
| Stripe | [Stripe 官方开发文档](https://docs.stripe.com/) | 更后期根据开户资格和实际需要再评估，不从此处引入 Stripe 依赖 |

## 开源项目与案例复用原则

**可用作参考的成熟开源框架**是已选定的 React-admin，以及 Supabase 官方提供的 Edge Functions 示例。对于爱发电的第三方 SDK、Webhook 中间件和支付示例仓库，目前**尚未逐一核对活跃度、开源许可证、安全性与适配成本，因此不把任意社区仓库标为已选方案**。真正对接时再把经过审核的项目名称、原仓库链接、许可证、采用或不采用的理由补到本节。

本文件只列已知参考，不存放复制的密钥、可用的真实订单号或敏感账户资料。